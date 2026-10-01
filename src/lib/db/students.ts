import { getDb, withStorageGuards } from './database';
import type { FaceTemplate, Student } from '$lib/types';
import { normalizeIdentifier, normalizeName, uuid } from '$lib/utils/id';
import { nowIso } from '$lib/utils/time';
import { writeAudit } from './audit';
import { broadcastSync } from './sync';

export interface StudentInput {
	nis: string;
	nisn?: string;
	name: string;
	classId: string;
	gender?: string;
	active?: boolean;
}

export class DuplicateNisError extends Error {
	constructor(public readonly nis: string) {
		super(`NIS ${nis} sudah terdaftar.`);
		this.name = 'DuplicateNisError';
	}
}

export async function listStudents(
	options: { classId?: string; includeInactive?: boolean } = {}
): Promise<Student[]> {
	const all = await getDb().students.toArray();
	const scoped = options.includeInactive ? all : all.filter((s) => s.active);
	const byClass = options.classId ? scoped.filter((s) => s.classId === options.classId) : scoped;
	return byClass.sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

export async function getStudent(id: string): Promise<Student | undefined> {
	return getDb().students.get(id);
}

/**
 * Duplicate NIS detection. Excludes `excludeId` so edits don't collide with themselves.
 * The DB has no unique index on `nis` (they are not the primary key), so this is the
 * authoritative check and must run inside the same logical transaction as the write.
 */
export async function findByNis(nis: string, excludeId?: string): Promise<Student | undefined> {
	const normalized = normalizeIdentifier(nis);
	const matches = await getDb().students.where('nis').equals(nis.trim()).toArray();
	let found: Student | undefined = matches[0];
	if (!found && normalized) {
		// Case-insensitive fallback scan (small local dataset; keeps behavior predictable).
		const all = await getDb().students.toArray();
		found = all.find((s) => normalizeIdentifier(s.nis) === normalized);
	}
	if (found && excludeId && found.id === excludeId) return undefined;
	return found;
}

export async function createStudent(input: StudentInput): Promise<Student> {
	const existing = await findByNis(input.nis);
	if (existing) throw new DuplicateNisError(input.nis);

	const timestamp = nowIso();
	const record: Student = {
		id: uuid(),
		nis: input.nis.trim(),
		nisn: input.nisn?.trim() || undefined,
		name: normalizeName(input.name),
		classId: input.classId,
		gender: input.gender || undefined,
		active: input.active ?? true,
		faceRegistered: false,
		createdAt: timestamp,
		updatedAt: timestamp
	};
	await withStorageGuards(() => getDb().students.add(record));
	await writeAudit({
		action: 'create_student',
		entityType: 'student',
		entityId: record.id,
		description: `Menambah siswa ${record.name} (NIS ${record.nis})`
	});
	broadcastSync({ kind: 'students:changed', classId: record.classId });
	return record;
}

export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<void> {
	if (input.nis !== undefined) {
		const existing = await findByNis(input.nis, id);
		if (existing) throw new DuplicateNisError(input.nis);
	}
	const patch: Partial<Student> = { updatedAt: nowIso() };
	if (input.nis !== undefined) patch.nis = input.nis.trim();
	if (input.nisn !== undefined) patch.nisn = input.nisn?.trim() || undefined;
	if (input.name !== undefined) patch.name = normalizeName(input.name);
	if (input.classId !== undefined) patch.classId = input.classId;
	if (input.gender !== undefined) patch.gender = input.gender || undefined;
	if (input.active !== undefined) patch.active = input.active;

	await getDb().students.update(id, patch);
	await writeAudit({
		action: 'update_student',
		entityType: 'student',
		entityId: id,
		description: `Memperbarui siswa ${input.name ?? id}`
	});
	broadcastSync({ kind: 'students:changed', classId: patch.classId });
}

export async function setStudentActive(id: string, active: boolean): Promise<void> {
	await getDb().students.update(id, { active, updatedAt: nowIso() });
	await writeAudit({
		action: active ? 'activate_student' : 'deactivate_student',
		entityType: 'student',
		entityId: id,
		description: `${active ? 'Mengaktifkan' : 'Menonaktifkan'} siswa`
	});
	broadcastSync({ kind: 'students:changed' });
}

/** Delete a student and their face templates in a single transaction, then audit. */
export async function deleteStudent(id: string): Promise<void> {
	const db = getDb();
	await db.transaction('rw', db.students, db.faceTemplates, async () => {
		await db.faceTemplates.where('studentId').equals(id).delete();
		await db.students.delete(id);
	});
	await writeAudit({
		action: 'delete_student',
		entityType: 'student',
		entityId: id,
		description: 'Menghapus data siswa'
	});
	broadcastSync({ kind: 'students:changed' });
}

export async function setFaceRegistered(studentId: string, registered: boolean): Promise<void> {
	await getDb().students.update(studentId, { faceRegistered: registered, updatedAt: nowIso() });
	broadcastSync({ kind: 'students:changed' });
}

export async function saveFaceTemplate(
	template: Omit<FaceTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FaceTemplate> {
	const db = getDb();
	const timestamp = nowIso();
	const existing = await db.faceTemplates.where('studentId').equals(template.studentId).first();

	const record: FaceTemplate = {
		...template,
		id: existing?.id ?? uuid(),
		createdAt: existing?.createdAt ?? timestamp,
		updatedAt: timestamp
	};

	await withStorageGuards(() =>
		db.transaction('rw', db.faceTemplates, db.students, async () => {
			await db.faceTemplates.put(record);
			await db.students.update(template.studentId, { faceRegistered: true, updatedAt: timestamp });
		})
	);

	await writeAudit({
		action: existing ? 'face_reregister' : 'face_register',
		entityType: 'faceTemplate',
		entityId: record.id,
		description: `${existing ? 'Registrasi ulang' : 'Registrasi'} wajah siswa`
	});
	broadcastSync({ kind: 'students:changed' });
	return record;
}

export async function getFaceTemplate(studentId: string): Promise<FaceTemplate | undefined> {
	return getDb().faceTemplates.where('studentId').equals(studentId).first();
}

/** All templates for a set of students (used to scope matching to a single class). */
export async function getFaceTemplatesForStudents(studentIds: string[]): Promise<FaceTemplate[]> {
	if (studentIds.length === 0) return [];
	return getDb().faceTemplates.where('studentId').anyOf(studentIds).toArray();
}

export async function deleteFaceTemplate(studentId: string): Promise<void> {
	const db = getDb();
	await db.transaction('rw', db.faceTemplates, db.students, async () => {
		await db.faceTemplates.where('studentId').equals(studentId).delete();
		await db.students.update(studentId, { faceRegistered: false, updatedAt: nowIso() });
	});
	await writeAudit({
		action: 'delete_face',
		entityType: 'faceTemplate',
		entityId: studentId,
		description: 'Menghapus data wajah siswa'
	});
	broadcastSync({ kind: 'students:changed' });
}
