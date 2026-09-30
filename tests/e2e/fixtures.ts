import { test as base, expect, type Page } from '@playwright/test';

/**
 * E2E fixtures.
 *
 * Faces are mocked deterministically:
 * - `addInitScript` installs a synthetic camera stream (a canvas moving an image) so
 *   getUserMedia succeeds without hardware.
 * - We also stub the Human.js module surface via a global override so `detect`/
 *   `generateDescriptor` return stable descriptors per "person".
 *
 * The stub is intentionally simple: it exercises the app's real pipeline (quality gate,
 * matching, duplicate prevention, DB writes) with controllable inputs.
 */

export interface FaceMockOptions {
	/** Number of faces the detector reports. Defaults to 1. */
	faceCount?: number;
	/** Deterministic descriptor returned for the current "person". */
	descriptor?: number[];
	/** Passive liveness signal returned (0..1). */
	liveness?: number;
}

export interface AppFixtures {
	page: Page;
	/** Configure the face engine mock for this page before navigation. */
	setFaceMock: (options: FaceMockOptions) => Promise<void>;
	/** Skip the onboarding wizard by seeding admin + settings directly. */
	seedOnboarded: () => Promise<void>;
	/**
	 * Toggle network offline via a raw CDP session.
	 *
	 * `context.setOffline(true)` (Playwright's helper) makes top-level navigations fail with
	 * `net::ERR_FAILED` even when a service worker could serve them, so it cannot be used to
	 * verify offline-first behavior. Emulating the network condition through CDP instead
	 * behaves like a real network drop: the service worker cache serves the navigation.
	 */
	setOffline: (offline: boolean) => Promise<void>;
}

export const test = base.extend<AppFixtures>({
	setFaceMock: async ({ page }, use) => {
		await use(async (options) => {
			await page.addInitScript((opts: FaceMockOptions) => {
				(window as unknown as { __FACE_MOCK__: FaceMockOptions }).__FACE_MOCK__ = opts;
			}, options);
		});
	},

	seedOnboarded: async ({ page }, use) => {
		await use(async () => {
			await page.addInitScript(() => {
				(window as unknown as { __SEED_ONBOARDED__: boolean }).__SEED_ONBOARDED__ = true;
			});
		});
	},

	setOffline: async ({ page }, use) => {
		await use(async (offline: boolean) => {
			const session = await page.context().newCDPSession(page);
			await session.send('Network.enable');
			await session.send('Network.emulateNetworkConditions', {
				offline,
				latency: 0,
				downloadThroughput: offline ? 0 : -1,
				uploadThroughput: offline ? 0 : -1
			});
		});
	}
});

export { expect };
