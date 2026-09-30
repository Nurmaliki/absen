import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AttendanceDatabase, setDb } from '$lib/db/database';
import type { FaceTemplate } from '$lib/types';

/**
 * Migration tests use a real Dexie instance in fake-indexeddb. We manually create a v1
 * database with data, close it, then open with the v2 definition and assert that the
 * upgrade backfilled new fields WITHOUT destroying existing rows.
 */

const DB_NAME = 'migration-test';

afterEach(async () => {
	setDb(null);
	await Dexie.delete(DB_NAME);
});

describe('schema migration v1 -> v2', () => {
	it('preserves data and backfills the metric field', async () => {
		// --- Create a v1-shaped database by hand. ---
		const v1 = new Dexie(DB_NAME);
		v1.version(1).stores({
			classes: 'id, name',
			students: 'id, nis, classId',
			faceTemplates: 'id, studentId',
			attendanceSessions: 'id, classId, date',
			attendanceRecords: 'id, sessionId, studentId, [sessionId+studentId]',
			teachers: 'id',
			settings: 'id',
			auditLogs: 'id, action'
		});
		await v1.open();
		await v1.table('classes').add({
			id: 'c1',
			name: '7A',
			grade: '7',
			academicYear: '2026/2027',
			semester: 'Ganjil',
			active: true,
			createdAt: '2026-09-01T00:00:00.000Z',
			updatedAt: '2026-09-01T00:00:00.000Z'
		});
		await v1.table('students').add({
			id: 's1',
			nis: '10001',
			name: 'Ahmad',
			classId: 'c1',
			active: true,
			faceRegistered: true,
			createdAt: '2026-09-01T00:00:00.000Z',
			updatedAt: '2026-09-01T00:00:00.000Z'
		});
		// v1 face template without a `metric` field.
		await v1.table('faceTemplates').add({
			id: 't1',
			studentId: 's1',
			descriptor: [0.1, 0.2],
			modelVersion: 'v1',
			createdAt: '2026-09-01T00:00:00.000Z',
			updatedAt: '2026-09-01T00:00:00.000Z'
		});
		v1.close();

		// --- Open with the app's v2 schema (triggers the upgrade). ---
		const v2 = new AttendanceDatabase(DB_NAME);
		setDb(v2);
		await v2.open();

		const classes = await v2.classes.toArray();
		const students = await v2.students.toArray();
		const templates = await v2.faceTemplates.toArray();

		// Data is preserved.
		expect(classes).toHaveLength(1);
		expect(students).toHaveLength(1);
		expect(students[0].name).toBe('Ahmad');
		expect(templates).toHaveLength(1);

		// New field is backfilled.
		expect((templates[0] as FaceTemplate).metric).toBe('cosine');

		v2.close();
	});
});
