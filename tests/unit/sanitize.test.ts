import { describe, expect, it } from 'vitest';
import {
	buildCsv,
	sanitizeSpreadsheetCell,
	sanitizeSpreadsheetRow,
	toCsvValue
} from '$lib/utils/sanitize';

describe('sanitizeSpreadsheetCell', () => {
	it('neutralizes formula injection for = + - @', () => {
		expect(sanitizeSpreadsheetCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
		expect(sanitizeSpreadsheetCell('+1')).toBe("'+1");
		expect(sanitizeSpreadsheetCell('-2')).toBe("'-2");
		expect(sanitizeSpreadsheetCell('@cmd')).toBe("'@cmd");
	});

	it('neutralizes leading tab and carriage return', () => {
		expect(sanitizeSpreadsheetCell('\tx')).toBe("'\tx");
		expect(sanitizeSpreadsheetCell('\rx')).toBe("'\rx");
	});

	it('leaves ordinary values untouched', () => {
		expect(sanitizeSpreadsheetCell('Ahmad Fauzi')).toBe('Ahmad Fauzi');
		expect(sanitizeSpreadsheetCell('10001')).toBe('10001');
	});

	it('handles null/undefined and numbers', () => {
		expect(sanitizeSpreadsheetCell(null)).toBe('');
		expect(sanitizeSpreadsheetCell(undefined)).toBe('');
		expect(sanitizeSpreadsheetCell(42)).toBe('42');
	});

	it('does not false-positive on names containing inner symbols', () => {
		expect(sanitizeSpreadsheetCell('Maria-Jose')).toBe('Maria-Jose');
	});
});

describe('sanitizeSpreadsheetRow', () => {
	it('sanitizes each cell', () => {
		const row = sanitizeSpreadsheetRow({ name: '=BAD()', nis: '10001' });
		expect(row.name).toBe("'=BAD()");
		expect(row.nis).toBe('10001');
	});
});

describe('toCsvValue', () => {
	it('quotes values containing commas, quotes, or newlines', () => {
		expect(toCsvValue('a,b')).toBe('"a,b"');
		expect(toCsvValue('say "hi"')).toBe('"say ""hi"""');
		expect(toCsvValue('line1\nline2')).toBe('"line1\nline2"');
	});

	it('sanitizes before quoting', () => {
		expect(toCsvValue('=cmd')).toBe("'=cmd");
		expect(toCsvValue('=a,b')).toBe('"\'=a,b"');
	});
});

describe('buildCsv', () => {
	it('prepends a UTF-8 BOM by default', () => {
		const csv = buildCsv(['Nama'], [['Ahmad']]);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		expect(csv).toContain('Nama');
		expect(csv).toContain('Ahmad');
	});

	it('can omit the BOM', () => {
		const csv = buildCsv(['Nama'], [['Ahmad']], { bom: false });
		expect(csv.charCodeAt(0)).not.toBe(0xfeff);
	});

	it('uses CRLF line endings for Excel compatibility', () => {
		const csv = buildCsv(['A'], [['1'], ['2']], { bom: false });
		expect(csv).toBe('A\r\n1\r\n2');
	});
});
