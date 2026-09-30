import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'prompt',
			// injectManifest lets SvelteKit bundle src/service-worker.ts into the client
			// output *before* adapter-vercel copies it to the deployment, which is required
			// for the service worker to actually ship. The plugin injects the precache
			// manifest (self.__WB_MANIFEST) into the file below.
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
			manifest: {
				name: 'Absensi Wajah Siswa',
				short_name: 'AbsensiWajah',
				description: 'Sistem absensi siswa dengan pengenalan wajah, lokal & offline.',
				lang: 'id',
				theme_color: '#0f766e',
				background_color: '#0f172a',
				display: 'standalone',
				orientation: 'any',
				start_url: '/',
				scope: '/',
				icons: [
					{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/icons/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			injectManifest: {
				// Only the client build outputs are precached (JS/CSS/HTML/icons/manifest).
				// Face models under /models/ are intentionally excluded and cached at
				// runtime by the service worker instead, keeping the first install fast.
				globPatterns: ['client/**/*.{js,css,ico,png,svg,woff,woff2,webmanifest,json}'],
				maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
			},
			devOptions: {
				enabled: false
			}
		})
	],
	define: {
		// workbox-* modules imported by the service worker reference process.env.NODE_ENV;
		// SvelteKit builds the SW in a non-Node browser context, so it must be defined.
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production')
	},
	server: {
		port: 5173
	}
});
