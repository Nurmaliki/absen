import { describe, expect, it } from 'vitest';
import { thresholdAssessment, PERMISSIVE_THRESHOLD, STRICT_THRESHOLD } from '$lib/db/settings';

describe('thresholdAssessment', () => {
	it('classifies strict thresholds', () => {
		expect(thresholdAssessment(STRICT_THRESHOLD - 0.01).level).toBe('strict');
	});

	it('classifies permissive thresholds and warns', () => {
		const result = thresholdAssessment(PERMISSIVE_THRESHOLD + 0.01);
		expect(result.level).toBe('permissive');
		expect(result.message.toLowerCase()).toContain('risiko');
	});

	it('classifies balanced thresholds', () => {
		expect(thresholdAssessment(0.5).level).toBe('balanced');
	});
});
