import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Pin the Vercel runtime. nodejs20.x is discontinued on Vercel, and our QR dependency
		// (`@zxing/library` via `@zxing/browser`) requires Node >= 24, so 24.x is the floor.
		adapter: adapter({ runtime: 'nodejs24.x' }),
		serviceWorker: {
			// Registration is handled by vite-plugin-pwa's `virtual:pwa-register`
			// (see PwaUpdatePrompt.svelte); SvelteKit's own auto-registration is disabled
			// so the service worker is only registered once, with the update prompt wired up.
			register: false
		},
		alias: {
			$lib: './src/lib'
		}
	}
};

export default config;
