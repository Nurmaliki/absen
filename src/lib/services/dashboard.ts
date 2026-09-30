import { getDb } from '$lib/db/database';
import type { AttendanceSession, AttendanceStatusCounts, AuditLog } from '$lib/types';
import { summarizeSession, attendancePercentage } from '$lib/attendance/rules';
import { listStudents } from '$lib/db/students';
import { listRecordsForSession } from '$lib/db/attendance';
import { todayDate } from '$lib/utils/time';

/**
 * Dashboard aggregation service. Composes repositories; no direct UI concerns.
 */

export interface ClassBreakdown {
	classId: string;
	className: string;
	total: number;
	present: number;
	late: number;
	permission: number;
	sick: number;
	absent: number;
	unrecorded: number;
	percentage: number;
}

export interface DashboardData {
	date: string;
	totalStudents: number;
	todayCounts: AttendanceStatusCounts;
	todayPercentage: number;
	openSessions: AttendanceSession[];
	classes: ClassBreakdown[];
	recentActivity: AuditLog[];
	unrecorded: Array<{ id: string; name: string; className: string }>;
	faceRegistered: number;
	faceTotal: number;
}

export async function loadDashboard(): Promise<DashboardData> {
	const db = getDb();
	const date = todayDate();

	const [classes, students, allRecords, sessions, auditLogs] = await Promise.all([
		db.classes.toArray(),
		db.students.toArray(),
		db.attendanceRecords.toArray(),
		db.attendanceSessions.where('date').equals(date).toArray(),
		db.auditLogs.orderBy('createdAt').reverse().limit(10).toArray()
	]);

	const activeStudents = students.filter((s) => s.active);
	const classById = new Map(classes.map((c) => [c.id, c]));

	// Records that belong to today's sessions.
	const todaySessionIds = new Set(sessions.map((s) => s.id));
	const todayRecords = allRecords.filter((r) => todaySessionIds.has(r.sessionId));

	const todayCounts = summarizeSession(activeStudents, todayRecords);

	// Per-class breakdown across today's sessions.
	const classBreakdowns: ClassBreakdown[] = classes
		.filter((c) => c.active)
		.map((cls) => {
			const classStudents = activeStudents.filter((s) => s.classId === cls.id);
			const classSessionIds = new Set(
				sessions.filter((s) => s.classId === cls.id).map((s) => s.id)
			);
			const classRecords = todayRecords.filter((r) => classSessionIds.has(r.sessionId));
			const counts = summarizeSession(classStudents, classRecords);
			return {
				classId: cls.id,
				className: cls.name,
				total: counts.total,
				present: counts.present,
				late: counts.late,
				permission: counts.permission,
				sick: counts.sick,
				absent: counts.absent,
				unrecorded: counts.unrecorded,
				percentage: attendancePercentage(counts)
			};
		});

	// Students not yet recorded today (across all open/today sessions).
	const recordedToday = new Set(todayRecords.map((r) => r.studentId));
	const unrecorded = activeStudents
		.filter((s) => !recordedToday.has(s.id))
		.map((s) => ({
			id: s.id,
			name: s.name,
			className: classById.get(s.classId)?.name ?? '-'
		}))
		.slice(0, 50);

	return {
		date,
		totalStudents: activeStudents.length,
		todayCounts,
		todayPercentage: attendancePercentage(todayCounts),
		openSessions: sessions.filter((s) => s.status === 'open'),
		classes: classBreakdowns,
		recentActivity: auditLogs,
		unrecorded,
		faceRegistered: activeStudents.filter((s) => s.faceRegistered).length,
		faceTotal: activeStudents.length
	};
}

export { listStudents, listRecordsForSession };
