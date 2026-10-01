import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	StorageQuotaError,
	DatabaseBlockedError,
	DatabaseUnavailableError,
	isQuotaError,
	toStorageError,
	describeStorageError
} from '$lib/db/errors';

/**
 * Storage error taxonomy tests.
 *
 * Local-first apps fail with browser-specific DOMExceptions that are meaningless to a teacher.
 * These tests lock in that a `QuotaExceededError` becomes a `StorageQuotaError` with an
 * actionable hint, and that we never leak a raw DOMException to the UI.
 */

describe('isQuotaError', () => {
	it('recognizes the Chromium/Firefox quota error names', () => {
		expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
		expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
	});

	it('rejects unrelated errors and non-objects', () => {
		expect(isQuotaError({ name: 'AbortError' })).toBe(false);
		expect(isQuotaError(null)).toBe(false);
		expect(isQuotaError('boom')).toBe(false);
	});
});

describe('toStorageError', () => {
	it('maps a quota DOMException to StorageQuotaError with an action hint', () => {
		const error = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
		const typed = toStorageError(error);
		expect(typed).toBeInstanceOf(StorageQuotaError);
		expect((typed as StorageQuotaError).action).toContain('backup');
	});

	it('maps InvalidStateError to DatabaseUnavailableError', () => {
		const error = Object.assign(new Error('db closed'), { name: 'InvalidStateError' });
		expect(toStorageError(error)).toBeInstanceOf(DatabaseUnavailableError);
	});

	it('passes through an already-typed storage error', () => {
		const blocked = new DatabaseBlockedError();
		expect(toStorageError(blocked)).toBe(blocked);
	});

	it('passes through a generic Error unchanged (only DOMExceptions are wrapped)', () => {
		const generic = new Error('weird');
		expect(toStorageError(generic)).toBe(generic);
	});
});

describe('describeStorageError', () => {
	it('returns message + action for known storage errors', () => {
		const described = describeStorageError(new StorageQuotaError());
		expect(described.message).toContain('penuh');
		expect(described.action).toBeTruthy();
	});

	it('returns just a message for unknown errors', () => {
		const described = describeStorageError(new Error('boom'));
		expect(described.action).toBeUndefined();
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});
