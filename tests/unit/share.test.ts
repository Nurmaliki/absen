import { describe, expect, it } from 'vitest';
import { buildTextRecap, canShareFiles } from '$lib/reports/share';

describe('buildTextRecap', () => {
	it('formats an Indonesian recap with a localized percentage', () => {
		const text = buildTextRecap({
			className: '8A',
			periodLabel: '30 September 2026',
			present: 27,
			late: 2,
			permission: 1,
			sick: 1,
			absent: 1,
			total: 32,
			percentage: 90.625
		});
		expect(text).toContain('ABSENSI KELAS 8A');
		expect(text).toContain('Hadir: 27');
		expect(text).toContain('Terlambat: 2');
		expect(text).toContain('Total: 32');
		expect(text).toContain('90,6%');
	});
});

describe('canShareFiles', () => {
	it('returns false when the Web Share API is unavailable', () => {
		const file = new File(['x'], 'a.xlsx');
		expect(canShareFiles(file)).toBe(false);
	});
});
