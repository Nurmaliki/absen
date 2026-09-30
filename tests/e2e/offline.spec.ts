import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Offline / PWA behavior.
 *
 * We verify the service worker registers, caches the shell, and that the app still loads
 * and reads local data with the network disabled — the core "offline-first" promise.
 *
 * Note: we do NOT use Playwright's `context.setOffline(true)` here. That helper makes
 * top-level navigations fail with `net::ERR_FAILED` even when a service worker could serve
 * them, so it cannot exercise an offline-first app. The `setOffline` fixture emulates the
 * network condition through CDP instead, which behaves like a real network drop and lets
 * the service worker cache answer the navigation.
 */

/**
 * Register the SW and wait until it *controls* the page.
 *
 * A freshly-installed service worker does not control the page that registered it until
 * the next navigation, so we reload once to attach the controller. This also makes the
 * tests robust when they run late in a large suite, where the browser may throttle the
 * very first registration of an origin.
 */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
	await page.goto('/');
	await page.waitForFunction(
		() => navigator.serviceWorker?.getRegistration().then((r) => r?.active?.state === 'activated'),
		undefined,
		{ timeout: 30_000 }
	);
	// Reload once so the now-activated worker takes control of this page.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
		timeout: 30_000
	});
}

test.describe('offline capability', () => {
	test('service worker registers and caches the app shell', async ({ page }) => {
		await waitForServiceWorkerControl(page);
		const hasController = await page.evaluate(() => navigator.serviceWorker.controller != null);
		expect(hasController).toBe(true);
	});

	test('application opens offline after a first online visit', async ({ page, setOffline }) => {
		// First visit online to populate caches, then ensure the worker controls the page.
		await waitForServiceWorkerControl(page);
		// Give the precache a moment to finish.
		await page.waitForTimeout(1500);

		// Go offline and reload: the service worker should serve the shell from cache.
		await setOffline(true);
		await page.reload({ waitUntil: 'domcontentloaded' });

		await expect(page.getByRole('heading', { name: /selamat datang|dashboard/i })).toBeVisible({
			timeout: 20_000
		});

		await setOffline(false);
	});

	test('IndexedDB data is available offline', async ({ page, setOffline }) => {
		await waitForServiceWorkerControl(page);

		// Seed a tiny bit of data directly through IndexedDB (without pinning a version, so
		// Dexie's internal schema version doesn't matter), then confirm it is readable offline.
		await page.evaluate(async () => {
			const openReq = indexedDB.open('absensi-wajah');
			const db: IDBDatabase = await new Promise((resolve, reject) => {
				openReq.onsuccess = () => resolve(openReq.result);
				openReq.onerror = () => reject(openReq.error);
			});
			await new Promise<void>((resolve, reject) => {
				const tx = db.transaction('settings', 'readwrite');
				tx.objectStore('settings').put({
					id: 'app',
					schoolName: 'Uji Offline',
					academicYear: '2026/2027',
					semester: 'Ganjil',
					defaultEntryTime: '06:30',
					lateThreshold: '07:00',
					recognitionThreshold: 0.5,
					recognitionMargin: 0.08,
					livenessEnabled: true,
					autoLockMinutes: 15,
					backupReminderDays: 7,
					onboardingComplete: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				});
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			});
			db.close();
		});

		await setOffline(true);
		await page.reload({ waitUntil: 'domcontentloaded' });

		// The page should still be able to read the local DB while offline.
		const readable = await page.evaluate(async () => {
			const openReq = indexedDB.open('absensi-wajah');
			const db: IDBDatabase = await new Promise((resolve, reject) => {
				openReq.onsuccess = () => resolve(openReq.result);
				openReq.onerror = () => reject(openReq.error);
			});
			const tx = db.transaction('settings', 'readonly');
			const getReq = tx.objectStore('settings').get('app');
			const result = await new Promise<unknown>((resolve, reject) => {
				getReq.onsuccess = () => resolve(getReq.result);
				getReq.onerror = () => reject(getReq.error);
			});
			db.close();
			return result;
		});
		expect(readable).toBeTruthy();
		await setOffline(false);
	});
});
