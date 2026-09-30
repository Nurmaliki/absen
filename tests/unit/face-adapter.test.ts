import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumanFaceEngine } from '$lib/face/adapter';

/**
 * Regression tests for the Human.js adapter's initialization.
 *
 * Two bugs motivated these tests:
 * 1. The adapter called `human.ready()`, but Human 3.3.x exposes readiness as a `state`
 *    string (no `ready` method), so `isReady()` was permanently `false` and the face page
 *    never processed a single frame.
 * 2. The config only enabled a subset of models; Human still tried to load its other
 *    default models (emotion, iris, hand, …) whose weights we don't ship, and the whole
 *    load failed with `Cannot read properties of undefined (reading 'inputs')`.
 *
 * These tests stub the dynamically-imported `@vladmandic/human` module so we can assert
 * the adapter's behavior without a real browser / TFJS backend.
 */

type LoadBehavior = 'ok' | 'fail';

interface StubOptions {
	behavior?: LoadBehavior;
	/** Which backend strings should fail, to exercise the fallback chain. */
	failBackends?: string[];
	/** When true, simulate the "old" Human API that has a `ready()` method. */
	legacyReadyMethod?: boolean;
}

function installHumanStub(options: StubOptions = {}) {
	const { behavior = 'ok', failBackends = [], legacyReadyMethod = false } = options;
	const instances: Array<{ backend: string; loaded: boolean; config: Record<string, unknown> }> =
		[];
	const loadCalls: string[] = [];

	class StubHuman {
		state = 'config';
		readonly _backend: string;
		readonly config: Record<string, unknown>;
		constructor(config: Record<string, unknown>) {
			this.config = config;
			this._backend = String(config.backend ?? 'default');
			instances.push({ backend: this._backend, loaded: false, config });
		}
		async load() {
			loadCalls.push(this._backend);
			if (behavior === 'fail' || failBackends.includes(this._backend)) {
				throw new TypeError("Cannot read properties of undefined (reading 'inputs')");
			}
			this.state = 'idle';
			const rec = instances.find((i) => i.backend === this._backend);
			if (rec) rec.loaded = true;
		}
		async detect() {
			return { face: [] };
		}
	}

	// Attach a `ready()` method only when explicitly simulating the legacy API.
	if (legacyReadyMethod) {
		(StubHuman.prototype as unknown as Record<string, unknown>).ready = function () {
			return this.state === 'idle';
		};
	}

	vi.doMock('@vladmandic/human', () => ({ Human: StubHuman }));

	return { instances, loadCalls };
}

afterEach(() => {
	vi.resetModules();
	vi.doUnmock('@vladmandic/human');
});

describe('HumanFaceEngine.initialize', () => {
	it('reports ready after a successful load (state-based readiness)', async () => {
		const { loadCalls } = installHumanStub({ behavior: 'ok' });
		const engine = new HumanFaceEngine();

		expect(engine.isReady()).toBe(false);
		await engine.initialize();
		expect(engine.isReady()).toBe(true);
		// WebGL is tried first on the happy path.
		expect(loadCalls[0]).toBe('webgl');
	});

	it('falls back to the next backend when WebGL fails', async () => {
		const { loadCalls } = installHumanStub({ failBackends: ['webgl'] });
		const engine = new HumanFaceEngine();

		await engine.initialize();
		expect(engine.isReady()).toBe(true);
		expect(loadCalls).toEqual(['webgl', 'wasm']);
	});

	it('falls through webgl and wasm to cpu before failing', async () => {
		const { loadCalls } = installHumanStub({ failBackends: ['webgl', 'wasm'] });
		const engine = new HumanFaceEngine();

		await engine.initialize();
		expect(engine.isReady()).toBe(true);
		expect(loadCalls).toEqual(['webgl', 'wasm', 'cpu']);
	});

	it('throws and stays not-ready when every backend fails', async () => {
		const { loadCalls } = installHumanStub({ behavior: 'fail' });
		const engine = new HumanFaceEngine();

		await expect(engine.initialize()).rejects.toThrow(/inputs/);
		expect(engine.isReady()).toBe(false);
		expect(loadCalls).toEqual(['webgl', 'wasm', 'cpu']);
	});

	it('only enables models whose weights we actually ship', async () => {
		const { instances } = installHumanStub({ behavior: 'ok' });
		const engine = new HumanFaceEngine();
		await engine.initialize();

		const face = instances[0].config.face as Record<string, { enabled?: boolean }>;
		expect(face.enabled).toBe(true);
		expect(face.mesh?.enabled).toBe(true);
		expect(face.description?.enabled).toBe(true);
		expect(face.antispoof?.enabled).toBe(true);
		// These must remain disabled — their weights are not bundled.
		expect(face.iris?.enabled).toBe(false);
		expect(face.emotion?.enabled).toBe(false);

		const root = instances[0].config;
		for (const section of ['body', 'hand', 'gesture', 'object', 'segmentation']) {
			expect((root[section] as { enabled?: boolean }).enabled).toBe(false);
		}
	});

	it('is idempotent — a second initialize reuses the loaded instance', async () => {
		const { loadCalls } = installHumanStub({ behavior: 'ok' });
		const engine = new HumanFaceEngine();

		await engine.initialize();
		await engine.initialize();
		expect(loadCalls).toEqual(['webgl']);
	});

	it('reset() clears readiness so the models can be reloaded', async () => {
		const { loadCalls } = installHumanStub({ behavior: 'ok' });
		const engine = new HumanFaceEngine();

		await engine.initialize();
		expect(engine.isReady()).toBe(true);

		engine.reset();
		expect(engine.isReady()).toBe(false);

		await engine.initialize();
		expect(engine.isReady()).toBe(true);
		expect(loadCalls).toEqual(['webgl', 'webgl']);
	});

	it('dispose() clears readiness', async () => {
		installHumanStub({ behavior: 'ok' });
		const engine = new HumanFaceEngine();
		await engine.initialize();
		engine.dispose();
		expect(engine.isReady()).toBe(false);
	});
});
