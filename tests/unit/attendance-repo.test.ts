import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttendanceDatabase, setDb } from '$lib/db/database';
import {
	closeSession,
	getRecord,
	openSession,
	recordFaceAttendance,
	recordManualAttendance,
	correctAttendance,
	DuplicateAttendanceError
} from '$lib/db/attendance';
import { createClass } from '$lib/db/classes';
import { createStudent } from '$lib/db/students';

let db: AttendanceDatabase;

beforeEach(async () => {
	db = new AttendanceDatabase('test-attendance');
	setDb(db);
	await db.open();
});

afterEach(async () => {
	await db.delete();
	setDb(null);
});

describe('attendance session', () => {
	it('reuses an existing open session for the same class and date', async () => {
		const cls = await createClass({
			name: '7A',
			grade: '7',
			academicYear: '2026/2027',
			semester: 'Ganjil'
		});
		const first = await openSession({ classId: cls.id, date: '2026-09-30' });
		const second = await openSession({ classId: cls.id, date: '2026-09-30' });
		expect(second.id).toBe(first.id);
	});
});

describe('anti-duplicate attendance', () => {
	async function setup() {
		const cls = await createClass({
			name: '7A',
			grade: '7',
			academicYear: '2026/2027',
			semester: 'Ganjil'
		});
		const student = await createStudent({ nis: '10001', name: 'Ahmad', classId: cls.id });
		const session = await openSession({ classId: cls.id, date: '2026-09-30', lateAfter: '07:00' });
		return { cls, student, session };
	}

	it('records a face scan once', async () => {
		const { student, session } = await setup();
		const record = await recordFaceAttendance({
			sessionId: session.id,
			studentId: student.id,
			lateAfter: session.lateAfter,
			at: new Date(2026, 8, 30, 6, 45, 0)
		});
		expect(record.status).toBe('present');
	});

	it('commits the record and its audit log atomically (no rollback)', async () => {
		const { student, session } = await setup();

		const record = await recordManualAttendance({
			sessionId: session.id,
			studentId: student.id,
			status: 'present'
		});

		// Both rows must persist: an audit write that lives in a different transaction scope
		// would abort the outer transaction and silently roll back the attendance record.
		const persisted = await db.attendanceRecords.get(record.id);
		expect(persisted).toBeDefined();
		expect(persisted?.status).toBe('present');

		const logs = await db.auditLogs.where('action').equals('attendance_manual').toArray();
		expect(logs.some((l) => l.entityId === record.id)).toBe(true);
	});

	it('rejects a second face scan with the existing record attached', async () => {
		const { student, session } = await setup();
		await recordFaceAttendance({
			sessionId: session.id,
			studentId: student.id,
			at: new Date(2026, 8, 30, 6, 45, 0)
		});
		await expect(
			recordFaceAttendance({ sessionId: session.id, studentId: student.id })
		).rejects.toBeInstanceOf(DuplicateAttendanceError);
	});

	it('rejects manual entry when a record already exists', async () => {
		const { student, session } = await setup();
		await recordManualAttendance({
			sessionId: session.id,
			studentId: student.id,
			status: 'present'
		});
		await expect(
			recordManualAttendance({ sessionId: session.id, studentId: student.id, status: 'sick' })
		).rejects.toBeInstanceOf(DuplicateAttendanceError);
	});

	it('keeps the first record when a duplicate race is attempted concurrently', async () => {
		const { student, session } = await setup();
		const results = await Promise.allSettled([
			recordFaceAttendance({ sessionId: session.id, studentId: student.id }),
			recordFaceAttendance({ sessionId: session.id, studentId: student.id })
		]);
		const fulfilled = results.filter((r) => r.status === 'fulfilled');
		expect(fulfilled).toHaveLength(1);
		const records = await db.attendanceRecords
			.where('[sessionId+studentId]')
			.equals([session.id, student.id])
			.toArray();
		expect(records).toHaveLength(1);
	});

	it('marks a late scan correctly', async () => {
		const { student, session } = await setup();
		const record = await recordFaceAttendance({
			sessionId: session.id,
			studentId: student.id,
			lateAfter: '07:00',
			at: new Date(2026, 8, 30, 7, 15, 0)
		});
		expect(record.status).toBe('late');
	});
});

describe('session close + reconciliation', () => {
	it('promotes selected unrecorded students to absent', async () => {
		const cls = await createClass({
			name: '8A',
			grade: '8',
			academicYear: '2026/2027',
			semester: 'Ganjil'
		});
		const a = await createStudent({ nis: '1', name: 'A', classId: cls.id });
		const b = await createStudent({ nis: '2', name: 'B', classId: cls.id });
		const session = await openSession({ classId: cls.id, date: '2026-09-30' });
		await recordManualAttendance({ sessionId: session.id, studentId: a.id, status: 'present' });

		await closeSession(session.id, { markAbsentStudentIds: [b.id] });

		expect((await getRecord(session.id, a.id))?.status).toBe('present');
		expect((await getRecord(session.id, b.id))?.status).toBe('absent');
		expect((await db.attendanceSessions.get(session.id))?.status).toBe('closed');
	});
});

describe('correction', () => {
	it('updates status and writes an audit log', async () => {
		const cls = await createClass({
			name: '9A',
			grade: '9',
			academicYear: '2026/2027',
			semester: 'Ganjil'
		});
		const s = await createStudent({ nis: '9', name: 'C', classId: cls.id });
		const session = await openSession({ classId: cls.id, date: '2026-09-30' });
		const record = await recordManualAttendance({
			sessionId: session.id,
			studentId: s.id,
			status: 'absent'
		});
		await correctAttendance(record.id, { status: 'sick', notes: 'Surat dokter' });
		expect((await db.attendanceRecords.get(record.id))?.status).toBe('sick');
		const logs = await db.auditLogs.where('action').equals('attendance_correction').toArray();
		expect(logs.length).toBe(1);
	});
});
