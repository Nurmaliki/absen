import type { DetectedFace, FaceBox, QualityReport } from './types';
import { clamp } from '$lib/utils/id';

/**
 * Frame quality gating. These checks run *before* a descriptor is trusted, both during
 * face registration (multi-sample) and during live attendance scanning.
 *
 * Thresholds are deliberately conservative and documented so operators understand why a
 * scan may be rejected. They are heuristics over detection geometry + image statistics,
 * not a claim of biometric-grade quality control.
 */

export interface QualityOptions {
	/** Minimum fraction of the frame the face box should occupy (0..1). */
	minFaceRatio?: number;
	/** Maximum fraction of the frame (rejects faces pressed against the lens). */
	maxFaceRatio?: number;
	/** Minimum mean luminance (0..1) below which the scene is "too dark". */
	minBrightness?: number;
	/** Maximum mean luminance above which the scene is "overexposed". */
	maxBrightness?: number;
	/** Minimum stddev of luminance (0..1) below which the frame looks flat/washed. */
	minContrast?: number;
}

export const DEFAULT_QUALITY: Required<QualityOptions> = {
	minFaceRatio: 0.06,
	maxFaceRatio: 0.9,
	minBrightness: 0.16,
	maxBrightness: 0.96,
	minContrast: 0.04
};

export const QUALITY_MESSAGES = {
	noFace: 'Wajah tidak terdeteksi. Posisikan wajah di dalam bingkai.',
	multipleFaces: 'Terdeteksi lebih dari satu wajah. Pastikan hanya satu orang di depan kamera.',
	tooSmall: 'Wajah terlalu kecil. Silakan mendekat ke kamera.',
	tooLarge: 'Wajah terlalu dekat. Silakan menjauh sedikit dari kamera.',
	offCenter: 'Posisikan wajah di tengah bingkai.',
	tooDark: 'Pencahayaan kurang. Silakan pindah ke tempat yang lebih terang.',
	tooBright: 'Pencahayaan terlalu terang. Hindari cahaya langsung ke wajah.',
	lowContrast: 'Gambar kurang jelas. Periksa pencahayaan dan fokus kamera.',
	ok: 'Kualitas wajah baik.'
} as const;

/**
 * Compute the face-box occupancy ratio relative to the frame area.
 */
export function faceRatio(box: FaceBox, frameWidth: number, frameHeight: number): number {
	if (frameWidth <= 0 || frameHeight <= 0) return 0;
	return (box.width * box.height) / (frameWidth * frameHeight);
}

/** How centered the box is: 1 = dead center, 0 = touching an edge. */
export function centerScore(box: FaceBox, frameWidth: number, frameHeight: number): number {
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const dx = Math.abs(cx - frameWidth / 2) / (frameWidth / 2);
	const dy = Math.abs(cy - frameHeight / 2) / (frameHeight / 2);
	return clamp(1 - Math.max(dx, dy), 0, 1);
}

/** Mean + variance of grayscale luminance of a canvas. Returns 0..1 normalized values. */
export function luminanceStats(
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	width: number,
	height: number
): { mean: number; contrast: number } {
	if (width <= 0 || height <= 0) return { mean: 0, contrast: 0 };
	// Sample a grid to keep this cheap on low-end devices (no full-frame read).
	const sampleW = Math.min(width, 64);
	const sampleH = Math.min(height, 48);
	const cellW = Math.max(1, Math.floor(width / sampleW));
	const cellH = Math.max(1, Math.floor(height / sampleH));
	let sum = 0;
	let sumSq = 0;
	let count = 0;
	try {
		const data = ctx.getImageData(0, 0, width, height).data;
		for (let y = 0; y < height; y += cellH) {
			for (let x = 0; x < width; x += cellW) {
				const idx = (y * width + x) * 4;
				const lum = (0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]) / 255;
				sum += lum;
				sumSq += lum * lum;
				count++;
			}
		}
	} catch {
		return { mean: 0, contrast: 0 };
	}
	if (count === 0) return { mean: 0, contrast: 0 };
	const mean = sum / count;
	const variance = Math.max(0, sumSq / count - mean * mean);
	return { mean, contrast: Math.sqrt(variance) };
}

