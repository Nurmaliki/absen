/** ID + misc small helpers shared across the app. */

/** RFC4122-ish UUID v4 using the platform crypto when available. */
export function uuid(): string {
	const g = globalThis as { crypto?: Crypto };
	if (g.crypto?.randomUUID) return g.crypto.randomUUID();
	// Fallback (older WebViews) — not cryptographically strong, only used for local row ids.
	const bytes = new Uint8Array(16);
	if (g.crypto?.getRandomValues) g.crypto.getRandomValues(bytes);
	else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Normalize a person's name for comparison/search (trim + collapse whitespace). */
export function normalizeName(name: string): string {
	return name.trim().replace(/\s+/g, ' ');
}

/** Normalize a NIS/NISN for duplicate detection. */
export function normalizeIdentifier(value: string): string {
	return value.trim().toUpperCase().replace(/\s+/g, '');
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Case/diacritic-insensitive substring match used by local search boxes. */
export function matchesQuery(haystack: string, query: string): boolean {
	if (!query) return true;
	return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

/** Format a fraction as an Indonesian percentage string with one decimal. */
export function formatPercent(value: number, locale = 'id-ID'): string {
	const pct = Number.isFinite(value) ? value : 0;
	return (
		new Intl.NumberFormat(locale, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1
		}).format(pct) + '%'
	);
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '-';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Collision-resistant-ish slug for filenames. */
export function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}
