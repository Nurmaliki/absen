import type { DescriptorResult, DetectedFace, FaceEngine, ImageSource } from './types';
import { cosineDistance } from './matcher';
import {
	isProgress,
	type FaceWorkerRequest,
	type FaceWorkerRequestInput,
	type FaceWorkerResponse
} from './worker-protocol';

/**
 * Face engine that proxies inference to a Web Worker.
 *
 * The main thread only converts a frame to an `ImageBitmap` (a cheap, transferable copy) and
 * posts it; the heavy TFJS inference runs on a separate thread. This is the default engine on
 * capable browsers — see `engine.ts` for the capability check and `adapter.ts` for the
 * main-thread fallback.
 *
 * Requests are serialised through a single in-flight promise chain: the scanner already caps
 * itself at ~8 fps and skips frames while busy, so queueing here would only add latency.
 * Pending requests are completed on `error`/`messageerror` so a crashed worker rejects rather
 * than hangs forever.
 */

interface Pending {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	op: FaceWorkerRequestInput['op'];
}

export class WorkerFaceEngine implements FaceEngine {
	readonly name = 'human-worker';
	readonly modelVersion = 'human-3.x-faceres';
	readonly metric = 'cosine' as const;

	private worker: Worker | null = null;
	private pending = new Map<number, Pending>();
	private nextId = 1;
	private ready = false;
	private initializing: Promise<void> | null = null;
	private backend: string | null = null;

	/** Whether the runtime supports everything this engine needs. */
	static isSupported(): boolean {
		if (typeof window === 'undefined' || typeof Worker === 'undefined') return false;
		if (typeof OffscreenCanvas === 'undefined') return false;
		if (typeof createImageBitmap === 'undefined') return false;
		return true;
	}

	isReady(): boolean {
		return this.ready;
	}

	/** Which backend the worker selected (webgl/wasm/cpu), for diagnostics. */
	get activeBackend(): string | null {
		return this.backend;
	}

	async initialize(onProgress?: (message: string, ratio?: number) => void): Promise<void> {
		if (this.ready) return;
		if (this.initializing) return this.initializing;

		this.initializing = (async () => {
			this.worker = new Worker(new URL('./face.worker.ts', import.meta.url), {
				type: 'module',
				name: 'absensi-face'
			});
			this.attachHandlers();
			const result = (await this.send({ op: 'init' }, onProgress)) as { backend: string | null };
			this.backend = result.backend;
			this.ready = true;
		})();

		try {
			await this.initializing;
		} finally {
			this.initializing = null;
		}
	}

	private attachHandlers(): void {
		if (!this.worker) return;
		this.worker.addEventListener('message', (event: MessageEvent<FaceWorkerResponse>) => {
			const message = event.data;
			if (isProgress(message)) return; // routed via the per-request progress callback
			const entry = this.pending.get(message.id);
			if (!entry) return;
			this.pending.delete(message.id);
			if (message.ok === false) {
				entry.reject(new Error(message.error));
			} else {
				entry.resolve(message);
			}
		});
		this.worker.addEventListener('error', (event) => {
			this.failAll(new Error(event.message || 'Worker wajah berhenti tak terduga.'));
		});
		this.worker.addEventListener('messageerror', () => {
			this.failAll(new Error('Gagal mengirim data ke worker wajah.'));
		});
	}

	private failAll(error: Error): void {
		for (const entry of this.pending.values()) entry.reject(error);
		this.pending.clear();
		this.ready = false;
	}

	/**
	 * Post a request and await its typed response. `init` streams progress through
	 * `onProgress`; other ops have no progress channel.
	 */
	private send(
		request: FaceWorkerRequestInput,
		onProgress?: (message: string, ratio?: number) => void
	): Promise<unknown> {
		if (!this.worker) return Promise.reject(new Error('Worker wajah belum dibuat.'));
		const worker = this.worker;
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject, op: request.op });
			const full = { ...request, id } as FaceWorkerRequest;
			// Attach a one-shot progress listener for init only.
			if (onProgress) {
				const listener = (event: MessageEvent<FaceWorkerResponse>) => {
					const message = event.data;
					if (isProgress(message) && message.id === id) onProgress(message.message, message.ratio);
					if (!isProgress(message) && message.id === id) {
						worker.removeEventListener('message', listener);
					}
				};
				worker.addEventListener('message', listener);
			}
			const transfer = 'bitmap' in full ? [full.bitmap] : [];
			worker.postMessage(full, transfer);
		});
	}

	/** Convert any supported source into a transferable ImageBitmap. */
	private async toBitmap(source: ImageSource): Promise<ImageBitmap> {
		if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return source;
		if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
			return createImageBitmap(source);
		}
		return createImageBitmap(source as CanvasImageSource);
	}

	async detect(source: ImageSource): Promise<DetectedFace[]> {
		this.requireReady();
		const bitmap = await this.toBitmap(source);
		const response = (await this.send({ op: 'detect', bitmap })) as { faces: DetectedFace[] };
		return response.faces;
	}

	async generateDescriptor(source: ImageSource): Promise<DescriptorResult | null> {
		this.requireReady();
		const bitmap = await this.toBitmap(source);
		const response = (await this.send({ op: 'descriptor', bitmap })) as {
			result: DescriptorResult | null;
		};
		return response.result;
	}

	async passiveLiveness(source: ImageSource): Promise<number | null> {
		this.requireReady();
		const bitmap = await this.toBitmap(source);
		const response = (await this.send({ op: 'liveness', bitmap })) as { signal: number | null };
		return response.signal;
	}

	compare(descriptorA: number[], descriptorB: number[]): number {
		// Pure vector math — faster on the main thread than a worker round-trip.
		return cosineDistance(descriptorA, descriptorB);
	}

	private requireReady(): void {
		if (!this.ready || !this.worker) throw new Error('Mesin wajah belum diinisialisasi.');
	}

	dispose(): void {
		this.failAll(new Error('Mesin wajah dihentikan.'));
		this.worker?.terminate();
		this.worker = null;
		this.ready = false;
		this.backend = null;
	}
}
