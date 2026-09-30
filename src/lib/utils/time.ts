/**
 * Time handling utilities.
 *
 * Design decisions (see docs/SECURITY.md & README "Time handling"):
 * - `nowIso()`  -> canonical storage timestamp (UTC ISO string).
 * - `todayDate()` -> local calendar date (`YYYY-MM-DD`) for session/day grouping.
 * - Wall-clock session fields (`startTime`, `lateAfter`) are `HH:mm` local strings,
 *   compared as strings within the same day, which is timezone-safe because both
 *   sides share the same reference day.
 */

/** Canonical storage timestamp. */
export function nowIso(): string {
	return new Date().toISOString();
}

/** Local calendar date for the given instant. */
export function todayDate(at: Date = new Date()): string {
	const y = at.getFullYear();
	const m = String(at.getMonth() + 1).padStart(2, '0');
	const d = String(at.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Local `HH:mm` wall clock string. */
export function clockTime(at: Date = new Date()): string {
	const h = String(at.getHours()).padStart(2, '0');
	const m = String(at.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

/** Local `HH:mm:ss` for live display. */
export function clockTimeSeconds(at: Date = new Date()): string {
	return `${clockTime(at)}:${String(at.getSeconds()).padStart(2, '0')}`;
}

/** Parse `HH:mm` (or `HH:mm:ss`) to minutes since midnight. Returns null when invalid. */
export function timeToMinutes(value: string | undefined | null): number | null {
	if (!value) return null;
	const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return h * 60 + m;
}

/** True when `HH:mm` string is well-formed. */
export function isValidClock(value: string | undefined | null): boolean {
	return timeToMinutes(value) !== null;
}

/**
 * Determine whether an instant falls after the late cutoff on the session's local day.
 * Comparison is done in local minutes to avoid DST edge cases where `new Date(iso)`
 * for a stored UTC instant could drift a session across a day boundary.
 */
export function isAfterCutoff(attendanceAt: Date, lateAfter: string | undefined): boolean {
	const cutoff = timeToMinutes(lateAfter);
	if (cutoff === null) return false;
	const minutes = attendanceAt.getHours() * 60 + attendanceAt.getMinutes();
	return minutes > cutoff;
}

/** Display a stored ISO timestamp in the device's local timezone. */
export function formatDateTime(iso: string | undefined | null, locale = 'id-ID'): string {
	if (!iso) return '-';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '-';
	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'long',
		timeStyle: 'short'
	}).format(date);
}

/** Display only the local time portion of a stored ISO timestamp. */
export function formatTime(iso: string | undefined | null, locale = 'id-ID'): string {
	if (!iso) return '-';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '-';
	return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(date);
}

/** Human-readable Indonesian long date from `YYYY-MM-DD` without timezone drift. */
export function formatDateOnly(isoDate: string | undefined | null, locale = 'id-ID'): string {
	if (!isoDate) return '-';
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match) return isoDate;
	const [, y, m, d] = match;
	// Construct at local noon to avoid any UTC offset pushing the date back a day.
	const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
	return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}

/** `YYYY-MM` month key from a `YYYY-MM-DD` date. */
export function monthKey(dateOnly: string): string {
	return dateOnly.slice(0, 7);
}

/** Indonesian month name from `YYYY-MM`. */
export function formatMonthYear(key: string, locale = 'id-ID'): string {
	const [y, m] = key.split('-').map(Number);
	if (!y || !m) return key;
	const date = new Date(y, m - 1, 1, 12, 0, 0);
	return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
}

/** Inclusive date range test on `YYYY-MM-DD` strings (lexicographic = chronological). */
export function inDateRange(dateOnly: string, from?: string, to?: string): boolean {
	if (from && dateOnly < from) return false;
	if (to && dateOnly > to) return false;
	return true;
}
