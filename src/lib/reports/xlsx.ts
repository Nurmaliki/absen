import * as XLSX from 'xlsx';
import { sanitizeSpreadsheetCell } from '$lib/utils/sanitize';
import type { DailyReportRow, MonthlyReportRow } from './aggregate';
import { formatDateTime } from '$lib/utils/time';

/**
 * Excel export via SheetJS.
 *
 * Dates/times are written as strings (already formatted for humans) so LibreOffice and
 * Excel cannot re-interpret them into corrupt serial numbers. Every cell is sanitized
 * against spreadsheet formula injection.
 */

function autoWidth(rows: Array<Record<string, unknown>>, headers: string[]): XLSX.ColInfo[] {
	return headers.map((header) => {
		const maxLen = rows.reduce((max, row) => {
			const value = String(row[header] ?? '');
			return Math.max(max, value.length);
		}, header.length);
		return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
	});
}

export interface WorkbookMeta {
	title: string;
	schoolName: string;
	periodLabel: string;
}

export function buildDailyWorkbook(rows: DailyReportRow[], meta: WorkbookMeta): XLSX.WorkBook {
	const data = rows.map((row) => ({
		Tanggal: sanitizeSpreadsheetCell(row.date),
		Kelas: sanitizeSpreadsheetCell(row.className),
		NIS: sanitizeSpreadsheetCell(row.nis),
		Nama: sanitizeSpreadsheetCell(row.name),
		Jam: sanitizeSpreadsheetCell(row.time),
		Status: sanitizeSpreadsheetCell(row.status)
	}));
	const sheet = XLSX.utils.json_to_sheet(data, {
		header: ['Tanggal', 'Kelas', 'NIS', 'Nama', 'Jam', 'Status']
	});
	sheet['!cols'] = autoWidth(data, ['Tanggal', 'Kelas', 'NIS', 'Nama', 'Jam', 'Status']);

	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, 'Laporan Harian');
	workbook.Props = {
		Title: meta.title,
		Author: meta.schoolName,
		CreatedDate: new Date()
	};
	return workbook;
}

export function buildMonthlyWorkbook(rows: MonthlyReportRow[], meta: WorkbookMeta): XLSX.WorkBook {
	const data = rows.map((row) => ({
		NIS: sanitizeSpreadsheetCell(row.nis),
		Nama: sanitizeSpreadsheetCell(row.name),
		Kelas: sanitizeSpreadsheetCell(row.className),
		Hadir: row.present,
		Terlambat: row.late,
		Izin: row.permission,
		Sakit: row.sick,
		Alpa: row.absent,
		Total: row.total,
		'Persentase (%)': Number(row.percentage.toFixed(1))
	}));
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
	const sheet = XLSX.utils.json_to_sheet(data, { header: headers });
	sheet['!cols'] = autoWidth(data as unknown as Array<Record<string, unknown>>, headers);

	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, 'Rekap Bulanan');
	workbook.Props = {
		Title: meta.title,
		Author: meta.schoolName,
		CreatedDate: new Date()
	};
	return workbook;
}

/** Serialize a workbook to a Blob for download/share. */
export function workbookToBlob(workbook: XLSX.WorkBook): Blob {
	const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
	return new Blob([buffer], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	});
}

/** Export a filename-safe report name: absensi-8A-2026-09.xlsx */
export function excelFilename(
	className: string,
	period: string,
	kind: 'harian' | 'bulanan'
): string {
	const slug = className.trim().toLowerCase().replace(/\s+/g, '-');
	return `absensi-${kind}-${slug}-${period}.xlsx`;
}

export { formatDateTime };
