import type { DescriptorResult, DetectedFace, FaceBox, FaceEngine, ImageSource } from './types';
import { cosineDistance } from './matcher';
import { evaluateQuality, luminanceStats, normalizeVector, type QualityOptions } from './quality';

/**
 * Human.js adapter.
 *
 * Human (@vladmandic/human) is used because it:
 * - Runs entirely in-browser (TFJS + WASM/WebGL backends), no cloud calls.
 * - Ships self-hosted model weights we can serve from `/models` and cache offline.
 * - Provides detection (blazeface), landmarks (facemesh), recognition (faceres),
 *   and a passive antispoof/liveness model.
 *
 * The adapter is loaded lazily and dynamically so the ~7MB model bundle is never part of
 * the initial page load, and so SSR never touches browser-only code.
 */

// Minimal structural typing for the pieces of Human we use, to avoid a hard type dep
// on the library's full surface (which changes across releases).
interface HumanFaceBox {
	x: number;
	y: number;
	width: number;
	height: number;
}
interface HumanFace {
	box: number[];
	boxRaw?: HumanFaceBox;
	score: number;
	embedding?: number[];
	real?: number;
	live?: number;
}
interface HumanResult {
	face: HumanFace[];
}
interface HumanConfigLike {
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

interface HumanModule {
	Human: new (config: HumanConfigLike) => HumanInstance;
}
interface HumanInstance {
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

/** Model base path — self-hosted in `static/models` and cached by the service worker. */
export const MODEL_BASE_PATH = '/models';

export class HumanFaceEngine implements FaceEngine {
	readonly name = 'human';
	readonly modelVersion = 'human-3.x-faceres';
	readonly metric = 'cosine' as const;

	private human: HumanInstance | null = null;
	private loading: Promise<void> | null = null;
	private loaded = false;
	private qualityOptions: QualityOptions;

	constructor(qualityOptions: QualityOptions = {}) {
		this.qualityOptions = qualityOptions;
	}

	isReady(): boolean {
		return this.loaded && this.human !== null;
	}

	async initialize(onProgress?: (message: string, ratio?: number) => void): Promise<void> {
		if (this.isReady()) return;
		if (this.loading) return this.loading;

		this.loading = (async () => {
			if (typeof window === 'undefined') {
				throw new Error('Mesin wajah hanya dapat dimuat di browser.');
			}
			const mod = (await import('@vladmandic/human')) as unknown as HumanModule;

			// Human loads *every* model whose section is `enabled` (defaults include emotion,
			// iris, hand, body, …). We only ship weights for the models listed below, so
			// anything else must be explicitly disabled or Human fails the whole load with an
			// opaque `Cannot read properties of undefined (reading 'inputs')` error.
			const buildConfig = (backend: string): HumanConfigLike => ({
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
			});

			// Prefer WebGL (fastest on real devices); fall back to WASM/CPU where WebGL is
			// unavailable (headless browsers, locked-down GPUs, some mobile devices).
			let lastError: unknown = null;
			for (const backend of ['webgl', 'wasm', 'cpu']) {
				try {
					const instance = new mod.Human(buildConfig(backend));
					await instance.load(undefined, (message, ratio) => {
						onProgress?.(message, ratio);
					});
					this.human = instance;
					this.loaded = true;
					return;
				} catch (error) {
					lastError = error;
				}
			}

			throw lastError instanceof Error
				? lastError
				: new Error('Gagal memuat model pengenalan wajah di perangkat ini.');
		})();

		try {
			await this.loading;
		} finally {
			this.loading = null;
		}
	}

	/** Reset without disposing the module (used before re-initialising after errors). */
	reset(): void {
		this.human = null;
		this.loading = null;
		this.loaded = false;
	}

	private requireHuman(): HumanInstance {
		if (!this.human) throw new Error('Mesin wajah belum diinisialisasi.');
		return this.human;
	}

	private toBox(face: HumanFace): FaceBox {
		const [x, y, width, height] = face.box ?? [0, 0, 0, 0];
		return { x, y, width, height };
	}

	async detect(source: ImageSource): Promise<DetectedFace[]> {
		const human = this.requireHuman();
		const result = await human.detect(source);
		return (result.face ?? []).map((face) => ({
			box: this.toBox(face),
			score: face.score ?? 0,
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

	compare(descriptorA: number[], descriptorB: number[]): number {
		return cosineDistance(descriptorA, descriptorB);
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
	}
}

function frameSize(source: ImageSource): { width: number; height: number } {
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
function estimateLuminance(source: ImageSource): { mean: number; contrast: number } | undefined {
	if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
		const ctx = source.getContext('2d', { willReadFrequently: true });
		if (!ctx) return undefined;
		return luminanceStats(ctx, source.width, source.height);
	}
	return undefined;
}
