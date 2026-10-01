import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration.
 *
 * The face engine is mocked at the browser level (see tests/e2e/fixtures.ts) so tests
 * don't need a real camera or GPU. We still run against the real built app, real
 * IndexedDB, and real routing.
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	timeout: 60_000,
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		// Camera + secure-context features require a secure origin; localhost counts.
		permissions: ['camera']
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					// Keep Chrome's footprint low so the shared dev/preview server is not
					// OOM-killed on memory-constrained machines.
					args: [
						'--use-fake-device-for-media-stream',
						'--use-fake-ui-for-media-stream',
						'--disable-dev-shm-usage',
						'--js-flags=--max-old-space-size=1024'
					]
				}
			}
		},
		{
			name: 'mobile',
			use: {
				...devices['Pixel 7'],
				launchOptions: {
					args: [
						'--use-fake-device-for-media-stream',
						'--use-fake-ui-for-media-stream',
						'--disable-dev-shm-usage',
						'--js-flags=--max-old-space-size=1024'
					]
				}
			}
		}
	],
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173',
		port: 4173,
		// Always start a fresh build+preview. Reusing an arbitrarily-old preview server can
		// silently serve a stale bundle (and a manually-killed server yields
		// `net::ERR_CONNECTION_REFUSED` mid-run), which produces failures unrelated to the code.
		//
		// `PW_REUSE_SERVER=1` opts into reusing an already-running preview. This is useful on
		// memory-constrained machines where the build+preview may be OOM-killed mid-run: you
		// build and start `vite preview` yourself, then point Playwright at it.
		reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
		timeout: 240_000
	}
});
