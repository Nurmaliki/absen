import { getDb } from './database';
import type { AttendanceRecord, AttendanceSession, AttendanceStatus } from '$lib/types';
import { uuid } from '$lib/utils/id';
import { clockTime, nowIso, todayDate } from '$lib/utils/time';
import { writeAudit } from './audit';
import { resolveTimedStatus } from '$lib/attendance/rules';

/** Thrown when a student already has a record in the session (anti-duplicate rule). */
export class DuplicateAttendanceError extends Error {
	constructor(public readonly existing: AttendanceRecord) {
		super('Siswa sudah melakukan absensi pada sesi ini.');
		this.name = 'DuplicateAttendanceError';
	}
}

export interface SessionInput {
	classId: string;
	date?: string;
	startTime?: string;
	lateAfter?: string;
}

/** Find an existing (typically open) session for a class on a date. */
export async function findSession(
	classId: string,
	date: string
): Promise<AttendanceSession | undefined> {
	const sessions = await getDb()
		.attendanceSessions.where('[classId+date]')
		.equals([classId, date])
		.toArray();
	// Prefer the open session if one exists.
	return sessions.find((s) => s.status === 'open') ?? sessions[0];
}

export async function getSession(id: string): Promise<AttendanceSession | undefined> {
	return getDb().attendanceSessions.get(id);
}

export async function listSessions(
	options: { classId?: string; from?: string; to?: string } = {}
): Promise<AttendanceSession[]> {
	let sessions = await getDb().attendanceSessions.orderBy('date').reverse().toArray();
	if (options.classId) sessions = sessions.filter((s) => s.classId === options.classId);
	if (options.from) sessions = sessions.filter((s) => s.date >= options.from!);
	if (options.to) sessions = sessions.filter((s) => s.date <= options.to!);
	return sessions;
}

export async function openSession(input: SessionInput): Promise<AttendanceSession> {
	const db = getDb();
	const date = input.date ?? todayDate();
	const existing = (
		await db.attendanceSessions.where('[classId+date]').equals([input.classId, date]).toArray()
	).find((s) => s.status === 'open');
	if (existing) return existing;

	const record: AttendanceSession = {
		id: uuid(),
		classId: input.classId,
		date,
		startTime: input.startTime ?? clockTime(),
		lateAfter: input.lateAfter,
		status: 'open',
		createdAt: nowIso()
	};
	await db.attendanceSessions.add(record);
	await writeAudit({
		action: 'open_session',
		entityType: 'attendanceSession',
		entityId: record.id,
		description: `Membuka sesi absensi ${date} ${record.startTime}`
	});
	return record;
}

/** Close a session and optionally promote unrecorded students to `absent`. */
export async function closeSession(
	sessionId: string,
	options: { markAbsentStudentIds?: string[] } = {}
): Promise<void> {
	const db = getDb();
	const session = await db.attendanceSessions.get(sessionId);
	if (!session) throw new Error('Sesi tidak ditemukan.');

	const timestamp = nowIso();
	await db.transaction('rw', db.attendanceSessions, db.attendanceRecords, async () => {
		await db.attendanceSessions.update(sessionId, { status: 'closed', closedAt: timestamp });
		for (const studentId of options.markAbsentStudentIds ?? []) {
			const existing = await db.attendanceRecords
				.where('[sessionId+studentId]')
				.equals([sessionId, studentId])
				.first();
			if (existing) continue;
			const record: AttendanceRecord = {
				id: uuid(),
				sessionId,
				studentId,
				status: 'absent',
				method: 'manual',
				notes: 'Ditandai alpa saat sesi ditutup',
				createdAt: timestamp,
				updatedAt: timestamp
			};
			await db.attendanceRecords.add(record);
		}
	});

	await writeAudit({
		action: 'close_session',
		entityType: 'attendanceSession',
		entityId: sessionId,
		description: `Menutup sesi absensi${
			options.markAbsentStudentIds?.length
				? `, ${options.markAbsentStudentIds.length} siswa ditandai alpa`
				: ''
		}`
	});
}

export async function listRecordsForSession(sessionId: string): Promise<AttendanceRecord[]> {
	return getDb().attendanceRecords.where('sessionId').equals(sessionId).toArray();
}

export async function getRecord(
	sessionId: string,
	studentId: string
): Promise<AttendanceRecord | undefined> {
	return getDb()
		.attendanceRecords.where('[sessionId+studentId]')
		.equals([sessionId, studentId])
		.first();
}

/**
 * Record attendance from a successful face recognition.
 *
 * Anti-duplicate is enforced here at the data layer (not merely in the UI): the
 * `[sessionId+studentId]` lookup runs inside the same transaction as the insert, so
 * two racing scans of the same student cannot both create a record.
 */
