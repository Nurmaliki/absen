import { liveQuery, type Observable } from 'dexie';
import { isBrowser } from './database';

/**
 * Thin bridge from Dexie `liveQuery` (an Observable) to Svelte 5 reactive state.
 *
 * `liveQuery` re-runs its querier whenever any table it touched is mutated — including
 * mutations performed by *another tab*, because IndexedDB changes are surfaced to every
 * connection of the same origin. Combined with the `BroadcastChannel` signal in `sync.ts`
 * this gives each tab a consistent, automatically-refreshing view without polling.
 *
 * Outside the browser (SSR) we never subscribe and simply expose the fallback value, so a
 * route can be rendered on the server without touching IndexedDB.
 */
export function liveState<T>(
	querier: () => T | Promise<T>,
	initial: T
): { readonly value: T; readonly error: Error | undefined } {
	let value = $state<T>(initial);
	let error = $state<Error | undefined>(undefined);
	let subscription: { unsubscribe: () => void } | null = null;

	if (isBrowser()) {
		$effect(() => {
			const observable: Observable<T> = liveQuery(querier);
			subscription = observable.subscribe({
				next: (next) => {
					value = next;
					error = undefined;
				},
				error: (cause) => {
					error = cause instanceof Error ? cause : new Error(String(cause));
				}
			});
			return () => subscription?.unsubscribe();
		});
	}

	return {
		get value() {
			return value;
		},
		get error() {
			return error;
		}
	};
}
