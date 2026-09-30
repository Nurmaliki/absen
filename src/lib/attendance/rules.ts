import type {
	AttendanceRecord,
	AttendanceStatus,
	AttendanceStatusCounts,
	Student
} from '$lib/types';

/**
 * Pure attendance rules. Kept free of Dexie/UI so they can be unit-tested directly.
 * The repository layer (`$lib/db/attendance.ts`) persists the results of these rules.
 */

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
	present: 'Hadir',
	late: 'Terlambat',
	permission: 'Izin',
	sick: 'Sakit',
	absent: 'Alpa'
};

export const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'permission', 'sick', 'absent'];

/**
 * Decide present vs late from the local wall-clock minute-of-day vs the cutoff.
 * `minutesOfDay` is computed from the local Date so timezone can never flip the result
 * mid-day. When no cutoff is configured every on-time scan is `present`.
 */
export function resolveTimedStatus(minutesOfDay: number, lateAfter?: string): 'present' | 'late' {
	if (!lateAfter) return 'present';
	const cutoff = parseClockMinutes(lateAfter);
	if (cutoff === null) return 'present';
	return minutesOfDay > cutoff ? 'late' : 'present';
}

export function parseClockMinutes(value: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return h * 60 + m;
}

export function minutesOfDay(at: Date): number {
	return at.getHours() * 60 + at.getMinutes();
}

/** Manual statuses that operators can set; `absent` is auto-derived at close/reconcile. */
export const MANUAL_STATUSES: AttendanceStatus[] = [
	'present',
	'late',
	'permission',
	'sick',
	'absent'
];

/**
 * Aggregate records for one session into the live UI counters.
 * `unrecorded` counts active students with no record yet — they are NOT silently `absent`.
 */
export function summarizeSession(
	students: Student[],
	records: AttendanceRecord[]
): AttendanceStatusCounts {
	const activeStudents = students.filter((s) => s.active);
	const byStudent = new Map(records.map((r) => [r.studentId, r]));
	const counts: AttendanceStatusCounts = {
		present: 0,
		late: 0,
		permission: 0,
		sick: 0,
		absent: 0,
		unrecorded: 0,
		total: activeStudents.length
	};
	for (const student of activeStudents) {
		const record = byStudent.get(student.id);
		if (!record) {
			counts.unrecorded += 1;
			continue;
		}
		counts[record.status] += 1;
	}
	return counts;
}

/** Which active students have no record in the session (candidates for `absent`). */
export function unrecordedStudents(students: Student[], records: AttendanceRecord[]): Student[] {
	const recorded = new Set(records.map((r) => r.studentId));
	return students.filter((s) => s.active && !recorded.has(s.id));
}

/**
 * Attendance percentage uses recorded presence (present+late) over total active students.
 * Unrecorded students count against the percentage only once the session is closed
 * (they can be promoted to `absent`). This boolean keeps the two cases distinct.
 */
export function attendancePercentage(counts: AttendanceStatusCounts): number {
	if (counts.total === 0) return 0;
	const attended = counts.present + counts.late;
	return (attended / counts.total) * 100;
}

/** Aggregate per-student monthly stats from a flat record list. */
export interface StudentMonthlyStats {
	studentId: string;
	present: number;
	late: number;
	permission: number;
	sick: number;
	absent: number;
	total: number;
	percentage: number;
}

export function aggregateStudentStats(
	records: AttendanceRecord[]
): Map<string, StudentMonthlyStats> {
	const map = new Map<string, StudentMonthlyStats>();
	for (const record of records) {
		const stats =
			map.get(record.studentId) ??
			({
				studentId: record.studentId,
				present: 0,
				late: 0,
				permission: 0,
				sick: 0,
				absent: 0,
				total: 0,
				percentage: 0
			} satisfies StudentMonthlyStats);
		stats[record.status] += 1;
		stats.total += 1;
		map.set(record.studentId, stats);
	}
	for (const stats of map.values()) {
		stats.percentage = stats.total > 0 ? ((stats.present + stats.late) / stats.total) * 100 : 0;
	}
	return map;
}
