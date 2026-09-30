/**
 * Spreadsheet formula-injection sanitization.
 *
 * Excel / LibreOffice / Google Sheets interpret cell values starting with
 * `=`, `+`, `-`, `@`, or a tab/CR as formulas (or DDE commands). Student names or
 * notes could contain such content, so we neutralize it before writing CSV/XLSX.
 *
 * Strategy (OWASP recommendation): prefix with an apostrophe when the value
 * begins with one of the dangerous leading characters. The apostrophe is not shown
 * as data in Excel; it forces literal text. In CSV we quote + prefix. In XLSX we
 * prefix the string value.
 */

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeSpreadsheetCell(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	if (DANGEROUS_PREFIX.test(text)) {
		return `'${text}`;
	}
	return text;
}

/** Sanitize every cell of a row for CSV/XLSX output. */
export function sanitizeSpreadsheetRow<T extends Record<string, unknown>>(
	row: T
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of Object.keys(row)) {
		out[key] = sanitizeSpreadsheetCell(row[key]);
	}
	return out;
}

/** Escape a value for CSV (RFC4180 quoting) after sanitization. */
export function toCsvValue(value: unknown): string {
	const sanitized = sanitizeSpreadsheetCell(value);
	if (/[",\n\r;]/.test(sanitized)) {
		return `"${sanitized.replace(/"/g, '""')}"`;
	}
	return sanitized;
}

/**
 * Build a CSV document. A UTF-8 BOM is prepended by default so Excel on Windows
 * detects the encoding and renders Indonesian names (and accented characters) correctly.
 */
export function buildCsv(
	headers: string[],
	rows: Array<Array<unknown>>,
	options: { bom?: boolean; delimiter?: string } = {}
): string {
	const { bom = true, delimiter = ',' } = options;
	const lines: string[] = [];
	lines.push(headers.map(toCsvValue).join(delimiter));
	for (const row of rows) {
		lines.push(row.map(toCsvValue).join(delimiter));
	}
	const body = lines.join('\r\n');
	return bom ? '\uFEFF' + body : body;
}
