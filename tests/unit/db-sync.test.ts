import { describe, expect, it } from 'vitest';
import { broadcastSync, onSync, type SyncEvent } from '$lib/db/sync';

/**
 * Cross-tab sync tests.
 *
 * The channel is best-effort: it must never throw when `BroadcastChannel` is unavailable
 * (SSR, older browsers, private mode) and must not deliver a tab's own events back to it.
 * jsdom has no BroadcastChannel, so we install a minimal in-process stub.
 */

/** Minimal BroadcastChannel that fans out to subscribers except the sender. */
class FakeChannel {
	static channels = new Set<FakeChannel>();
	private listeners = new Set<(event: { data: unknown }) => void>();
	constructor(public name: string) {
		FakeChannel.channels.add(this);
	}
	addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
		if (type === 'message') this.listeners.add(listener);
	}
	removeEventListener(type: string, listener: (event: { data: unknown }) => void): void {
		if (type === 'message') this.listeners.delete(listener);
	}
	postMessage(data: unknown): void {
		for (const channel of FakeChannel.channels) {
			if (channel === this) continue;
			for (const listener of channel.listeners) listener({ data });
		}
	}
	close(): void {
		FakeChannel.channels.delete(this);
	}
}

function installChannel(): void {
	FakeChannel.channels.clear();
	(globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = FakeChannel;
	(globalThis as unknown as { window: unknown }).window = globalThis;
}

describe('onSync', () => {
	it('delivers events posted by another channel', () => {
		installChannel();
		const received: SyncEvent[] = [];
		const unsubscribe = onSync((event) => received.push(event));

		broadcastSync({ kind: 'students:changed', classId: 'c1' });

		expect(received).toEqual([{ kind: 'students:changed', classId: 'c1' }]);
		unsubscribe();
	});

	it('stops delivering after unsubscribe', () => {
		installChannel();
		const received: SyncEvent[] = [];
		const unsubscribe = onSync((event) => received.push(event));
		unsubscribe();

		broadcastSync({ kind: 'classes:changed' });
		expect(received).toEqual([]);
	});

	it('ignores malformed payloads', () => {
		installChannel();
		const received: SyncEvent[] = [];
		onSync((event) => received.push(event));

		// A channel with no `kind` must be dropped rather than crash the handler.
		const rogue = new FakeChannel('absensi-sync');
		rogue.postMessage({ nope: true });
		expect(received).toEqual([]);
	});

	it('no-ops safely when BroadcastChannel is unavailable', () => {
		delete (globalThis as unknown as Record<string, unknown>).BroadcastChannel;
		expect(() => broadcastSync({ kind: 'settings:changed' })).not.toThrow();
		const unsubscribe = onSync(() => {});
		expect(typeof unsubscribe).toBe('function');
		unsubscribe();
	});
});
