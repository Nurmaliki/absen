import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyReportRow, MonthlyReportRow } from './aggregate';
import { formatDateTime } from '$lib/utils/time';

/**
 * Client-side PDF generation (jsPDF + autotable) — no server needed, works offline.
 */

export interface PdfMeta {
	schoolName: string;
	title: string;
	className: string;
	periodLabel: string;
	generatedAt?: Date;
}

function header(doc: jsPDF, meta: PdfMeta): number {
	const pageWidth = doc.internal.pageSize.getWidth();
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.text(meta.schoolName || 'Sekolah', pageWidth / 2, 16, { align: 'center' });
	doc.setFontSize(12);
	doc.text(meta.title, pageWidth / 2, 23, { align: 'center' });
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	doc.text(`Kelas: ${meta.className}`, 14, 31);
	doc.text(`Periode: ${meta.periodLabel}`, 14, 36);
	return 40;
}

function footer(doc: jsPDF, meta: PdfMeta): void {
	const pageHeight = doc.internal.pageSize.getHeight();
	doc.setFontSize(9);
	doc.setTextColor(120);
	doc.text(
		`Dibuat: ${formatDateTime((meta.generatedAt ?? new Date()).toISOString())}`,
		14,
		pageHeight - 8
	);
}

export function buildDailyPdf(rows: DailyReportRow[], meta: PdfMeta): jsPDF {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	const startY = header(doc, meta);

	autoTable(doc, {
		startY,
		head: [['No', 'Tanggal', 'Kelas', 'NIS', 'Nama', 'Jam', 'Status']],
		body: rows.map((row, index) => [
			String(index + 1),
			row.date,
			row.className,
			row.nis,
			row.name,
			row.time,
			row.status
		]),
		styles: { fontSize: 8, cellPadding: 2 },
		headStyles: { fillColor: [15, 118, 110] },
		alternateRowStyles: { fillColor: [240, 247, 246] }
	});

	footer(doc, meta);
	return doc;
}

export function buildMonthlyPdf(rows: MonthlyReportRow[], meta: PdfMeta): jsPDF {
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
	const startY = header(doc, meta);

	autoTable(doc, {
		startY,
		head: [['No', 'NIS', 'Nama', 'H', 'T', 'I', 'S', 'A', '%']],
		body: rows.map((row, index) => [
			String(index + 1),
			row.nis,
			row.name,
			String(row.present),
			String(row.late),
			String(row.permission),
			String(row.sick),
			String(row.absent),
			`${row.percentage.toFixed(1)}%`
		]),
		styles: { fontSize: 8, cellPadding: 1.8 },
		columnStyles: {
			0: { cellWidth: 10 },
			3: { halign: 'center', cellWidth: 9 },
			4: { halign: 'center', cellWidth: 9 },
			5: { halign: 'center', cellWidth: 9 },
			6: { halign: 'center', cellWidth: 9 },
			7: { halign: 'center', cellWidth: 9 },
			8: { halign: 'center', cellWidth: 14 }
		},
		headStyles: { fillColor: [15, 118, 110] },
		alternateRowStyles: { fillColor: [240, 247, 246] },
		// Legend note under table
		didDrawPage: () => {
			const pageHeight = doc.internal.pageSize.getHeight();
			doc.setFontSize(7);
			doc.setTextColor(120);
			doc.text('H=Hadir  T=Terlambat  I=Izin  S=Sakit  A=Alpa', 14, pageHeight - 14);
		}
	});

	footer(doc, meta);
	return doc;
}

export function pdfFilename(className: string, period: string, kind: 'harian' | 'bulanan'): string {
	const slug = className.trim().toLowerCase().replace(/\s+/g, '-');
	return `absensi-${kind}-${slug}-${period}.pdf`;
}
