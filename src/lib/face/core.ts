import type { DetectedFace, DescriptorResult, FaceBox, ImageSource } from './types';
import { evaluateQuality, luminanceStats, normalizeVector, type QualityOptions } from './quality';

/**
 * Human.js engine core — the *pure engine*, independent of where it runs.
 *
 * Both the main-thread adapter (`adapter.ts`) and the Web Worker host (`face.worker.ts`) use
 * this class, so behaviour is identical whether inference happens on the main thread or in a
 * worker. Keeping the logic here (rather than in the worker) also keeps it unit-testable with
 * a fake `Human` module.
 *
 * Human (@vladmandic/human) is used because it:
 * - Runs entirely in-browser (TFJS + WASM/WebGL backends), no cloud calls.
 * - Ships self-hosted model weights we can serve from `/models` and cache offline.
 * - Provides detection (blazeface), landmarks (facemesh), recognition (faceres),
 *   and a passive antispoof/liveness model.
 */

// Minimal structural typing for the pieces of Human we use, to avoid a hard type dep
// on the library's full surface (which changes across releases).
export interface HumanFaceBox {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface HumanFace {
	box: number[];
	boxRaw?: HumanFaceBox;
	score: number;
	embedding?: number[];
	mesh?: number[][];
	real?: number;
	live?: number;
}
export interface HumanResult {
	face: HumanFace[];
}
export interface HumanConfigLike {
	modelBasePath: string;
	cacheModels?: boolean;
	backend?: string;
	filter?: Record<string, unknown>;
	face?: Record<string, unknown>;
	body?: { enabled: boolean };
	hand?: { enabled: boolean };
	gesture?: { enabled: boolean };
	object?: { enabled: boolean };
	segmentation?: { enabled: boolean };
}
export interface HumanInstance {
	load: (url?: string, onProgress?: (message: string, ratio: number) => void) => Promise<void>;
	/**
	 * Human's readiness is exposed as a `state` string, not a `ready()` method.
	 * It progresses through: 'config' → 'check' → 'backend' → 'load' → 'run:<model>' → 'idle'.
	 */
	state: string;
	detect: (input: ImageSource) => Promise<HumanResult>;
	models: { modelBasePath?: string };
	env?: unknown;
	validate?: (config?: unknown) => void;
}
export interface HumanModule {
	Human: new (config: HumanConfigLike) => HumanInstance;
}

/** Model base path — self-hosted in `static/models` and cached by the service worker. */
export const MODEL_BASE_PATH = '/models';

/** Backend preference order: WebGL is fastest, CPU the most compatible. */
export const BACKEND_ORDER = ['webgl', 'wasm', 'cpu'] as const;

/**
 * Build a Human config that only enables models whose weights we actually ship.
 *
 * Human loads *every* model whose section is `enabled` (defaults include emotion, iris,
 * hand, body, …). We only ship weights for a subset, so anything else must be explicitly
 * disabled or Human fails the whole load with an opaque
 * `Cannot read properties of undefined (reading 'inputs')` error.
 */
export function buildHumanConfig(backend: string): HumanConfigLike {
	return {
		modelBasePath: MODEL_BASE_PATH,
		cacheModels: true,
		backend,
		filter: { enabled: true, equalization: true },
		face: {
			enabled: true,
			detector: { modelPath: 'blazeface.json' },
			mesh: { enabled: true, modelPath: 'facemesh.json' },
			iris: { enabled: false },
			emotion: { enabled: false },
			description: { enabled: true, modelPath: 'faceres.json' },
			antispoof: { enabled: true, modelPath: 'antispoof.json' },
			liveness: { enabled: false }
		},
		body: { enabled: false },
		hand: { enabled: false },
		gesture: { enabled: false },
		object: { enabled: false },
		segmentation: { enabled: false }
	};
}

export class HumanEngineCore {
	private human: HumanInstance | null = null;
	private loading: Promise<void> | null = null;
	private loaded = false;
	private backend: string | null = null;
	private qualityOptions: QualityOptions;

	constructor(qualityOptions: QualityOptions = {}) {
		this.qualityOptions = qualityOptions;
	}

	isReady(): boolean {
		return this.loaded && this.human !== null;
	}

	/** Which backend won the fallback race (for diagnostics/telemetry). */
	get activeBackend(): string | null {
		return this.backend;
	}

	/**
	 * Verify that the model weights we require are actually reachable before a full load.
	 *
	 * A forgotten `/models` copy (common when deploying without `static/`) otherwise surfaces
	 * as an opaque TFJS error deep inside the loader. Probing first lets us fail fast with a
	 * message an operator can act on: "model tidak ditemukan".
	 *
	 * Best-effort: a network hiccup returns `{ ok: true }` so we never *block* a genuinely
	 * working setup — the real load will report its own error if it fails.
	 */
	static async probeModels(
		fetchImpl: typeof fetch = fetch,
		basePath: string = MODEL_BASE_PATH
	): Promise<{ ok: boolean; missing: string[] }> {
		const required = ['blazeface.json', 'facemesh.json', 'faceres.json', 'antispoof.json'];
		const missing: string[] = [];
		await Promise.all(
			required.map(async (file) => {
				try {
					const response = await fetchImpl(`${basePath}/${file}`, { method: 'HEAD' });
					if (!response.ok) missing.push(file);
				} catch {
					// Network failure: do not treat as "missing".
				}
			})
		);
		return { ok: missing.length === 0, missing };
	}

