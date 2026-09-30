import { describe, expect, it } from 'vitest';
import {
	averageDescriptors,
	centerScore,
	descriptorConsistency,
	evaluateQuality,
	faceRatio,
	normalizeVector,
	QUALITY_MESSAGES
} from '$lib/face/quality';

const frame = { width: 320, height: 240 };

describe('faceRatio & centerScore', () => {
	it('computes occupancy ratio', () => {
		expect(faceRatio({ x: 0, y: 0, width: 160, height: 120 }, 320, 240)).toBeCloseTo(0.25, 5);
	});

	it('returns 1 for a centered box and lower for off-center', () => {
		const centered = centerScore({ x: 120, y: 80, width: 80, height: 80 }, 320, 240);
		const corner = centerScore({ x: 0, y: 0, width: 40, height: 40 }, 320, 240);
		expect(centered).toBeGreaterThan(corner);
	});
});

describe('evaluateQuality', () => {
	it('rejects when no face is detected', () => {
		const report = evaluateQuality([], frame.width, frame.height);
		expect(report.ok).toBe(false);
		expect(report.issues).toContain(QUALITY_MESSAGES.noFace);
	});

	it('rejects multiple faces', () => {
		const box = { x: 100, y: 60, width: 100, height: 100 };
		const report = evaluateQuality(
			[
				{ box, score: 0.9 },
				{ box, score: 0.9 }
			],
			frame.width,
			frame.height
		);
		expect(report.ok).toBe(false);
		expect(report.issues).toContain(QUALITY_MESSAGES.multipleFaces);
	});

	it('flags a too-small face', () => {
		const report = evaluateQuality(
			[{ box: { x: 150, y: 110, width: 10, height: 10 }, score: 0.9 }],
			frame.width,
			frame.height
		);
		expect(report.issues).toContain(QUALITY_MESSAGES.tooSmall);
	});

	it('flags low brightness', () => {
		const report = evaluateQuality(
			[{ box: { x: 100, y: 60, width: 100, height: 100 }, score: 0.95 }],
			frame.width,
			frame.height,
			{ mean: 0.05, contrast: 0.2 }
		);
		expect(report.issues).toContain(QUALITY_MESSAGES.tooDark);
	});

	it('accepts a well-framed, well-lit face', () => {
		const report = evaluateQuality(
			[{ box: { x: 100, y: 60, width: 120, height: 140 }, score: 0.98 }],
			frame.width,
			frame.height,
			{ mean: 0.55, contrast: 0.15 }
		);
		expect(report.ok).toBe(true);
		expect(report.score).toBeGreaterThan(0.5);
	});
});

describe('normalizeVector & averageDescriptors', () => {
	it('produces a unit vector', () => {
		const v = normalizeVector([3, 4]);
		expect(Math.hypot(...v)).toBeCloseTo(1, 10);
	});

	it('averages descriptors and normalizes', () => {
		const avg = averageDescriptors([
			[1, 0],
			[0, 1]
		]);
		expect(Math.hypot(...avg)).toBeCloseTo(1, 10);
		expect(avg[0]).toBeCloseTo(avg[1], 10);
	});

	it('returns [] for no descriptors', () => {
		expect(averageDescriptors([])).toEqual([]);
	});
});

describe('descriptorConsistency', () => {
	const compare = (a: number[], b: number[]) => {
		let dot = 0;
		for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
		return 1 - dot; // 0 for identical unit vectors
	};

	it('is consistent for near-identical descriptors', () => {
		const result = descriptorConsistency(
			[
				[1, 0],
				[0.99, 0.01],
				[1, 0]
			],
			compare,
			0.2
		);
		expect(result.consistent).toBe(true);
	});

	it('is inconsistent for divergent descriptors', () => {
		const result = descriptorConsistency(
			[
				[1, 0],
				[0, 1]
			],
			compare,
			0.1
		);
		expect(result.consistent).toBe(false);
	});

	it('treats a single sample as consistent', () => {
		expect(descriptorConsistency([[1, 0]], compare, 0.1).consistent).toBe(true);
	});
});
