import type { FaceEngine } from './types';
import { HumanFaceEngine } from './adapter';

/**
 * Engine factory + singleton.
 *
 * The rest of the app talks to `getFaceEngine()`. Swapping the recognition library means
 * adding a new `FaceEngine` adapter here and returning it — no UI changes required.
 */

let engine: FaceEngine | null = null;

export function getFaceEngine(): FaceEngine {
	if (!engine) {
		engine = new HumanFaceEngine();
	}
	return engine;
}

/** For tests / hot paths that need to force-reset the loaded model. */
export function resetFaceEngine(): void {
	engine?.dispose?.();
	engine = null;
}

export * from './types';