	async initialize(
		loadModule: () => Promise<HumanModule>,
		onProgress?: (message: string, ratio?: number) => void
	): Promise<void> {
		if (this.isReady()) return;
		if (this.loading) return this.loading;

		this.loading = (async () => {
			const mod = await loadModule();

			let lastError: unknown = null;
			for (const backend of BACKEND_ORDER) {
				try {
					const instance = new mod.Human(buildHumanConfig(backend));
					await instance.load(undefined, (message, ratio) => {
						onProgress?.(message, ratio);
					});
					this.human = instance;
					this.loaded = true;
					this.backend = backend;
					return;
				} catch (error) {
					lastError = error;
				}
			}

			if (lastError instanceof Error) {
				// Give operators an actionable message when the failure looks like missing weights
				// rather than a device/backend problem.
				const message = lastError.message ?? '';
				const looksLikeMissingModel = /inputs|fetch|404|Failed to load|model/i.test(message);
				if (looksLikeMissingModel) {
					throw new Error(
						`Gagal memuat model pengenalan wajah. Pastikan berkas model tersedia di ${MODEL_BASE_PATH} (mis. blazeface.json, faceres.json). Detail: ${message}`
					);
				}
				throw lastError;
			}
			throw new Error('Gagal memuat model pengenalan wajah di perangkat ini.');
		})();

		try {
			await this.loading;
		} finally {
			this.loading = null;
		}
	}

	reset(): void {
		this.human = null;
		this.loading = null;
		this.loaded = false;
		this.backend = null;
	}

	private requireHuman(): HumanInstance {
		if (!this.human) throw new Error('Mesin wajah belum diinisialisasi.');
		return this.human;
	}

	private toBox(face: HumanFace): FaceBox {
		const [x, y, width, height] = face.box ?? [0, 0, 0, 0];
		return { x, y, width, height };
	}

	/** Human stores landmarks as `[[x,y,z], …]`; flatten to plain {x,y} for cloning. */
	private toMesh(face: HumanFace): { x: number; y: number }[] | undefined {
		if (!Array.isArray(face.mesh) || face.mesh.length === 0) return undefined;
		return face.mesh.map((point) => ({ x: point[0] ?? 0, y: point[1] ?? 0 }));
	}

	async detect(source: ImageSource): Promise<DetectedFace[]> {
		const human = this.requireHuman();
		const result = await human.detect(source);
		return (result.face ?? []).map((face) => ({
			box: this.toBox(face),
			score: face.score ?? 0,
			mesh: this.toMesh(face),
			raw: face
		}));
	}

	async generateDescriptor(source: ImageSource): Promise<DescriptorResult | null> {
		const human = this.requireHuman();
		const result = await human.detect(source);
		const faces = result.face ?? [];
		if (faces.length === 0) return null;

		// Use the highest-scoring face (there should only be one after the quality gate).
		const face = faces.reduce((best, current) =>
			(current.score ?? 0) > (best.score ?? 0) ? current : best
		);
		const embedding = face.embedding;
		if (!embedding || embedding.length === 0) return null;

		const box = this.toBox(face);
		const frame = frameSize(source);
		const luminance = estimateLuminance(source);
		const quality = evaluateQuality(
			[{ box, score: face.score ?? 0 }],
			frame.width,
			frame.height,
			luminance,
			this.qualityOptions
		);

		return { descriptor: normalizeVector(embedding), quality, box };
	}

	async passiveLiveness(source: ImageSource): Promise<number | null> {
		const human = this.requireHuman();
		const result = await human.detect(source);
		const faces = result.face ?? [];
		if (faces.length === 0) return null;
		const face = faces[0];
		// Human exposes `real` / `live` antispoof signals when enabled.
		const signal = face.real ?? face.live;
		return typeof signal === 'number' ? Math.max(0, Math.min(1, signal)) : null;
	}

	dispose(): void {
		this.human = null;
		this.loaded = false;
		this.backend = null;
	}
}

export function frameSize(source: ImageSource): { width: number; height: number } {
	const anySource = source as {
		width?: number;
		height?: number;
		videoWidth?: number;
		videoHeight?: number;
	};
	const width = anySource.videoWidth ?? anySource.width ?? 0;
	const height = anySource.videoHeight ?? anySource.height ?? 0;
	return { width, height };
}

/**
 * Estimate scene luminance from a canvas source. For non-canvas sources we return
 * `undefined` so quality falls back to geometry-only checks (never throws).
 */
export function estimateLuminance(
	source: ImageSource
): { mean: number; contrast: number } | undefined {
	if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
		const ctx = source.getContext('2d', { willReadFrequently: true });
		if (!ctx) return undefined;
		return luminanceStats(ctx, source.width, source.height);
	}
	// OffscreenCanvas (worker) path.
	if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
		const ctx = source.getContext('2d', { willReadFrequently: true });
		if (!ctx) return undefined;
		return luminanceStats(ctx, source.width, source.height);
	}
	return undefined;
}
