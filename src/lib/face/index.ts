export * from './types';
export * from './engine';
export { HumanFaceEngine, MODEL_BASE_PATH } from './adapter';
export {
	cosineDistance,
	euclideanDistance,
	distanceToSimilarity,
	findBestMatch,
	type MatchOptions,
	type MatchOutcome
} from './matcher';
export {
	DEFAULT_QUALITY,
	QUALITY_MESSAGES,
	evaluateQuality,
	descriptorConsistency,
	averageDescriptors,
	normalizeVector,
	faceRatio,
	centerScore,
	type QualityOptions
} from './quality';
export {
	DEFAULT_LIVENESS,
	evaluatePassive,
	createBlinkTracker,
	createTurnTracker,
	pickChallenge,
	CHALLENGE_INSTRUCTIONS,
	eyeOpenness,
	headYaw,
	type LivenessConfig
} from './liveness';
