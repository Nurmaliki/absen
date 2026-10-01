import { getDb } from './database';
import type { SchoolClass } from '$lib/types';
import { uuid } from '$lib/utils/id';
import { nowIso } from '$lib/utils/time';
import { writeAudit } from './audit';
import { broadcastSync } from './sync';

export interface ClassInput {
	name: string;
	grade: string;
	academicYear: string;
	semester: string;
	active?: boolean;
}

export interface ClassWithStats extends SchoolClass {
	studentCount: number;
	faceRegisteredCount: number;
}

export async function listClasses(
	options: { includeInactive?: boolean } = {}
): Promise<SchoolClass[]> {
	const all = await getDb().classes.orderBy('name').toArray();
	return options.includeInactive ? all : all.filter((c) => c.active);
}

export async function getClass(id: string): Promise<SchoolClass | undefined> {
	return getDb().classes.get(id);
}

/** Classes enriched with student + face-registration counts for the master class table. */
export async function listClassesWithStats(
	options: { includeInactive?: boolean } = {}
): Promise<ClassWithStats[]> {
	const db = getDb();
	const classes = await listClasses(options);
	const students = await db.students.toArray();

	const byClass = new Map<string, { total: number; withFace: number }>();
	for (const student of students) {
		if (!student.active) continue;
		const agg = byClass.get(student.classId) ?? { total: 0, withFace: 0 };
		agg.total += 1;
		if (student.faceRegistered) agg.withFace += 1;
		byClass.set(student.classId, agg);
	}

	return classes.map((cls) => {
		const agg = byClass.get(cls.id) ?? { total: 0, withFace: 0 };
		return { ...cls, studentCount: agg.total, faceRegisteredCount: agg.withFace };
	});
}

export async function createClass(input: ClassInput): Promise<SchoolClass> {
	const timestamp = nowIso();
	const record: SchoolClass = {
		id: uuid(),
		name: input.name.trim(),
		grade: input.grade.trim(),
		academicYear: input.academicYear.trim(),
		semester: input.semester.trim(),
		active: input.active ?? true,
		createdAt: timestamp,
		updatedAt: timestamp
	};
	await getDb().classes.add(record);
	await writeAudit({
		action: 'create_class',
		entityType: 'class',
		entityId: record.id,
		description: `Menambah kelas ${record.name} (${record.academicYear})`
	});
	broadcastSync({ kind: 'classes:changed' });
	return record;
}

export async function updateClass(id: string, input: Partial<ClassInput>): Promise<void> {
	const patch: Partial<SchoolClass> = { updatedAt: nowIso() };
	if (input.name !== undefined) patch.name = input.name.trim();
	if (input.grade !== undefined) patch.grade = input.grade.trim();
	if (input.academicYear !== undefined) patch.academicYear = input.academicYear.trim();
	if (input.semester !== undefined) patch.semester = input.semester.trim();
	if (input.active !== undefined) patch.active = input.active;

	await getDb().classes.update(id, patch);
	await writeAudit({
		action: 'update_class',
		entityType: 'class',
		entityId: id,
		description: `Memperbarui kelas ${input.name ?? id}`
	});
	broadcastSync({ kind: 'classes:changed' });
}

export async function setClassActive(id: string, active: boolean): Promise<void> {
	await getDb().classes.update(id, { active, updatedAt: nowIso() });
	await writeAudit({
		action: active ? 'activate_class' : 'deactivate_class',
		entityType: 'class',
		entityId: id,
		description: `${active ? 'Mengaktifkan' : 'Menonaktifkan'} kelas`
	});
	broadcastSync({ kind: 'classes:changed' });
}

/** Distinct academic years & semesters for filter dropdowns. */
export async function listClassFacets(): Promise<{ years: string[]; semesters: string[] }> {
	const classes = await getDb().classes.toArray();
	const years = [...new Set(classes.map((c) => c.academicYear).filter(Boolean))].sort().reverse();
	const semesters = [...new Set(classes.map((c) => c.semester).filter(Boolean))].sort();
	return { years, semesters };
}
