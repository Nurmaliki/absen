/** Face-engine abstraction contracts — the rest of the app depends only on these. */

export interface FaceBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DetectedFace {
	box: FaceBox;
	/** Detection confidence 0..1. */
	score: number;
	/**
	 * Normalized facemesh landmarks (0..1 coordinates), when the engine provides them.
	 * Used by the challenge–response liveness flow. Sent across the worker as plain numbers.
	 */
	mesh?: { x: number; y: number }[];
	/** Raw engine landmarks (if available), opaque to callers. Not sent across the worker. */
	raw?: unknown;
}

export interface QualityReport {
	ok: boolean;
	score: number; // 0..1
	issues: string[];
}

export interface DescriptorResult {
	descriptor: number[];
	quality: QualityReport;
	box: FaceBox;
}

export type LivenessChallenge = 'blink' | 'turn-left' | 'turn-right' | 'center';

export interface LivenessResult {
	passed: boolean;
	completed: LivenessChallenge[];
	message: string;
}

export interface RecognitionMatch {
	studentId: string;
	/** Engine distance — smaller is more similar for 'cosine'/'euclidean'. */
	distance: number;
	/** Raw similarity score 0..1 for display (never faked into a %). */
	similarity: number;
}

/**
 * Engine contract. Adapters implement this so the app is not bound to one library.
 * `compare` returns a *distance* (lower = more similar) with a consistent metric.
 */
export interface FaceEngine {
	readonly name: string;
	readonly modelVersion: string;
	readonly metric: 'cosine' | 'euclidean';

	initialize(onProgress?: (message: string, ratio?: number) => void): Promise<void>;
	isReady(): boolean;

	/** Detect faces in an image source. */
	detect(source: ImageSource): Promise<DetectedFace[]>;

	/** Generate a descriptor for the single largest/central face, with a quality report. */
	generateDescriptor(source: ImageSource): Promise<DescriptorResult | null>;

	/** Compare two descriptors -> distance (lower = closer), using `metric`. */
	compare(descriptorA: number[], descriptorB: number[]): number;

	/**
	 * Passive antispoof/liveness signal if the engine provides one (0..1, higher = more live).
	 * Returns null when the engine has no passive signal and challenge-response is required.
	 */
	passiveLiveness(source: ImageSource): Promise<number | null>;

	dispose?(): void;
}

export type ImageSource =
	| HTMLCanvasElement
	| HTMLImageElement
	| HTMLVideoElement
	| ImageBitmap
	| ImageData
	| OffscreenCanvas;
