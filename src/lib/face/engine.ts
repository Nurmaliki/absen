import type { FaceEngine } from './types';
import { HumanFaceEngine } from './adapter';
import { WorkerFaceEngine } from './worker-engine';

/**
 * Engine factory + singleton.
 *
 * The rest of the app talks to `getFaceEngine()`. Swapping the recognition library means
 * adding a new `FaceEngine` adapter here and returning it — no UI changes required.
 *
 * Preference order:
 *  1. `WorkerFaceEngine` — inference off the UI thread (default on capable browsers).
 *  2. `HumanFaceEngine`  — main-thread fallback when workers/OffscreenCanvas are unavailable.
 * Users can force the main-thread path from Settings (useful for troubleshooting on devices
 * where a worker backend misbehaves) via `setFaceEnginePreference()`.
 */

export type FaceEngineKind = 'auto' | 'worker' | 'main';

let engine: FaceEngine | null = null;
let engineKind: FaceEngineKind = 'auto';

export function setFaceEnginePreference(kind: FaceEngineKind): void {
	if (kind === engineKind) return;
	engineKind = kind;
	// Force a rebuild on the next `getFaceEngine()`.
	engine?.dispose?.();
	engine = null;
}

export function getFaceEngineKind(): FaceEngineKind {
	return engineKind;
}

function buildEngine(): FaceEngine {
	if (engineKind === 'worker') return new WorkerFaceEngine();
	if (engineKind === 'main') return new HumanFaceEngine();
	return WorkerFaceEngine.isSupported() ? new WorkerFaceEngine() : new HumanFaceEngine();
}

export function getFaceEngine(): FaceEngine {
	if (!engine) {
		engine = buildEngine();
	}
	return engine;
}

/** For tests / hot paths that need to force-reset the loaded model. */
export function resetFaceEngine(): void {
	engine?.dispose?.();
	engine = null;
}

export { WorkerFaceEngine } from './worker-engine';
export { HumanFaceEngine } from './adapter';
export * from './types';
