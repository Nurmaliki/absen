import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AttendanceDatabase, setDb } from '$lib/db/database';
import { createClass } from '$lib/db/classes';
import {
	createStudent,
	deleteStudent,
	findByNis,
	getFaceTemplate,
	saveFaceTemplate,
	DuplicateNisError
} from '$lib/db/students';

let db: AttendanceDatabase;

beforeEach(async () => {
	db = new AttendanceDatabase('test-students');
	setDb(db);
	await db.open();
});

afterEach(async () => {
	await db.delete();
	setDb(null);
});

async function classId() {
	const cls = await createClass({
		name: '7A',
		grade: '7',
		academicYear: '2026/2027',
		semester: 'Ganjil'
	});
	return cls.id;
}

describe('NIS uniqueness', () => {
	it('rejects a duplicate NIS', async () => {
		const cid = await classId();
		await createStudent({ nis: '10001', name: 'Ahmad', classId: cid });
		await expect(
			createStudent({ nis: '10001', name: 'Budi', classId: cid })
		).rejects.toBeInstanceOf(DuplicateNisError);
	});

	it('treats NIS case-insensitively for duplicates', async () => {
		const cid = await classId();
		await createStudent({ nis: 'AB12', name: 'Ahmad', classId: cid });
		await expect(createStudent({ nis: 'ab12', name: 'Budi', classId: cid })).rejects.toBeInstanceOf(
			DuplicateNisError
		);
	});

	it('findByNis can exclude the student being edited', async () => {
		const cid = await classId();
		const s = await createStudent({ nis: '10001', name: 'Ahmad', classId: cid });
		expect(await findByNis('10001', s.id)).toBeUndefined();
		expect(await findByNis('10001')).toBeDefined();
	});
});

describe('face templates', () => {
	it('saves a template and flips faceRegistered', async () => {
		const cid = await classId();
		const s = await createStudent({ nis: '1', name: 'A', classId: cid });
		await saveFaceTemplate({
			studentId: s.id,
			descriptor: [0.1, 0.2],
			metric: 'cosine',
			modelVersion: 'test'
		});
		expect((await db.students.get(s.id))?.faceRegistered).toBe(true);
		expect(await getFaceTemplate(s.id)).toBeDefined();
	});

	it('re-registration replaces the existing template (one per student)', async () => {
		const cid = await classId();
		const s = await createStudent({ nis: '1', name: 'A', classId: cid });
		await saveFaceTemplate({
			studentId: s.id,
			descriptor: [0.1, 0.2],
			metric: 'cosine',
			modelVersion: 'v1'
		});
		await saveFaceTemplate({
			studentId: s.id,
			descriptor: [0.9, 0.9],
			metric: 'cosine',
			modelVersion: 'v2'
		});
		const templates = await db.faceTemplates.where('studentId').equals(s.id).toArray();
		expect(templates).toHaveLength(1);
		expect(templates[0].modelVersion).toBe('v2');
	});
});

describe('deletion', () => {
	it('deleting a student also deletes their face template', async () => {
		const cid = await classId();
		const s = await createStudent({ nis: '1', name: 'A', classId: cid });
		await saveFaceTemplate({
			studentId: s.id,
			descriptor: [0.1],
			metric: 'cosine',
			modelVersion: 't'
		});
		await deleteStudent(s.id);
		expect(await db.students.get(s.id)).toBeUndefined();
		expect(await db.faceTemplates.where('studentId').equals(s.id).toArray()).toHaveLength(0);
	});
});
