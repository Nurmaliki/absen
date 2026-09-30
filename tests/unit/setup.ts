import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom does not provide Web Crypto's subtle in all Node versions; wire in Node's.
if (!globalThis.crypto?.subtle) {
	Object.defineProperty(globalThis, 'crypto', {
		value: webcrypto,
		configurable: true
	});
}

// jsdom lacks matchMedia used by a few components.
if (!window.matchMedia) {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false
	})) as unknown as typeof window.matchMedia;
}
