/**
 * Storage monitoring via the Storage API. Estimates are just that — estimates.
 * We never assume `persist()` is granted; we surface the result honestly.
 */

export interface StorageInfo {
	supported: boolean;
	usage: number;
	quota: number;
	percentage: number;
	persisted: boolean | null;
	warning: 'none' | 'low' | 'critical';
}

export async function estimateStorage(): Promise<StorageInfo> {
	const base: StorageInfo = {
		supported: false,
		usage: 0,
		quota: 0,
		percentage: 0,
		persisted: null,
		warning: 'none'
	};
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return base;

	try {
		const estimate = await navigator.storage.estimate();
		const usage = estimate.usage ?? 0;
		const quota = estimate.quota ?? 0;
		const percentage = quota > 0 ? (usage / quota) * 100 : 0;
		let persisted: boolean | null = null;
		if (navigator.storage.persisted) {
			persisted = await navigator.storage.persisted();
		}
		return {
			supported: true,
			usage,
			quota,
			percentage,
			persisted,
			warning: percentage > 90 ? 'critical' : percentage > 75 ? 'low' : 'none'
		};
	} catch {
		return base;
	}
}

/**
 * Request persistent storage. Browsers decide; a `false` result is normal and expected.
 * We only call this in response to a user action (never automatically on load).
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
	try {
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

export function storageWarningMessage(info: StorageInfo): string | null {
	if (info.warning === 'critical') {
		return 'Penyimpanan perangkat hampir penuh. Segera lakukan backup dan hapus data lama.';
	}
	if (info.warning === 'low') {
		return 'Penyimpanan perangkat mulai terisi. Pertimbangkan melakukan backup.';
	}
	return null;
}
