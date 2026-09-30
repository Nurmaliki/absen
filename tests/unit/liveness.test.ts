import { describe, expect, it } from 'vitest';
import {
	createBlinkTracker,
	createTurnTracker,
	evaluatePassive,
	headYaw,
	DEFAULT_LIVENESS
} from '$lib/face/liveness';

describe('evaluatePassive', () => {
	it('passes when disabled', () => {
		expect(evaluatePassive(0, { ...DEFAULT_LIVENESS, enabled: false }).passed).toBe(true);
	});

	it('does not block when no signal is available', () => {
		expect(evaluatePassive(null, DEFAULT_LIVENESS).passed).toBe(true);
	});

	it('fails a low realness score', () => {
		expect(evaluatePassive(0.2, DEFAULT_LIVENESS).passed).toBe(false);
	});

	it('passes a high realness score', () => {
		expect(evaluatePassive(0.9, DEFAULT_LIVENESS).passed).toBe(true);
	});
});

describe('blink tracker', () => {
	it('detects a full open->closed->open cycle within the window', () => {
		const tracker = createBlinkTracker();
		expect(tracker.update(0.05, 0)).toBe(false); // open
		expect(tracker.update(0.005, 100)).toBe(false); // closed
		expect(tracker.update(0.05, 250)).toBe(true); // open -> blink complete
	});

	it('rejects an unrealistically long closure', () => {
		const tracker = createBlinkTracker();
		tracker.update(0.05, 0);
		tracker.update(0.005, 100);
		expect(tracker.update(0.05, 2000)).toBe(false);
	});
});

describe('turn tracker', () => {
	it('triggers only for the requested direction beyond the threshold', () => {
		const left = createTurnTracker('left', 0.12);
		expect(left.update(0.3)).toBe(false); // turned right
		expect(left.update(-0.2)).toBe(true); // turned left
	});

	it('resets state', () => {
		const tracker = createTurnTracker('right', 0.12);
		tracker.update(0.2);
		tracker.reset();
		expect(tracker.update(0.05)).toBe(false);
	});
});

describe('headYaw', () => {
	it('is near 0 for a symmetric face', () => {
		const mesh = new Array(468).fill(0).map(() => ({ x: 0.5, y: 0.5 }));
		mesh[1] = { x: 0.5, y: 0.5 };
		mesh[0] = { x: 0.4, y: 0.5 };
		mesh[10] = { x: 0.6, y: 0.5 };
		// minX 0.4, maxX 0.6, center 0.5, nose 0.5 -> yaw 0
		expect(Math.abs(headYaw(mesh))).toBeLessThan(0.01);
	});
});
