/**
 * Cross-tab synchronization.
 *
 * IndexedDB is shared between every tab of the same origin, but in-memory state is not.
 * Without a signal, two open tabs (e.g. one taking attendance and one viewing reports)
 * would each hold stale copies — and could even attempt conflicting writes.
 *
 * We broadcast a coarse "something changed" event over `BroadcastChannel` and let each
 * consumer re-read the affected slice. We deliberately do NOT ship row payloads: the DB is
 * the single source of truth, so re-querying is both simpler and always consistent.
 *
 * Everything is best-effort: if `BroadcastChannel` is unavailable (older browsers, SSR),
 * the app keeps working exactly as before with per-tab state.
 */

export type SyncEvent =
	| { kind: 'attendance:changed'; sessionId?: string }
	| { kind: 'students:changed'; classId?: string }
	| { kind: 'classes:changed' }
	| { kind: 'settings:changed' }
	| { kind: 'data:reset' }
	| { kind: 'data:restored' };

/** Broadcast a change to every other tab. Safe to call anywhere; never throws. */
export function broadcastSync(event: SyncEvent): void {
	if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
	try {
		const channel = new BroadcastChannel(CHANNEL_NAME);
		channel.postMessage(event);
		channel.close();
	} catch {
		// Synchronisation is optional; ignore failures (private mode, unsupported browser).
	}
}

const CHANNEL_NAME = 'absensi-sync';

/**
 * Subscribe to change events from other tabs. Returns an unsubscribe function.
 * Events emitted by the current tab are not delivered back to it.
 */
export function onSync(handler: (event: SyncEvent) => void): () => void {
	if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
		return () => {};
	}
	let channel: BroadcastChannel;
	try {
		channel = new BroadcastChannel(CHANNEL_NAME);
	} catch {
		return () => {};
	}
	const listener = (event: MessageEvent<SyncEvent>) => {
		if (event.data && typeof event.data.kind === 'string') handler(event.data);
	};
	channel.addEventListener('message', listener);
	return () => {
		channel.removeEventListener('message', listener);
		channel.close();
	};
}
