import type { RecognitionMatch } from './types';
import type { FaceTemplate } from '$lib/types';
import { normalizeVector } from './quality';

/**
 * Descriptor matching.
 *
 * The Human.js face-recognition embeddings are compared with a **cosine distance**
 * (`1 - cosineSimilarity`), which lives in roughly [0, 2] with typical same-person
 * values well below ~0.5 and different-person values above ~0.6 for this model family.
 *
 * IMPORTANT: We expose the raw distance AND a derived similarity but never present a
 * "confidence %" that is not mathematically grounded. The settings threshold is a
 * distance cutoff, documented on the settings page.
 */

export function cosineDistance(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return Number.POSITIVE_INFINITY;
	const similarity = dot / denom;
	return 1 - similarity;
}

/** Map a cosine distance to a 0..1 similarity for display only. */
export function distanceToSimilarity(distance: number): number {
	if (!Number.isFinite(distance)) return 0;
	// cosine distance ∈ [0,2] -> similarity ∈ [0,1]
	return Math.max(0, Math.min(1, 1 - distance / 2));
}

export function euclideanDistance(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

export interface MatchOptions {
	/** Maximum accepted cosine distance. Lower = stricter. */
	threshold: number;
	/**
	 * Required gap between the best and second-best candidate. Prevents ambiguous
	 * matches between look-alike students (a common false-positive source in classrooms).
	 */
	margin: number;
}

export interface MatchOutcome {
	match: RecognitionMatch | null;
	reason: 'matched' | 'below_threshold' | 'ambiguous' | 'no_templates';
	bestDistance: number | null;
	secondBestDistance: number | null;
}

/**
 * Match a probe descriptor against a set of templates scoped to the current class.
 * Returns `null` on ambiguity (two close candidates) rather than guessing.
 */
export function findBestMatch(
	probe: number[],
	templates: FaceTemplate[],
	options: MatchOptions
): MatchOutcome {
	if (templates.length === 0) {
		return { match: null, reason: 'no_templates', bestDistance: null, secondBestDistance: null };
	}
	const normalized = normalizeVector(probe);

	const scored = templates
		.map((template) => ({
			studentId: template.studentId,
			distance: cosineDistance(normalized, template.descriptor)
		}))
		.filter((entry) => Number.isFinite(entry.distance))
		.sort((a, b) => a.distance - b.distance);

	if (scored.length === 0) {
		return { match: null, reason: 'no_templates', bestDistance: null, secondBestDistance: null };
	}

	const best = scored[0];
	const second = scored[1];

	if (best.distance > options.threshold) {
		return {
			match: null,
			reason: 'below_threshold',
			bestDistance: best.distance,
			secondBestDistance: second?.distance ?? null
		};
	}

	if (second && second.distance - best.distance < options.margin) {
		return {
			match: null,
			reason: 'ambiguous',
			bestDistance: best.distance,
			secondBestDistance: second.distance
		};
	}

	return {
		match: {
			studentId: best.studentId,
			distance: best.distance,
			similarity: distanceToSimilarity(best.distance)
		},
		reason: 'matched',
		bestDistance: best.distance,
		secondBestDistance: second?.distance ?? null
	};
}
