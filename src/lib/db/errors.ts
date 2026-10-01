/**
 * IndexedDB error taxonomy.
 *
 * Local-first apps fail in ways a server-backed app never does: the browser can refuse a
 * write when the origin is out of storage, or block a schema upgrade because another tab
 * still holds the old version open. We translate those DOMExceptions into plain Indonesian
 * messages plus an optional actionable next step so the UI can guide the user instead of
 * showing a raw `QuotaExceededError`.
 */

export class StorageQuotaError extends Error {
	readonly kind = 'quota';
	readonly action: string;
	constructor(message = 'Penyimpanan browser penuh.') {
		super(message);
		this.name = 'StorageQuotaError';
		this.action =
			'Buat backup lalu hapus data lama (mis. log audit) atau pindahkan data ke perangkat dengan ruang penyimpanan lebih besar.';
	}
}

export class DatabaseBlockedError extends Error {
	readonly kind = 'blocked';
	readonly action: string;
	constructor(message = 'Pembaruan database tertunda karena aplikasi masih terbuka di tab lain.') {
		super(message);
		this.name = 'DatabaseBlockedError';
		this.action = 'Tutup semua tab aplikasi ini selain yang sedang Anda gunakan, lalu muat ulang.';
	}
}

export class DatabaseUnavailableError extends Error {
	readonly kind = 'unavailable';
	readonly action: string;
	constructor(message = 'Penyimpanan lokal tidak dapat diakses.') {
		super(message);
		this.name = 'DatabaseUnavailableError';
		this.action =
			'Pastikan Anda tidak berada di mode privat, dan izinkan situs menyimpan data. Coba muat ulang halaman.';
	}
}

/** True when the error represents exhausted browser storage. */
export function isQuotaError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const name = (error as { name?: string }).name;
	return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** Convert an unknown DB failure into a typed, user-facing error. */
export function toStorageError(error: unknown): Error {
	if (isQuotaError(error)) return new StorageQuotaError();
	if (error instanceof DatabaseBlockedError || error instanceof DatabaseUnavailableError) {
		return error;
	}
	if (error instanceof Error) {
		const name = error.name;
		if (name === 'InvalidStateError' || name === 'UnknownError') {
			return new DatabaseUnavailableError(error.message);
		}
	}
	return error instanceof Error ? error : new DatabaseUnavailableError();
}

/** Extract a display message + optional action from any thrown value. */
export function describeStorageError(error: unknown): { message: string; action?: string } {
	const known =
		error instanceof StorageQuotaError ||
		error instanceof DatabaseBlockedError ||
		error instanceof DatabaseUnavailableError;
	if (known) {
		return { message: error.message, action: (error as { action?: string }).action };
	}
	const typed = toStorageError(error);
	return { message: typed.message };
}
