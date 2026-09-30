/**
 * Web Share API wrapper.
 *
 * Reality check (documented for users): the site cannot *force* sharing to WhatsApp.
 * When the platform supports file sharing we hand the file to the OS share sheet and the
 * user picks WhatsApp. If only text sharing works, we offer a text summary. If neither is
 * available we fall back to a download and tell the user to share manually.
 */

export type ShareCapability = 'file' | 'text' | 'none';

export interface ShareResult {
	status: 'shared' | 'cancelled' | 'downloaded' | 'unsupported';
	message: string;
}

export function shareCapability(): ShareCapability {
	if (typeof navigator === 'undefined' || !('share' in navigator)) return 'none';
	return 'text';
}

export function canShareFiles(file: File): boolean {
	if (typeof navigator === 'undefined') return false;
	const nav = navigator as Navigator & {
		canShare?: (data: ShareData) => boolean;
	};
	if (typeof nav.canShare !== 'function') return false;
	try {
		return nav.canShare({ files: [file] });
	} catch {
		return false;
	}
}

/** Attempt to share a generated report file. Falls back to download when unsupported. */
export async function shareFile(
	blob: Blob,
	filename: string,
	meta: { title: string; text?: string }
): Promise<ShareResult> {
	const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });

	if (canShareFiles(file)) {
		try {
			await navigator.share({
				files: [file],
				title: meta.title,
				text: meta.text
			});
			return { status: 'shared', message: 'Laporan dibagikan.' };
		} catch (error) {
			if ((error as DOMException)?.name === 'AbortError') {
				return { status: 'cancelled', message: 'Berbagi dibatalkan.' };
			}
			// Fall through to download on any other failure.
		}
	}

	downloadBlob(blob, filename);
	return {
		status: 'downloaded',
		message: 'File berhasil dibuat. Silakan download lalu bagikan melalui WhatsApp.'
	};
}

/** Share a plain-text summary via the OS share sheet. */
export async function shareText(text: string, title: string): Promise<ShareResult> {
	if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
		return {
			status: 'unsupported',
			message: 'Perangkat ini tidak mendukung berbagi teks. Salin rekap secara manual.'
		};
	}
	try {
		await navigator.share({ title, text });
		return { status: 'shared', message: 'Rekap dibagikan.' };
	} catch (error) {
		if ((error as DOMException)?.name === 'AbortError') {
			return { status: 'cancelled', message: 'Berbagi dibatalkan.' };
		}
		return { status: 'unsupported', message: 'Gagal membagikan rekap teks.' };
	}
}

export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		/* fall through */
	}
	return false;
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build the WhatsApp-ready text recap used as a fallback. */
export function buildTextRecap(summary: {
	className: string;
	periodLabel: string;
	present: number;
	late: number;
	permission: number;
	sick: number;
	absent: number;
	total: number;
	percentage: number;
}): string {
	return [
		`ABSENSI KELAS ${summary.className.toUpperCase()}`,
		summary.periodLabel,
		'',
		`Hadir: ${summary.present}`,
		`Terlambat: ${summary.late}`,
		`Izin: ${summary.permission}`,
		`Sakit: ${summary.sick}`,
		`Alpa: ${summary.absent}`,
		'',
		`Total: ${summary.total}`,
		`Kehadiran: ${summary.percentage.toFixed(1).replace('.', ',')}%`
	].join('\n');
}
