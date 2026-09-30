import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AttendanceDatabase, setDb } from '$lib/db/database';
import {
	BackupError,
	backupFilename,
	createBackup,
	decryptAndValidateBackup,
	parseBackupFile,
	validateBackupPayload
} from '$lib/backup/backup';
import { restoreBackup } from '$lib/backup/restore';
import { createClass } from '$lib/db/classes';
import { createStudent, saveFaceTemplate } from '$lib/db/students';

let db: AttendanceDatabase;

beforeEach(async () => {
	db = new AttendanceDatabase('test-backup');
	setDb(db);
	await db.open();
});

afterEach(async () => {
	await db.delete();
	setDb(null);
});

async function seed() {
	const cls = await createClass({
		name: '8A',
		grade: '8',
		academicYear: '2026/2027',
		semester: 'Ganjil'
	});
	const student = await createStudent({ nis: '10001', name: 'Ahmad', classId: cls.id });
	await saveFaceTemplate({
		studentId: student.id,
		descriptor: [0.1, 0.2, 0.3],
		metric: 'cosine',
		modelVersion: 'test'
	});
	return { cls, student };
}

describe('backup serialization', () => {
	it('round-trips data through an encrypted backup', async () => {
		const { cls, student } = await seed();
		const { file } = await createBackup('secret123');
		const parsed = parseBackupFile(JSON.stringify(file));
		const { data, preview } = await decryptAndValidateBackup(parsed, 'secret123');

		expect(data.classes).toHaveLength(1);
		expect(data.students).toHaveLength(1);
		expect(data.faceTemplates).toHaveLength(1);
		expect(preview.counts.students).toBe(1);
		expect(data.students[0].id).toBe(student.id);
		expect(data.classes[0].id).toBe(cls.id);
	});

	it('never stores the password in the file', async () => {
		await seed();
		const { file } = await createBackup('secret123');
		expect(JSON.stringify(file)).not.toContain('secret123');
	});

	it('fails with the wrong password', async () => {
		await seed();
		const { file } = await createBackup('secret123');
		await expect(decryptAndValidateBackup(file, 'wrongpass')).rejects.toBeInstanceOf(BackupError);
	});

	it('detects a corrupted ciphertext via checksum/integrity', async () => {
		await seed();
		const { file } = await createBackup('secret123');
		file.ciphertext = file.ciphertext.slice(0, -4) + 'AAAA';
		await expect(decryptAndValidateBackup(file, 'secret123')).rejects.toBeInstanceOf(BackupError);
	});

	it('rejects a non-JSON file', () => {
		expect(() => parseBackupFile('not json')).toThrow(BackupError);
	});

	it('rejects a backup with a newer version', () => {
		expect(() =>
			parseBackupFile(
				JSON.stringify({
					backupVersion: 99,
					encryption: {},
					ciphertext: 'x',
					plaintextChecksum: 'y'
				})
			)
		).toThrow(/versi/i);
	});

	it('rejects a malformed payload schema', () => {
		expect(() =>
			validateBackupPayload({ backupVersion: 1, data: { classes: 'nope' as unknown as [] } })
		).toThrow(BackupError);
	});

	it('produces a dated filename', () => {
		expect(backupFilename(new Date(2026, 8, 30))).toBe('absensi-backup-2026-09-30.enc');
	});
});

describe('restore', () => {
	it('replaces existing data with the backup contents', async () => {
		const { student } = await seed();
		const { file } = await createBackup('secret123');

		// Wipe + add unrelated data.
		await db.students.clear();
		const cls2 = await createClass({
			name: '9B',
			grade: '9',
			academicYear: '2026/2027',
			semester: 'Genap'
		});
		await createStudent({ nis: '99999', name: 'Unrelated', classId: cls2.id });

		const parsed = parseBackupFile(JSON.stringify(file));
		const { data } = await decryptAndValidateBackup(parsed, 'secret123');
		await restoreBackup(data);

		const students = await db.students.toArray();
		expect(students).toHaveLength(1);
		expect(students[0].id).toBe(student.id);
		expect(await db.students.where('nis').equals('99999').first()).toBeUndefined();
	});
});
