import type { AppSettings } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/db/settings';
import { isBrowser } from '$lib/db/database';

/**
 * App-wide reactive state (Svelte 5 runes). Persisted in IndexedDB by the settings repo;
 * this store holds the in-memory copy plus transient UI/security state.
 *
 * Deliberately framework-simple: db access lives in `$lib/db/*`, this only mirrors state.
 */

function settingsState() {
	let settings = $state<AppSettings>({
		...DEFAULT_SETTINGS,
		createdAt: '',
		updatedAt: ''
	});
	let loaded = $state(false);

	return {
		get value() {
			return settings;
		},
		get loaded() {
			return loaded;
		},
		set(next: AppSettings) {
			settings = next;
			loaded = true;
		},
		patch(patch: Partial<AppSettings>) {
			settings = { ...settings, ...patch };
		}
	};
}

function lockState() {
	let locked = $state(false);
	let lastActivity = $state(Date.now());
	let initialized = $state(false);

	return {
		get locked() {
			return locked;
		},
		get initialized() {
			return initialized;
		},
		get lastActivity() {
			return lastActivity;
		},
		lock() {
			locked = true;
		},
		unlock() {
			locked = false;
			lastActivity = Date.now();
		},
		touch() {
			lastActivity = Date.now();
		},
		markInitialized() {
			initialized = true;
		}
	};
}

function onlineState() {
	let online = $state(isBrowser() ? navigator.onLine : true);
	return {
		get online() {
			return online;
		},
		set(next: boolean) {
			online = next;
		}
	};
}

export const appSettings = settingsState();
export const appLock = lockState();
export const network = onlineState();
