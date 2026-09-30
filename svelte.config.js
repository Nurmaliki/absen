import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Pin the Vercel runtime so local builds on newer Node versions still work.
		adapter: adapter({ runtime: 'nodejs20.x' }),
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
