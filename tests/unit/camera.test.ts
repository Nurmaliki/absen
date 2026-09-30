import { describe, expect, it } from 'vitest';
import { CAMERA_MESSAGES, mapCameraError } from '$lib/utils/camera';

describe('mapCameraError', () => {
	it('maps NotAllowedError to an actionable Indonesian message', () => {
		const result = mapCameraError({ name: 'NotAllowedError' });
		expect(result.code).toBe('NotAllowedError');
		expect(result.message).toMatch(/ditolak/i);
		expect(result.hint).toMatch(/izin kamera/i);
	});

	it.each([
		'NotFoundError',
		'NotReadableError',
		'OverconstrainedError',
		'SecurityError',
		'NotSupportedError'
	])('maps %s to a known code with a message', (name) => {
		const result = mapCameraError({ name });
		expect(result.code).toBe(name);
		expect(result.message.length).toBeGreaterThan(0);
		expect(result.hint.length).toBeGreaterThan(0);
	});

	it('falls back to a generic message for unknown errors', () => {
		expect(mapCameraError(new Error('boom')).code).toBe('unknown');
		expect(mapCameraError({ name: 'WeirdError' }).code).toBe('unknown');
	});

	it('handles null/undefined gracefully', () => {
		expect(mapCameraError(null).code).toBe('unknown');
		expect(mapCameraError(undefined).code).toBe('unknown');
	});

	it('has a message for every documented code', () => {
		for (const code of Object.keys(CAMERA_MESSAGES)) {
			expect(CAMERA_MESSAGES[code as keyof typeof CAMERA_MESSAGES].message).toBeTruthy();
		}
	});
});
