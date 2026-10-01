import { describe, expect, it } from 'vitest';
import { buildQrPayload, parseQrPayload, QR_PREFIX } from '$lib/reports/qr';

/**
 * QR payload format tests.
 *
 * The format is the security boundary for the QR fallback: only payloads we generated may
 * resolve to a student, so a random QR code in the classroom can never record attendance.
 */

describe('buildQrPayload', () => {
	it('encodes the prefix, student id and NIS', () => {
		const payload = buildQrPayload({ id: 'stu-1', nis: '12345' });
		expect(payload).toBe(`${QR_PREFIX}:stu-1:12345`);
	});
});

describe('parseQrPayload', () => {
	it('round-trips a generated payload', () => {
		const built = buildQrPayload({ id: 'stu-9', nis: '999' });
		expect(parseQrPayload(built)).toEqual({ studentId: 'stu-9', nis: '999' });
	});

	it('rejects payloads from other systems', () => {
		expect(parseQrPayload('https://example.com')).toBeNull();
		expect(parseQrPayload('ABSEN:only-two')).toBeNull();
		expect(parseQrPayload('OTHER:stu-1:123')).toBeNull();
		expect(parseQrPayload('')).toBeNull();
	});

	it('rejects a payload with an empty id or NIS', () => {
		expect(parseQrPayload('ABSEN::123')).toBeNull();
		expect(parseQrPayload('ABSEN:stu-1:')).toBeNull();
	});

	it('tolerates surrounding whitespace', () => {
		expect(parseQrPayload('  ABSEN:stu-1:123  ')).toEqual({ studentId: 'stu-1', nis: '123' });
	});
});
