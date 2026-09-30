import { getDb } from '$lib/db/database';
import type { AttendanceRecord, AttendanceSession, SchoolClass, Student } from '$lib/types';
import { aggregateStudentStats } from '$lib/attendance/rules';
import { formatDateOnly, formatMonthYear, inDateRange, monthKey } from '$lib/utils/time';

/**
 * Reporting aggregation.
 * Returns plain data structures; the exporters (xlsx/csv/pdf) format them.
 * All queries are local (IndexedDB) and scoped by the caller's filters to stay fast.
 */

export interface ReportFilters {
	classId?: string;
	/** `YYYY-MM` for monthly reports. */
	month?: string;
	/** `YYYY-MM-DD` single-day for daily reports. */
	date?: string;
	from?: string;
	to?: string;
	academicYear?: string;
	semester?: string;
}

export interface ClassLookup {
	classes: Map<string, SchoolClass>;
	students: Map<string, Student>;
}

async function buildClassLookup(): Promise<ClassLookup> {
	const db = getDb();
	const [classes, students] = await Promise.all([db.classes.toArray(), db.students.toArray()]);
	return {
		classes: new Map(classes.map((c) => [c.id, c])),
		students: new Map(students.map((s) => [s.id, s]))
	};
}

/** Filter sessions by the report filter set. */
async function filteredSessions(filters: ReportFilters): Promise<AttendanceSession[]> {
	let sessions = await getDb().attendanceSessions.toArray();
	if (filters.classId) sessions = sessions.filter((s) => s.classId === filters.classId);
	if (filters.date) sessions = sessions.filter((s) => s.date === filters.date);
	if (filters.month) sessions = sessions.filter((s) => monthKey(s.date) === filters.month);
	if (filters.from || filters.to)
		sessions = sessions.filter((s) => inDateRange(s.date, filters.from, filters.to));
	return sessions;
}

export interface DailyReportRow {
	date: string;
	className: string;
	nis: string;
	name: string;
	time: string;
	status: string;
}

export interface MonthlyReportRow {
	nis: string;
	name: string;
	className: string;
	present: number;
	late: number;
	permission: number;
	sick: number;
	absent: number;
	total: number;
	percentage: number;
}

const STATUS_LABELS: Record<string, string> = {
	present: 'Hadir',
	late: 'Terlambat',
	permission: 'Izin',
	sick: 'Sakit',
	absent: 'Alpa'
};

/** Daily: one row per attendance record. */
export async function buildDailyReport(filters: ReportFilters): Promise<DailyReportRow[]> {
	const sessions = await filteredSessions(filters);
	const sessionIds = new Set(sessions.map((s) => s.id));
	if (sessionIds.size === 0) return [];
	const sessionMap = new Map(sessions.map((s) => [s.id, s]));
	const lookup = await buildClassLookup();

	const records = await getDb()
		.attendanceRecords.where('sessionId')
		.anyOf([...sessionIds])
		.toArray();
	const rows: DailyReportRow[] = [];
	for (const record of records) {
		const session = sessionMap.get(record.sessionId);
		const student = lookup.students.get(record.studentId);
		if (!session || !student) continue;
		rows.push({
			date: session.date,
			className: lookup.classes.get(session.classId)?.name ?? '-',
			nis: student.nis,
			name: student.name,
			time: record.attendanceTime ? formatClock(record.attendanceTime) : '-',
			status: STATUS_LABELS[record.status] ?? record.status
		});
	}
	rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'id'));
	return rows;
}

/** Monthly: one row per student with H/T/I/S/A counts + percentage. */
export async function buildMonthlyReport(filters: ReportFilters): Promise<MonthlyReportRow[]> {
	const sessions = await filteredSessions(filters);
	const sessionIds = sessions.map((s) => s.id);
	if (sessionIds.length === 0) return [];
	const lookup = await buildClassLookup();

	let records: AttendanceRecord[] = await getDb()
		.attendanceRecords.where('sessionId')
		.anyOf(sessionIds)
		.toArray();

	// Scope to the students of the requested class (so 0-count students still appear).
	if (filters.classId) {
		const classStudentIds = new Set(
			[...lookup.students.values()]
				.filter((s) => s.classId === filters.classId && s.active)
				.map((s) => s.id)
		);
		records = records.filter((r) => classStudentIds.has(r.studentId));
	}

	const statsMap = aggregateStudentStats(records);
	const rows: MonthlyReportRow[] = [];

	// Include every active student (even with zero records) for accurate percentages.
	const students = [...lookup.students.values()].filter(
		(s) => s.active && (!filters.classId || s.classId === filters.classId)
	);
	for (const student of students) {
		const stats = statsMap.get(student.id);
		rows.push({
			nis: student.nis,
			name: student.name,
			className: lookup.classes.get(student.classId)?.name ?? '-',
			present: stats?.present ?? 0,
			late: stats?.late ?? 0,
			permission: stats?.permission ?? 0,
			sick: stats?.sick ?? 0,
			absent: stats?.absent ?? 0,
			total: stats?.total ?? 0,
			percentage: stats?.percentage ?? 0
		});
	}
	rows.sort((a, b) => a.name.localeCompare(b.name, 'id'));
	return rows;
}

/** Human label for a report period, for PDF/headers/share text. */
export function describePeriod(filters: ReportFilters): string {
	if (filters.date) return formatDateOnly(filters.date);
	if (filters.month) return formatMonthYear(filters.month);
	if (filters.from && filters.to)
		return `${formatDateOnly(filters.from)} – ${formatDateOnly(filters.to)}`;
	if (filters.from) return `Sejak ${formatDateOnly(filters.from)}`;
	if (filters.to) return `Hingga ${formatDateOnly(filters.to)}`;
	return 'Semua periode';
}

export async function classNameFor(classId?: string): Promise<string> {
	if (!classId) return 'Semua Kelas';
	const cls = await getDb().classes.get(classId);
	return cls?.name ?? 'Semua Kelas';
}

function formatClock(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '-';
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Summary line used by the text-share fallback. */
export interface ReportSummary {
	className: string;
	periodLabel: string;
	present: number;
	late: number;
	permission: number;
	sick: number;
	absent: number;
	total: number;
	percentage: number;
}

export async function buildReportSummary(filters: ReportFilters): Promise<ReportSummary> {
	const sessions = await filteredSessions(filters);
	const sessionIds = sessions.map((s) => s.id);
	const lookup = await buildClassLookup();

	let records: AttendanceRecord[] = sessionIds.length
		? await getDb().attendanceRecords.where('sessionId').anyOf(sessionIds).toArray()
		: [];

	const students = [...lookup.students.values()].filter(
		(s) => s.active && (!filters.classId || s.classId === filters.classId)
	);
	if (filters.classId) {
		const ids = new Set(students.map((s) => s.id));
		records = records.filter((r) => ids.has(r.studentId));
	}

	const counts = { present: 0, late: 0, permission: 0, sick: 0, absent: 0 };
	for (const record of records) counts[record.status] += 1;
	const total = students.length;
	const attended = counts.present + counts.late;
	return {
		className: await classNameFor(filters.classId),
		periodLabel: describePeriod(filters),
		...counts,
		total,
		percentage: total > 0 ? (attended / total) * 100 : 0
	};
}
