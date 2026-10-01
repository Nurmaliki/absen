import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerFaceEngine } from '$lib/face/worker-engine';
import { isProgress } from '$lib/face/worker-protocol';

/**
 * Tests for the Web Worker face engine.
 *
 * We stub `Worker`, `OffscreenCanvas` and `createImageBitmap` so we can exercise the
 * request/response protocol, correlation ids, error propagation and disposal without a
 * real browser worker. The goal is to lock in the contract the scanner relies on:
 * every request resolves exactly once, a worker crash rejects instead of hanging, and
 * `compare()` never round-trips through the worker.
 */

interface SentMessage {
	data: Record<string, unknown>;
	transfer: unknown[];
}

/** A programmable fake worker that lets each test decide how to answer. */
class FakeWorker {
	static instances: FakeWorker[] = [];
	sent: SentMessage[] = [];
	terminated = false;
	private listeners = new Map<string, Set<(event: unknown) => void>>();
	responder: ((message: Record<string, unknown>) => void) | null = null;

	constructor() {
		FakeWorker.instances.push(this);
	}

	addEventListener(type: string, listener: (event: unknown) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(listener);
	}
	removeEventListener(type: string, listener: (event: unknown) => void): void {
		this.listeners.get(type)?.delete(listener);
	}
	postMessage(data: Record<string, unknown>, transfer: unknown[] = []): void {
		this.sent.push({ data, transfer });
		queueMicrotask(() => this.responder?.(data));
	}
	terminate(): void {
		this.terminated = true;
	}

	emit(type: string, event: unknown): void {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}

	/** Reply as if an op completed successfully. */
	reply(message: Record<string, unknown>, payload: Record<string, unknown>): void {
		this.emit('message', { data: { id: message.id, ok: true, op: message.op, ...payload } });
	}

	/** Reply with a failure for the given request. */
	fail(message: Record<string, unknown>, error: string): void {
		this.emit('message', { data: { id: message.id, ok: false, error } });
	}
}

function installBrowserStubs(): void {
	FakeWorker.instances = [];
	(globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
	(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
		width = 0;
		height = 0;
		getContext() {
			return null;
		}
	};
	(globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = async () =>
		({ width: 100, height: 100, close() {} }) as unknown as ImageBitmap;
	(globalThis as unknown as { window: unknown }).window = globalThis;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('WorkerFaceEngine.isSupported', () => {
	it('is true when Worker, OffscreenCanvas and createImageBitmap exist', () => {
		installBrowserStubs();
		expect(WorkerFaceEngine.isSupported()).toBe(true);
	});

	it('is false when OffscreenCanvas is missing', () => {
		installBrowserStubs();
		delete (globalThis as unknown as Record<string, unknown>).OffscreenCanvas;
		expect(WorkerFaceEngine.isSupported()).toBe(false);
	});
});

describe('WorkerFaceEngine lifecycle', () => {
	it('initializes and records the worker-selected backend', async () => {
		installBrowserStubs();
		const engine = new WorkerFaceEngine();

		const init = engine.initialize();
		const worker = await waitForWorker();
		worker.reply(worker.sent[0].data, { backend: 'wasm' });

		await init;
		expect(engine.isReady()).toBe(true);
		expect(engine.activeBackend).toBe('wasm');
	});

	it('detect() forwards a transferable bitmap and returns faces', async () => {
		installBrowserStubs();
		const engine = new WorkerFaceEngine();

		const init = engine.initialize();
		const worker = await waitForWorker();
		worker.reply(worker.sent[0].data, { backend: 'webgl' });
		await init;

		const detectPromise = engine.detect({ width: 10, height: 10 } as unknown as ImageData);
		await vi.waitFor(() => expect(worker.sent.length).toBe(2));
		const request = worker.sent[1];
		expect(request.data.op).toBe('detect');
		// The bitmap must be transferred, not cloned.
		expect(request.transfer.length).toBe(1);
		worker.reply(request.data, {
			faces: [{ box: { x: 1, y: 2, width: 3, height: 4 }, score: 0.9 }]
		});

		const faces = await detectPromise;
		expect(faces).toHaveLength(1);
		expect(faces[0].score).toBe(0.9);
	});

	it('rejects the pending request when the worker reports an error', async () => {
		installBrowserStubs();
		const engine = new WorkerFaceEngine();

		const init = engine.initialize();
		const worker = await waitForWorker();
		worker.reply(worker.sent[0].data, { backend: 'cpu' });
		await init;

		const descriptorPromise = engine.generateDescriptor({} as unknown as ImageData);
		await vi.waitFor(() => expect(worker.sent.length).toBe(2));
		worker.fail(worker.sent[1].data, 'model hilang');

		await expect(descriptorPromise).rejects.toThrow('model hilang');
	});

	it('rejects pending work and marks itself not-ready on a worker crash', async () => {
		installBrowserStubs();
		const engine = new WorkerFaceEngine();

		const init = engine.initialize();
		const worker = await waitForWorker();
		worker.reply(worker.sent[0].data, { backend: 'webgl' });
		await init;

		const detectPromise = engine.detect({} as unknown as ImageData);
		await vi.waitFor(() => expect(worker.sent.length).toBe(2));
		worker.emit('error', { message: 'boom' });

		await expect(detectPromise).rejects.toThrow('boom');
		expect(engine.isReady()).toBe(false);
	});

	it('compare() computes locally without touching the worker', async () => {
		installBrowserStubs();
		const engine = new WorkerFaceEngine();

		const init = engine.initialize();
		const worker = await waitForWorker();
		worker.reply(worker.sent[0].data, { backend: 'webgl' });
		await init;
		const sentBefore = worker.sent.length;

		const distance = engine.compare([1, 0], [1, 0]);
		expect(distance).toBeCloseTo(0, 5);
		expect(worker.sent.length).toBe(sentBefore);
	});

	it('dispose() terminates the worker', async () => {
		installBrowserStubs();
		const engine = new WorkerFaceEngine();

		const init = engine.initialize();
		const worker = await waitForWorker();
		worker.reply(worker.sent[0].data, { backend: 'webgl' });
		await init;

		engine.dispose();
		expect(worker.terminated).toBe(true);
		expect(engine.isReady()).toBe(false);
	});
});

describe('isProgress', () => {
	it('detects progress frames', () => {
		expect(isProgress({ id: 1, ok: 'progress', message: 'loading' })).toBe(true);
		expect(isProgress({ id: 1, ok: true, op: 'init', backend: 'webgl' })).toBe(false);
	});
});

/** Wait until the engine has constructed its worker, then return it. */
async function waitForWorker(): Promise<FakeWorker> {
	await vi.waitFor(() => expect(FakeWorker.instances.length).toBeGreaterThan(0));
	return FakeWorker.instances[FakeWorker.instances.length - 1];
}
