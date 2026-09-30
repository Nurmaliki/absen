import { describe, expect, it } from 'vitest';
import { importSummary, validateAgainstDatabase, type ImportRow } from '$lib/students/import';
import type { Student } from '$lib/types';

function row(overrides: Partial<ImportRow> = {}): ImportRow {
	return {
		rowNumber: 2,
		nis: '10001',
		nisn: '',
		name: 'Ahmad',
		className: '7A',
		gender: '',
		errors: [],
		...overrides
	};
}

function student(overrides: Partial<Student> = {}): Student {
	return {
		id: 'e1',
		nis: '10001',
		name: 'Existing',
		classId: 'c1',
		active: true,
		faceRegistered: false,
		createdAt: '',
		updatedAt: '',
		...overrides
	};
}

const classes = [{ id: 'c1', name: '7A' }];

describe('validateAgainstDatabase', () => {
	it('resolves a matching class name to its id', () => {
		const [result] = validateAgainstDatabase([row()], [], classes);
		expect(result.classId).toBe('c1');
		expect(result.errors).toHaveLength(0);
	});

	it('flags a duplicate NIS already in the database', () => {
		const [result] = validateAgainstDatabase([row()], [student()], classes);
		expect(result.errors.some((e) => e.includes('sudah terdaftar'))).toBe(true);
	});

	it('flags an unknown class', () => {
		const [result] = validateAgainstDatabase([row({ className: '9Z' })], [], classes);
		expect(result.errors.some((e) => e.includes('belum ada'))).toBe(true);
		expect(result.classId).toBeUndefined();
	});
});

describe('importSummary', () => {
	it('counts valid and invalid rows', () => {
		const rows = [row({ errors: [] }), row({ errors: ['bad'], rowNumber: 3 })];
		expect(importSummary(rows)).toEqual({ valid: 1, invalid: 1, total: 2 });
	});
});
