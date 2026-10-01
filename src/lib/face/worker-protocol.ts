import type { DescriptorResult, DetectedFace } from './types';

/**
 * Message protocol between the main thread and the face Web Worker.
 *
 * Only *inference* crosses the boundary. `compare()` (a pure vector distance over a 1024-dim
 * array, sub-millisecond) stays on the main thread — round-tripping it through the worker
 * would cost more than it saves.
 *
 * Image data is sent as `ImageBitmap`, which is a transferable: the payload is moved rather
 * than structured-cloned, so sending a frame does not copy pixel data.
 */

export type FaceWorkerRequest =
	| { id: number; op: 'init' }
	| { id: number; op: 'detect'; bitmap: ImageBitmap }
	| { id: number; op: 'descriptor'; bitmap: ImageBitmap }
	| { id: number; op: 'liveness'; bitmap: ImageBitmap };

/** Request without the correlation id (added by the engine before posting). */
export type FaceWorkerRequestInput =
	| { op: 'init' }
	| { op: 'detect'; bitmap: ImageBitmap }
	| { op: 'descriptor'; bitmap: ImageBitmap }
	| { op: 'liveness'; bitmap: ImageBitmap };

export type FaceWorkerResponse =
	| { id: number; ok: true; op: 'init'; backend: string | null }
	| { id: number; ok: true; op: 'detect'; faces: DetectedFace[] }
	| { id: number; ok: true; op: 'descriptor'; result: DescriptorResult | null }
	| { id: number; ok: true; op: 'liveness'; signal: number | null }
	| { id: number; ok: false; error: string }
	| { id: number; ok: 'progress'; message: string; ratio?: number };

/** Detect a progress notification (not tied to a request id). */
export function isProgress(
	message: FaceWorkerResponse
): message is { id: number; ok: 'progress'; message: string; ratio?: number } {
	return (message as { ok: unknown }).ok === 'progress';
}