export async function recordFaceAttendance(params: {
	sessionId: string;
	studentId: string;
	lateAfter?: string;
	recognitionScore?: number;
	recognitionDistance?: number;
	at?: Date;
}): Promise<AttendanceRecord> {
	const db = getDb();
	const now = params.at ?? new Date();
	const timestamp = nowIso();

	return db.transaction('rw', db.attendanceRecords, db.auditLogs, async () => {
		const existing = await db.attendanceRecords
			.where('[sessionId+studentId]')
			.equals([params.sessionId, params.studentId])
			.first();
		if (existing) throw new DuplicateAttendanceError(existing);

		const status = resolveTimedStatus(now.getHours() * 60 + now.getMinutes(), params.lateAfter);
		const record: AttendanceRecord = {
			id: uuid(),
			sessionId: params.sessionId,
			studentId: params.studentId,
			status,
			attendanceTime: timestamp,
			recognitionScore: params.recognitionScore,
			recognitionDistance: params.recognitionDistance,
			method: 'face',
			createdAt: timestamp,
			updatedAt: timestamp
		};
		await db.attendanceRecords.add(record);
		// Audit shares the transaction so the record and its log commit atomically.
		await writeAudit({
			action: 'attendance_face',
			entityType: 'attendanceRecord',
			entityId: record.id,
			description: `Absensi wajah tercatat (${status})`
		});
		return record;
	});
}

/**
 * Manual attendance (operator selects the student). Same duplicate protection.
 *
 * The operator's explicit choice is honored as-is: if they pick "Hadir" or "Terlambat"
 * we store exactly that. Automatic present/late resolution only applies to *face scans*
 * (`recordFaceAttendance`), where the operator did not choose a status.
 */
export async function recordManualAttendance(params: {
	sessionId: string;
	studentId: string;
	status: AttendanceStatus;
	notes?: string;
	at?: Date;
}): Promise<AttendanceRecord> {
	const db = getDb();
	const timestamp = nowIso();

	return db.transaction('rw', db.attendanceRecords, db.auditLogs, async () => {
		const existing = await db.attendanceRecords
			.where('[sessionId+studentId]')
			.equals([params.sessionId, params.studentId])
			.first();
		if (existing) throw new DuplicateAttendanceError(existing);

		const status = params.status;

		const record: AttendanceRecord = {
			id: uuid(),
			sessionId: params.sessionId,
			studentId: params.studentId,
			status,
			attendanceTime: timestamp,
			method: 'manual',
			notes: params.notes,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		await db.attendanceRecords.add(record);
		// Audit shares the transaction so the record and its log commit atomically.
		await writeAudit({
			action: 'attendance_manual',
			entityType: 'attendanceRecord',
			entityId: record.id,
			description: `Absensi manual (${status})${params.notes ? `: ${params.notes}` : ''}`
		});
		return record;
	});
}

/** Correct an existing record's status/notes. Always audited. */
export async function correctAttendance(
	recordId: string,
	patch: { status?: AttendanceStatus; notes?: string }
): Promise<void> {
	const db = getDb();
	const existing = await db.attendanceRecords.get(recordId);
	if (!existing) throw new Error('Catatan absensi tidak ditemukan.');
	const timestamp = nowIso();
	await db.attendanceRecords.update(recordId, { ...patch, updatedAt: timestamp });
	await writeAudit({
		action: 'attendance_correction',
		entityType: 'attendanceRecord',
		entityId: recordId,
		description: `Koreksi absensi ${existing.status} → ${patch.status ?? existing.status}${
			patch.notes ? ` (${patch.notes})` : ''
		}`
	});
}

export async function deleteAttendance(recordId: string): Promise<void> {
	const db = getDb();
	const existing = await db.attendanceRecords.get(recordId);
	await db.attendanceRecords.delete(recordId);
	await writeAudit({
		action: 'delete_attendance',
		entityType: 'attendanceRecord',
		entityId: recordId,
		description: `Menghapus catatan absensi${existing ? ` (${existing.status})` : ''}`
	});
}

/** Records across many sessions, for history and reports. */
export async function queryRecords(
	options: { sessionIds?: string[]; studentIds?: string[] } = {}
): Promise<AttendanceRecord[]> {
	const db = getDb();
	let records: AttendanceRecord[];
	if (options.sessionIds?.length) {
		records = await db.attendanceRecords.where('sessionId').anyOf(options.sessionIds).toArray();
	} else {
		records = await db.attendanceRecords.toArray();
	}
	if (options.studentIds?.length) {
		const set = new Set(options.studentIds);
		records = records.filter((r) => set.has(r.studentId));
	}
	return records;
}
