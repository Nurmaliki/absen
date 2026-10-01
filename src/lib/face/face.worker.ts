/// <reference lib="webworker" />

import { HumanEngineCore, type HumanModule } from './core';
import type { FaceWorkerRequest, FaceWorkerResponse } from './worker-protocol';

/**
 * Face inference Web Worker.
 *
 * Runs the identical `HumanEngineCore` used by the main-thread adapter, but off the UI thread.
 * At the scanner's 8 fps this keeps the main thread free for rendering, input and camera
 * frames, which is what makes the "no UI freeze" promise real on low-end classroom devices.
 *
 * Frames arrive as `ImageBitmap` (transferable). We draw each onto a *reused* OffscreenCanvas
 * so luminance/quality analysis works exactly as on the main thread, then compute the
 * descriptor inside the core.
 *
 * No network access, no storage — the worker only receives pixels and returns vectors.
 */

const core = new HumanEngineCore();

/** Reused canvas so we allocate once, not per frame. */
let scratch: OffscreenCanvas | null = null;

function getScratch(width: number, height: number): OffscreenCanvas {
	if (!scratch || scratch.width !== width || scratch.height !== height) {
		scratch = new OffscreenCanvas(width, height);
	}
	return scratch;
}

function drawToScratch(bitmap: ImageBitmap): OffscreenCanvas | null {
	const { width, height } = bitmap;
	if (!width || !height) return null;
	const canvas = getScratch(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(bitmap, 0, 0, width, height);
	return canvas;
}

self.addEventListener('message', async (event: MessageEvent<FaceWorkerRequest>) => {
	const request = event.data;

	try {
		if (request.op === 'init') {
			await core.initialize(
				async () => (await import('@vladmandic/human')) as unknown as HumanModule,
				(message, ratio) => {
					post({ id: request.id, ok: 'progress', message, ratio });
				}
			);
			post({ id: request.id, ok: true, op: 'init', backend: core.activeBackend });
			return;
		}

		// All remaining ops need a decoded frame; prefer the canvas for luminance stats.
		const canvas = drawToScratch(request.bitmap);
		const source = canvas ?? request.bitmap;
		try {
			if (request.op === 'detect') {
				const faces = await core.detect(source);
				// `raw` may contain non-cloneable engine internals — strip it, but keep the
				// flattened mesh so challenge–response liveness can read it later.
				post({
					id: request.id,
					ok: true,
					op: 'detect',
					faces: faces.map((face) => ({ box: face.box, score: face.score, mesh: face.mesh }))
				});
			} else if (request.op === 'descriptor') {
				const result = await core.generateDescriptor(source);
				post({ id: request.id, ok: true, op: 'descriptor', result });
			} else if (request.op === 'liveness') {
				const signal = await core.passiveLiveness(source);
				post({ id: request.id, ok: true, op: 'liveness', signal });
			}
		} finally {
			request.bitmap.close();
		}
	} catch (error) {
		post({
			id: request.id,
			ok: false,
			error: error instanceof Error ? error.message : 'Terjadi kesalahan pada worker wajah.'
		});
	}
});

function post(message: FaceWorkerResponse): void {
	(self as unknown as Worker).postMessage(message);
}
