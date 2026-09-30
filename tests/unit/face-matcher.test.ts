import { describe, expect, it } from 'vitest';
import { cosineDistance, distanceToSimilarity, findBestMatch } from '$lib/face/matcher';
import { normalizeVector } from '$lib/face/quality';
import type { FaceTemplate } from '$lib/types';

function template(studentId: string, descriptor: number[]): FaceTemplate {
	return {
		id: studentId,
		studentId,
		descriptor,
		metric: 'cosine',
		modelVersion: 'test',
		createdAt: '',
		updatedAt: ''
	};
}

describe('cosineDistance', () => {
	it('is 0 for identical vectors', () => {
		expect(cosineDistance([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 10);
	});

	it('is ~1 for orthogonal vectors', () => {
		expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1, 10);
	});

	it('is ~2 for opposite vectors', () => {
		expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2, 10);
	});

	it('returns Infinity for mismatched or empty vectors', () => {
		expect(cosineDistance([1, 2], [1, 2, 3])).toBe(Number.POSITIVE_INFINITY);
		expect(cosineDistance([], [])).toBe(Number.POSITIVE_INFINITY);
	});
});

describe('distanceToSimilarity', () => {
	it('maps distance 0 -> similarity 1 and distance 2 -> 0', () => {
		expect(distanceToSimilarity(0)).toBe(1);
		expect(distanceToSimilarity(2)).toBe(0);
		expect(distanceToSimilarity(1)).toBeCloseTo(0.5, 10);
	});
});

describe('findBestMatch', () => {
	const base = normalizeVector([0.9, 0.1, 0.2, 0.3]);
	const near = normalizeVector([0.88, 0.12, 0.21, 0.31]);
	const far = normalizeVector([0.1, 0.9, 0.2, 0.3]);

	it('matches the closest template within threshold', () => {
		const outcome = findBestMatch(base, [template('s1', near), template('s2', far)], {
			threshold: 0.5,
			margin: 0.05
		});
		expect(outcome.reason).toBe('matched');
		expect(outcome.match?.studentId).toBe('s1');
	});

	it('rejects when best distance exceeds threshold', () => {
		const outcome = findBestMatch(base, [template('s1', far)], { threshold: 0.1, margin: 0.05 });
		expect(outcome.reason).toBe('below_threshold');
		expect(outcome.match).toBeNull();
	});

	it('reports ambiguity when two candidates are within margin', () => {
		const t1 = normalizeVector([0.9, 0.1, 0.2, 0.3001]);
		const t2 = normalizeVector([0.9, 0.1, 0.2, 0.3002]);
		const outcome = findBestMatch(base, [template('s1', t1), template('s2', t2)], {
			threshold: 0.5,
			margin: 0.3
		});
		expect(outcome.reason).toBe('ambiguous');
		expect(outcome.match).toBeNull();
	});

	it('returns no_templates for an empty template set', () => {
		const outcome = findBestMatch(base, [], { threshold: 0.5, margin: 0.05 });
		expect(outcome.reason).toBe('no_templates');
	});
});
