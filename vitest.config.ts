import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Vitest config — separate from vite.config.ts so the PWA/adapter plugins used for the
 * real build don't interfere with unit tests.
 *
 * Coverage:
 * - Pure business logic (attendance rules, matching, quality, reports, backups) runs
 *   under jsdom with `fake-indexeddb` supplying the DB.
 * - Component tests use @testing-library/svelte.
 */
export default defineConfig({
	plugins: [svelte(), sveltekit()],
	resolve: {
		conditions: ['browser']
	},
	test: {
		include: ['tests/unit/**/*.{test,spec}.ts'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['tests/unit/setup.ts'],
		restoreMocks: true,
		server: {
			deps: {
				inline: ['@testing-library/svelte', '@testing-library/svelte-core']
			}
		}
	}
});
