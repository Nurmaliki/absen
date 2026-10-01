import { toasts } from '$lib/stores/toast.svelte';
import { describeStorageError } from '$lib/db/errors';

/**
 * Route an error from a DB/storage operation to a user-facing toast.
 *
 * Storage failures carry an `action` hint (e.g. "buat backup lalu hapus data lama"); we append
 * it to the message so the user knows what to *do*, not just what went wrong. Unknown errors
 * fall back to a generic message so we never surface a raw DOMException.
 */
export function showStorageError(error: unknown, fallback = 'Terjadi kesalahan.'): void {
	const { message, action } = describeStorageError(error);
	const text = action ? `${message} ${action}` : message;
	toasts.error(text || fallback);
}

/** True when the error is a typed storage problem we already know how to explain. */
export function isKnownStorageError(error: unknown): boolean {
	const { action } = describeStorageError(error);
	return Boolean(action);
}
