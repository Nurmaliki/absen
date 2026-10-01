import { getDb, setDb, isBrowser, AttendanceDatabase } from '$lib/db/database';
import type { BackupData } from '$lib/types';
import { writeAudit } from '$lib/db/audit';
import { broadcastSync } from '$lib/db/sync';

/**
 * Restore engine.
 *
 * Strategy: never destroy the current database before the incoming data is validated
 * (validation happens in `decryptAndValidateBackup` before this runs). Restoration itself
 * is atomic per-table inside a single Dexie transaction across all tables, so a failure
 * mid-way rolls back and leaves the previous data intact.
 *
 * Callers SHOULD offer to create a safety backup of current state before invoking this
 * (the settings UI does).
 */
export async function restoreBackup(data: BackupData): Promise<void> {
	if (!isBrowser()) throw new Error('Restore hanya dapat dijalankan di browser.');
	const db = getDb();

	await db.transaction(
		'rw',
		[
			db.classes,
			db.students,
			db.faceTemplates,
			db.attendanceSessions,
			db.attendanceRecords,
			db.settings,
			db.auditLogs
		],
		async () => {
			await db.classes.clear();
			await db.students.clear();
			await db.faceTemplates.clear();
			await db.attendanceSessions.clear();
			await db.attendanceRecords.clear();
			await db.settings.clear();
			await db.auditLogs.clear();

			if (data.classes.length) await db.classes.bulkAdd(data.classes);
			if (data.students.length) await db.students.bulkAdd(data.students);
			if (data.faceTemplates.length) await db.faceTemplates.bulkAdd(data.faceTemplates);
			if (data.attendanceSessions.length)
				await db.attendanceSessions.bulkAdd(data.attendanceSessions);
			if (data.attendanceRecords.length) await db.attendanceRecords.bulkAdd(data.attendanceRecords);
			if (data.settings.length) await db.settings.bulkAdd(data.settings);
			if (data.auditLogs.length) await db.auditLogs.bulkAdd(data.auditLogs);
		}
	);

	await writeAudit({
		action: 'restore',
		entityType: 'database',
		description: `Restore database (${data.students.length} siswa, ${data.attendanceRecords.length} absensi)`
	});
	broadcastSync({ kind: 'data:restored' });
}

/** Wipe every table. Backs up nothing itself — callers handle the pre-wipe backup offer. */
export async function resetAllData(): Promise<void> {
	if (!isBrowser()) throw new Error('Reset hanya dapat dijalankan di browser.');
	const db = getDb();
	await db.transaction(
		'rw',
		[
			db.classes,
			db.students,
			db.faceTemplates,
			db.attendanceSessions,
			db.attendanceRecords,
			db.teachers,
			db.settings,
			db.auditLogs
		],
		async () => {
			await Promise.all([
				db.classes.clear(),
				db.students.clear(),
				db.faceTemplates.clear(),
				db.attendanceSessions.clear(),
				db.attendanceRecords.clear(),
				db.teachers.clear(),
				db.settings.clear(),
				db.auditLogs.clear()
			]);
		}
	);
	broadcastSync({ kind: 'data:reset' });
}

/**
 * Drop and recreate the database. Used as a last-resort recovery when IndexedDB is in a
 * corrupt state (blocked upgrade, quota corruption). Returns a fresh database handle.
 */
export async function recreateDatabase(): Promise<void> {
	if (!isBrowser()) throw new Error('Operasi database hanya di browser.');
	const existing = getDb();
	existing.close();
	await existing.delete();
	const fresh = new AttendanceDatabase();
	setDb(fresh);
	await fresh.open();
}