/**
 * Evaluate a frame given its detected faces and (optional) luminance stats.
 * Returns a structured, displayable report rather than throwing.
 */
export function evaluateQuality(
	faces: DetectedFace[],
	frameWidth: number,
	frameHeight: number,
	luminance?: { mean: number; contrast: number },
	options: QualityOptions = {}
): QualityReport {
	const opts = { ...DEFAULT_QUALITY, ...options };
	const issues: string[] = [];

	if (faces.length === 0) {
		return { ok: false, score: 0, issues: [QUALITY_MESSAGES.noFace] };
	}
	if (faces.length > 1) {
		return { ok: false, score: 0, issues: [QUALITY_MESSAGES.multipleFaces] };
	}

	const face = faces[0];
	const ratio = faceRatio(face.box, frameWidth, frameHeight);
	const center = centerScore(face.box, frameWidth, frameHeight);

	if (ratio < opts.minFaceRatio) issues.push(QUALITY_MESSAGES.tooSmall);
	if (ratio > opts.maxFaceRatio) issues.push(QUALITY_MESSAGES.tooLarge);
	if (center < 0.35) issues.push(QUALITY_MESSAGES.offCenter);

	let score = 0.4; // baseline for a single detected face
	score += clamp(ratio / 0.25, 0, 1) * 0.25;
	score += center * 0.2;
	score += clamp(face.score, 0, 1) * 0.15;

	if (luminance) {
		if (luminance.mean < opts.minBrightness) issues.push(QUALITY_MESSAGES.tooDark);
		else if (luminance.mean > opts.maxBrightness) issues.push(QUALITY_MESSAGES.tooBright);
		if (luminance.contrast < opts.minContrast) issues.push(QUALITY_MESSAGES.lowContrast);
		// Reward a mid-range brightness.
		const brightnessPenalty = Math.abs(luminance.mean - 0.55);
		score *= clamp(1 - brightnessPenalty, 0.4, 1);
	}

	score = clamp(score, 0, 1);
	return { ok: issues.length === 0, score, issues };
}

/**
 * Consistency check across multiple registration samples.
 * Rejects a registration set when descriptors are too far apart (inconsistent face angle
 * or a different person appearing mid-capture).
 */
export function descriptorConsistency(
	descriptors: number[][],
	compare: (a: number[], b: number[]) => number,
	maxAverageDistance: number
): { consistent: boolean; averageDistance: number; maxDistance: number } {
	if (descriptors.length < 2) {
		return { consistent: true, averageDistance: 0, maxDistance: 0 };
	}
	let sum = 0;
	let count = 0;
	let max = 0;
	for (let i = 0; i < descriptors.length; i++) {
		for (let j = i + 1; j < descriptors.length; j++) {
			const d = compare(descriptors[i], descriptors[j]);
			sum += d;
			max = Math.max(max, d);
			count++;
		}
	}
	const average = count > 0 ? sum / count : 0;
	return { consistent: average <= maxAverageDistance, averageDistance: average, maxDistance: max };
}

/**
 * Average multiple descriptors into one robust template. Averaging reduces frame noise
 * versus storing a single frame (the rationale for multi-sample registration).
 */
export function averageDescriptors(descriptors: number[][]): number[] {
	if (descriptors.length === 0) return [];
	const length = descriptors[0].length;
	const result = new Array<number>(length).fill(0);
	for (const descriptor of descriptors) {
		for (let i = 0; i < length; i++) result[i] += descriptor[i] ?? 0;
	}
	for (let i = 0; i < length; i++) result[i] /= descriptors.length;
	// Normalize to unit length so cosine distance stays well-behaved.
	return normalizeVector(result);
}

export function normalizeVector(vector: number[]): number[] {
	let norm = 0;
	for (const value of vector) norm += value * value;
	norm = Math.sqrt(norm);
	if (norm === 0) return vector;
	return vector.map((value) => value / norm);
}
