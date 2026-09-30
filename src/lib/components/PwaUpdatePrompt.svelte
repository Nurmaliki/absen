<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	/**
	 * PWA update prompt. Uses vite-plugin-pwa's virtual module via the browser global
	 * registration, falling back gracefully when the SW is unavailable (dev / unsupported).
	 */
	let needRefresh = $state(false);
	let offlineReady = $state(false);
	let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

	onMount(async () => {
		if (!browser || !('serviceWorker' in navigator)) return;
		try {
			const { registerSW } = await import('virtual:pwa-register');
			updateSW = registerSW({
				immediate: true,
				onNeedRefresh() {
					needRefresh = true;
				},
				onOfflineReady() {
					offlineReady = true;
					setTimeout(() => (offlineReady = false), 5000);
				}
			});
		} catch {
			// SW registration is optional; the app is fully functional without it.
		}
	});
</script>

{#if needRefresh}
	<div
		class="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-brand-700 px-4 py-2 text-sm text-white"
		role="alert"
	>
		<span>Versi baru tersedia.</span>
		<div class="flex gap-2">
			<button
				type="button"
				class="rounded bg-white/20 px-3 py-1 font-medium hover:bg-white/30"
				onclick={() => updateSW?.(true)}>Perbarui</button
			>
			<button
				type="button"
				class="rounded px-2 py-1 hover:bg-white/20"
				aria-label="Nanti"
				onclick={() => (needRefresh = false)}>Nanti</button
			>
		</div>
	</div>
{/if}

{#if offlineReady}
	<div
		class="fixed inset-x-0 top-0 z-50 bg-slate-800 px-4 py-2 text-center text-sm text-white"
		role="status"
	>
		Aplikasi siap digunakan secara offline.
	</div>
{/if}
