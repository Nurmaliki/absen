/**
 * Liveness / anti-spoof layer.
 *
 * Honest scope (documented in README & /privacy):
 * - We expose a PASSIVE signal from the engine's antispoof model when available
 *   (a static "is this a real face vs. a photo/screen" score).
 * - We ALSO implement a CHALLENGE–RESPONSE flow (blink / turn head) which raises the bar
 *   for simple photo/screen attacks by requiring timed motion.
 *
 * Neither of these is a certified PAD (Presentation Attack Detection) solution. A
 * determined attacker with video replay can defeat challenge-response. This layer reduces
 * casual spoofing; it is NOT a guarantee. This is stated plainly to operators.
 */

export type LivenessMode = 'passive' | 'challenge';

export interface LivenessConfig {
	enabled: boolean;
	/** Minimum passive "realness" score (0..1) to accept a frame. */
	passiveThreshold: number;
	/** Max ms allowed to complete a challenge before it times out. */
	challengeTimeoutMs: number;
	/** Cooldown between accepted matches to avoid re-triggering during one scan. */
	cooldownMs: number;
}

export const DEFAULT_LIVENESS: LivenessConfig = {
	enabled: true,
	passiveThreshold: 0.5,
	challengeTimeoutMs: 8000,
	cooldownMs: 2500
};

/**
 * Evaluate the passive antispoof signal. `signal` is null when the engine provides none,
 * in which case we do not block (the caller may run a challenge instead).
 */
export function evaluatePassive(
	signal: number | null,
	config: LivenessConfig
): { passed: boolean; message: string } {
	if (!config.enabled) return { passed: true, message: 'Pemeriksaan liveness dimatikan.' };
	if (signal === null) {
		return {
			passed: true,
			message: 'Sinyal liveness pasif tidak tersedia pada perangkat ini.'
		};
	}
	if (signal < config.passiveThreshold) {
		return {
			passed: false,
			message: 'Terdeteksi kemungkinan foto/tayangan. Gunakan wajah asli di depan kamera.'
		};
	}
	return { passed: true, message: 'Liveness terverifikasi.' };
}

interface Point {
	x: number;
	y: number;
}

/**
 * Landmark-based gesture detection used by the challenge flow.
 * These operate on facemesh-style normalized landmarks (0..1 coordinates).
 */
export interface LandmarkShape {
	/** Normalized landmarks, index-aligned with MediaPipe facemesh ordering used by Human. */
	mesh: Point[];
}

const LEFT_EYE_UPPER = 159;
const LEFT_EYE_LOWER = 145;
const RIGHT_EYE_UPPER = 386;
const RIGHT_EYE_LOWER = 374;
const NOSE_TIP = 1;

/** Eye-aspect-ratio approximation for blink detection. */
export function eyeOpenness(mesh: Point[]): number {
	if (mesh.length < 400) return 1;
	const left = Math.abs(mesh[LEFT_EYE_UPPER].y - mesh[LEFT_EYE_LOWER].y);
	const right = Math.abs(mesh[RIGHT_EYE_UPPER].y - mesh[RIGHT_EYE_LOWER].y);
	return (left + right) / 2;
}

/** Head yaw proxy: nose x relative to face center x. >0 means turned to the person's left. */
export function headYaw(mesh: Point[]): number {
	if (mesh.length < 2) return 0;
	let minX = 1;
	let maxX = 0;
	for (const point of mesh) {
		if (point.x < minX) minX = point.x;
		if (point.x > maxX) maxX = point.x;
	}
	const center = (minX + maxX) / 2;
	const width = Math.max(0.0001, maxX - minX);
	return (mesh[NOSE_TIP].x - center) / width; // roughly -0.5..0.5
}

export interface BlinkTracker {
	update(openness: number, timestampMs: number): boolean; // returns true when a blink completes
	reset(): void;
}

/** Simple hysteresis blink tracker: open -> closed -> open within a time window. */
export function createBlinkTracker(closedThreshold = 0.012, openThreshold = 0.02): BlinkTracker {
	let state: 'open' | 'closed' = 'open';
	let closedAt = 0;
	return {
		update(openness: number, timestampMs: number) {
			if (state === 'open' && openness < closedThreshold) {
				state = 'closed';
				closedAt = timestampMs;
			} else if (state === 'closed' && openness > openThreshold) {
				const duration = timestampMs - closedAt;
				state = 'open';
				// A human blink lasts roughly 100–400ms.
				return duration > 60 && duration < 800;
			}
			return false;
		},
		reset() {
			state = 'open';
			closedAt = 0;
		}
	};
}

/** Tracks a left/right head-turn gesture. */
export function createTurnTracker(
	direction: 'left' | 'right',
	threshold = 0.12
): {
	update(yaw: number): boolean;
	reset(): void;
} {
	let reached = false;
	const target = direction === 'left' ? -1 : 1;
	return {
		update(yaw: number) {
			if (reached) return true;
			if (Math.sign(yaw) === target && Math.abs(yaw) >= threshold) reached = true;
			return reached;
		},
		reset() {
			reached = false;
		}
	};
}

/**
 * Pick a challenge. We use blink as the primary gesture because head-turn detection on
 * loose front-camera framing is noisier; head-turn is the fallback.
 */
export function pickChallenge(): 'blink' | 'turn-left' | 'turn-right' {
	return 'blink';
}

export const CHALLENGE_INSTRUCTIONS: Record<string, string> = {
	blink: 'Silakan berkedip perlahan untuk memverifikasi.',
	'turn-left': 'Silakan menoleh sedikit ke kiri.',
	'turn-right': 'Silakan menoleh sedikit ke kanan.'
};
