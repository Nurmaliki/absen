import { BrowserQRCodeSvgWriter } from '@zxing/browser';
import type { Student } from '$lib/types';

/**
 * QR fallback for attendance.
 *
 * When face recognition fails or a student has no registered face, a printed/displayed QR
 * code can still record attendance. This uses `@zxing/browser` (already a dependency for
 * reading) to *generate* the code too — no extra library, and nothing leaves the device.
 *
 * Payload format: `ABSEN:<studentId>:<nis>` — the id is authoritative, the NIS is a human
 * readable check. `parseQrPayload` is strict so a random QR in the room cannot record a
 * bogus attendance; callers must still resolve the id to a real student in the session.
 */

const PREFIX = 'ABSEN';

export interface QrPayload {
	studentId: string;
	nis: string;
}

export function buildQrPayload(student: Pick<Student, 'id' | 'nis'>): string {
	return `${PREFIX}:${student.id}:${student.nis}`;
}

/** Parse our payload, returning null for anything that is not ours. */
export function parseQrPayload(text: string): QrPayload | null {
	const trimmed = (text ?? '').trim();
	const parts = trimmed.split(':');
	if (parts.length !== 3) return null;
	const [prefix, studentId, nis] = parts;
	if (prefix !== PREFIX || !studentId || !nis) return null;
	return { studentId, nis };
}

/**
 * Render a student's QR as an SVG element. The caller decides how to mount it.
 * Generating the code is fully local; no network request is made.
 */
export function renderStudentQrSvg(
	student: Pick<Student, 'id' | 'nis'>,
	size = 160
): SVGSVGElement {
	const writer = new BrowserQRCodeSvgWriter();
	return writer.write(buildQrPayload(student), size, size);
}

export { PREFIX as QR_PREFIX };
