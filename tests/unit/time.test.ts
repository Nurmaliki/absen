import { describe, expect, it } from 'vitest';
import {
	clockTime,
	formatDateOnly,
	inDateRange,
	isAfterCutoff,
	isValidClock,
	monthKey,
	timeToMinutes,
	todayDate
} from '$lib/utils/time';

describe('date helpers', () => {
	it('produces a local YYYY-MM-DD without UTC slippage', () => {
		// 2026-09-30 00:30 local — must stay on the 30th, not roll back to the 29th.
		expect(todayDate(new Date(2026, 8, 30, 0, 30))).toBe('2026-09-30');
		// 23:30 local — must stay on the 30th.
		expect(todayDate(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
	});

	it('formats a date-only string without timezone drift', () => {
		expect(formatDateOnly('2026-09-30')).toContain('2026');
		expect(formatDateOnly('2026-09-30')).not.toContain('29');
	});

	it('extracts the month key', () => {
		expect(monthKey('2026-09-30')).toBe('2026-09');
	});
});

describe('clock helpers', () => {
	it('parses HH:mm to minutes', () => {
		expect(timeToMinutes('07:00')).toBe(420);
		expect(timeToMinutes('06:30')).toBe(390);
	});

	it('validates clock strings', () => {
		expect(isValidClock('06:30')).toBe(true);
		expect(isValidClock('25:00')).toBe(false);
		expect(isValidClock('bad')).toBe(false);
	});

	it('formats local clock time', () => {
		expect(clockTime(new Date(2026, 8, 30, 6, 5))).toBe('06:05');
	});
});

describe('isAfterCutoff', () => {
	it('is false before and at the cutoff, true after', () => {
		const at = new Date(2026, 8, 30, 6, 59);
		expect(isAfterCutoff(at, '07:00')).toBe(false);
		const exactly = new Date(2026, 8, 30, 7, 0);
		expect(isAfterCutoff(exactly, '07:00')).toBe(false);
		const after = new Date(2026, 8, 30, 7, 1);
		expect(isAfterCutoff(after, '07:00')).toBe(true);
	});

	it('is false when no cutoff is provided', () => {
		expect(isAfterCutoff(new Date(2026, 8, 30, 23, 0), undefined)).toBe(false);
	});
});

describe('inDateRange', () => {
	it('is inclusive on both ends', () => {
		expect(inDateRange('2026-09-15', '2026-09-01', '2026-09-30')).toBe(true);
		expect(inDateRange('2026-09-01', '2026-09-01', '2026-09-30')).toBe(true);
		expect(inDateRange('2026-09-30', '2026-09-01', '2026-09-30')).toBe(true);
		expect(inDateRange('2026-08-31', '2026-09-01', '2026-09-30')).toBe(false);
	});

	it('handles open-ended ranges', () => {
		expect(inDateRange('2026-01-01', undefined, '2026-09-30')).toBe(true);
		expect(inDateRange('2027-01-01', '2026-09-01', undefined)).toBe(true);
	});
});
