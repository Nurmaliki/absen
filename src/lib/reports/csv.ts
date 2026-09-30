import { buildCsv } from '$lib/utils/sanitize';
import type { DailyReportRow, MonthlyReportRow } from './aggregate';

/** CSV exporters. `buildCsv` handles BOM, quoting, and formula-injection sanitization. */

export function dailyCsv(rows: DailyReportRow[]): string {
	const headers = ['Tanggal', 'Kelas', 'NIS', 'Nama', 'Jam', 'Status'];
	const body = rows.map((row) => [
		row.date,
		row.className,
		row.nis,
		row.name,
		row.time,
		row.status
	]);
	return buildCsv(headers, body, { bom: true });
}

export function monthlyCsv(rows: MonthlyReportRow[]): string {
	const headers = [
		'NIS',
		'Nama',
		'Kelas',
		'Hadir',
		'Terlambat',
		'Izin',
		'Sakit',
		'Alpa',
		'Total',
		'Persentase (%)'
	];
	const body = rows.map((row) => [
		row.nis,
		row.name,
		row.className,
		row.present,
		row.late,
		row.permission,
		row.sick,
		row.absent,
		row.total,
		row.percentage.toFixed(1)
	]);
	return buildCsv(headers, body, { bom: true });
}

export function csvBlob(csv: string): Blob {
	return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

export function csvFilename(className: string, period: string, kind: 'harian' | 'bulanan'): string {
	const slug = className.trim().toLowerCase().replace(/\s+/g, '-');
	return `absensi-${kind}-${slug}-${period}.csv`;
}
