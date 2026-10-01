import type { DescriptorResult, DetectedFace, FaceEngine, ImageSource } from './types';
import { cosineDistance } from './matcher';
import type { QualityOptions } from './quality';
import { HumanEngineCore, type HumanModule } from './core';

/**
 * Main-thread Human.js adapter.
 *
 * This is the *fallback* path used when `OffscreenCanvas` / module workers are unavailable
 * (older browsers, some embedded webviews). On capable browsers the app prefers
 * `WorkerFaceEngine`, which runs the exact same `HumanEngineCore` inside a Web Worker so the
 * ~8 fps of inference never blocks the UI (`engine.ts` decides which to build).
 *
 * See `core.ts` for the reasoning behind the model/backend configuration.
 */

export { MODEL_BASE_PATH } from './core';

export class HumanFaceEngine implements FaceEngine {
	readonly name = 'human';
	readonly modelVersion = 'human-3.x-faceres';
	readonly metric = 'cosine' as const;

	private core: HumanEngineCore;

	constructor(qualityOptions: QualityOptions = {}) {
		this.core = new HumanEngineCore(qualityOptions);
	}

	isReady(): boolean {
		return this.core.isReady();
	}

	async initialize(onProgress?: (message: string, ratio?: number) => void): Promise<void> {
		if (typeof window === 'undefined') {
			throw new Error('Mesin wajah hanya dapat dimuat di browser.');
		}
		await this.core.initialize(
			async () => (await import('@vladmandic/human')) as unknown as HumanModule,
			onProgress
		);
	}

	reset(): void {
		this.core.reset();
	}

	async detect(source: ImageSource): Promise<DetectedFace[]> {
		return this.core.detect(source);
	}

	async generateDescriptor(source: ImageSource): Promise<DescriptorResult | null> {
		return this.core.generateDescriptor(source);
	}

	compare(descriptorA: number[], descriptorB: number[]): number {
		return cosineDistance(descriptorA, descriptorB);
	}

	async passiveLiveness(source: ImageSource): Promise<number | null> {
		return this.core.passiveLiveness(source);
	}

	dispose(): void {
		this.core.dispose();
	}
}
