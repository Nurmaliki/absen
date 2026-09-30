import Dexie, { type Table } from 'dexie';
import type {
	AppSettings,
	AttendanceRecord,
	AttendanceSession,
	AuditLog,
	FaceTemplate,
	SchoolClass,
	Student,
	Teacher
} from '$lib/types';

/**
 * Local-first IndexedDB database (Dexie).
 *
 * Schema versioning rules:
 * - Never drop user data in an upgrade. Additive changes only; use `.upgrade()` to
 *   backfill new fields when necessary.
 * - Compound indexes declared here are load-bearing for the business rules
 *   (one attendance record per student per session, one face template row per student).
 */
export class AttendanceDatabase extends Dexie {
	classes!: Table<SchoolClass, string>;
	students!: Table<Student, string>;
	faceTemplates!: Table<FaceTemplate, string>;
	attendanceSessions!: Table<AttendanceSession, string>;
	attendanceRecords!: Table<AttendanceRecord, string>;
	teachers!: Table<Teacher, string>;
	settings!: Table<AppSettings, string>;
	auditLogs!: Table<AuditLog, string>;

	constructor(name = 'absensi-wajah') {
		super(name);

		this.version(1).stores({
			classes: 'id, name, grade, academicYear, semester, active, updatedAt',
			students: 'id, nis, nisn, name, classId, active, faceRegistered, updatedAt, [classId+active]',
			faceTemplates: 'id, studentId, modelVersion, updatedAt',
			attendanceSessions: 'id, classId, date, status, updatedAt, [classId+date]',
			attendanceRecords:
				'id, sessionId, studentId, status, method, updatedAt, [sessionId+studentId]',
			teachers: 'id, role, updatedAt',
			settings: 'id',
			auditLogs: 'id, action, entityType, entityId, createdAt'
		});

		// v2: additive — `recognitionDistance` on attendance records, `metric` on face
		// templates, extra backup/settings fields. No data is destroyed; existing rows
		// are backfilled with conservative defaults.
		this.version(2)
			.stores({
				classes: 'id, name, grade, academicYear, semester, active, updatedAt',
				students:
					'id, nis, nisn, name, classId, active, faceRegistered, updatedAt, [classId+active]',
				faceTemplates: 'id, studentId, modelVersion, updatedAt',
				attendanceSessions: 'id, classId, date, status, updatedAt, [classId+date]',
				attendanceRecords:
					'id, sessionId, studentId, status, method, updatedAt, [sessionId+studentId]',
				teachers: 'id, role, updatedAt',
				settings: 'id',
				auditLogs: 'id, action, entityType, entityId, createdAt'
			})
			.upgrade(async (tx) => {
				await tx
					.table<FaceTemplate>('faceTemplates')
					.toCollection()
					.modify((tpl) => {
						if (!tpl.metric) tpl.metric = 'cosine';
					});
				await tx
					.table<AttendanceRecord>('attendanceRecords')
					.toCollection()
					.modify((rec) => {
						if (rec.recognitionDistance === undefined) rec.recognitionDistance = undefined;
					});
			});
	}
}

let instance: AttendanceDatabase | null = null;

/** Guard against accidentally opening IndexedDB during SSR. */
export function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

export function getDb(): AttendanceDatabase {
	if (!isBrowser()) {
		throw new Error('Database hanya dapat diakses di browser.');
	}
	if (!instance) instance = new AttendanceDatabase();
	return instance;
}

/** Inject a custom database (used by unit tests with fake-indexeddb). */
export function setDb(db: AttendanceDatabase | null): void {
	instance = db;
}

export const DB_NAME = 'absensi-wajah';
export const CURRENT_SCHEMA_VERSION = 2;
