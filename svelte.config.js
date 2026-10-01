import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Pin the Vercel runtime: local builds often run a newer Node than the deployment
		// target, and nodejs20.x is discontinued on Vercel. nodejs22.x is the current LTS.
		adapter: adapter({ runtime: 'nodejs22.x' }),
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
