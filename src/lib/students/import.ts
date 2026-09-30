import * as XLSX from 'xlsx';
import type { Student } from '$lib/types';
import { normalizeIdentifier, normalizeName } from '$lib/utils/id';

/**
 * Student import parsing + validation.
 *
 * Business rule: never write partially-invalid data. Parse -> validate -> detect
 * duplicates (both inside the file and against existing students) -> present a preview
 * with per-row errors. Only a fully-validated, user-confirmed set is committed.
 */

export interface ImportRow {
	/** 1-based row number in the source file (for error reporting). */
	rowNumber: number;
	nis: string;
	nisn: string;
	name: string;
	className: string;
	gender: string;
	errors: string[];
	/** Resolved class id once the caller maps the class name to an existing class. */
	classId?: string;
}

export interface ImportParseResult {
	rows: ImportRow[];
	headers: string[];
	detectedColumns: Partial<Record<ImportField, string>>;
	errors: string[];
}

export type ImportField = 'nis' | 'nisn' | 'name' | 'className' | 'gender';

const HEADER_ALIASES: Record<ImportField, string[]> = {
	nis: ['nis', 'nomor induk', 'no induk', 'nomor induk siswa'],
	nisn: ['nisn', 'nomor induk siswa nasional'],
	name: ['nama', 'nama siswa', 'nama lengkap'],
	className: ['kelas', 'class', 'rombel', 'nama kelas'],
	gender: ['jenis kelamin', 'jk', 'gender', 'l/p']
};

/** Max import size to protect against accidental huge files (DoS guard). */
export const MAX_IMPORT_ROWS = 5000;

function normalizeHeader(header: string): string {
	return header.trim().toLowerCase();
}

function detectColumns(headers: string[]): Partial<Record<ImportField, string>> {
	const detected: Partial<Record<ImportField, string>> = {};
	for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
		const match = headers.find((h) => aliases.includes(normalizeHeader(h)));
		if (match) detected[field] = match;
	}
	return detected;
}

/** Parse an XLSX/CSV file (SheetJS handles both) into validated rows. */
export async function parseStudentFile(file: File): Promise<ImportParseResult> {
	const buffer = await file.arrayBuffer();
	let workbook: XLSX.WorkBook;
	try {
		workbook = XLSX.read(buffer, { type: 'array' });
	} catch {
		return { rows: [], headers: [], detectedColumns: {}, errors: ['File tidak dapat dibaca.'] };
	}
	const sheetName = workbook.SheetNames[0];
	if (!sheetName) {
		return { rows: [], headers: [], detectedColumns: {}, errors: ['File tidak memiliki sheet.'] };
	}
	const sheet = workbook.Sheets[sheetName];
	const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
	if (json.length === 0) {
		return {
			rows: [],
			headers: [],
			detectedColumns: {},
			errors: ['File kosong atau tidak memiliki data.']
		};
	}
	if (json.length > MAX_IMPORT_ROWS) {
		return {
			rows: [],
			headers: [],
			detectedColumns: {},
			errors: [
				`File terlalu besar (${json.length} baris). Maksimum ${MAX_IMPORT_ROWS} baris per impor.`
			]
		};
	}

	const headers = Object.keys(json[0]);
	const detectedColumns = detectColumns(headers);
	const errors: string[] = [];
	for (const required of ['nis', 'name', 'className'] as ImportField[]) {
		if (!detectedColumns[required]) {
			errors.push(
				`Kolom wajib tidak ditemukan: ${required === 'className' ? 'Kelas' : required === 'name' ? 'Nama' : 'NIS'}.`
			);
		}
	}
	if (errors.length > 0) {
		return { rows: [], headers, detectedColumns, errors };
	}

	const rows: ImportRow[] = [];
	const seenNis = new Map<string, number>();

	json.forEach((raw, index) => {
		const rowNumber = index + 2; // +1 header, +1 for 1-based
		const nis = String(raw[detectedColumns.nis!] ?? '').trim();
		const name = normalizeName(String(raw[detectedColumns.name!] ?? ''));
		const className = String(raw[detectedColumns.className!] ?? '').trim();
		const nisn = detectedColumns.nisn ? String(raw[detectedColumns.nisn] ?? '').trim() : '';
		const gender = detectedColumns.gender
			? normalizeGender(String(raw[detectedColumns.gender] ?? ''))
			: '';

		const rowErrors: string[] = [];
		if (!nis) rowErrors.push('NIS kosong.');
		if (!name) rowErrors.push('Nama kosong.');
		if (!className) rowErrors.push('Kelas kosong.');

		const key = normalizeIdentifier(nis);
		if (nis && seenNis.has(key)) {
			rowErrors.push(`NIS duplikat di dalam file (baris ${seenNis.get(key)}).`);
		} else if (nis) {
			seenNis.set(key, rowNumber);
		}

		rows.push({ rowNumber, nis, nisn, name, className, gender, errors: rowErrors });
	});

	return { rows, headers, detectedColumns, errors: [] };
}

function normalizeGender(value: string): string {
	const v = value.trim().toLowerCase();
	if (['l', 'lk', 'laki-laki', 'laki laki', 'pria', 'male', 'm'].includes(v)) return 'L';
	if (['p', 'pr', 'perempuan', 'wanita', 'female', 'f'].includes(v)) return 'P';
	return value.trim();
}

/**
 * Cross-check parsed rows against existing students and the class list.
 * Mutates `rows` with resolved `classId` and additional errors.
 */
export function validateAgainstDatabase(
	rows: ImportRow[],
	existingStudents: Student[],
	classes: Array<{ id: string; name: string }>
): ImportRow[] {
	const existingByNis = new Map(existingStudents.map((s) => [normalizeIdentifier(s.nis), s]));
	const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));

	return rows.map((row) => {
		const errors = [...row.errors];
		const existing = existingByNis.get(normalizeIdentifier(row.nis));
		if (existing) {
			errors.push(`NIS sudah terdaftar untuk siswa "${existing.name}".`);
		}
		const classId = classByName.get(row.className.toLowerCase());
		if (!classId && row.className) {
			errors.push(`Kelas "${row.className}" belum ada. Buat kelas terlebih dahulu.`);
		}
		return { ...row, classId, errors };
	});
}

export function importSummary(rows: ImportRow[]): {
	valid: number;
	invalid: number;
	total: number;
} {
	const valid = rows.filter((r) => r.errors.length === 0).length;
	return { valid, invalid: rows.length - valid, total: rows.length };
}

/** Build a template workbook users can download and fill in. */
export function buildImportTemplate(): XLSX.WorkBook {
	const data = [
		{ NIS: '10001', NISN: '0012345678', Nama: 'Ahmad Fauzi', Kelas: '7A', 'Jenis Kelamin': 'L' },
		{ NIS: '10002', NISN: '0012345679', Nama: 'Siti Aminah', Kelas: '7A', 'Jenis Kelamin': 'P' }
	];
	const sheet = XLSX.utils.json_to_sheet(data, {
		header: ['NIS', 'NISN', 'Nama', 'Kelas', 'Jenis Kelamin']
	});
	sheet['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 14 }];
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, 'Template Siswa');
	return workbook;
}
