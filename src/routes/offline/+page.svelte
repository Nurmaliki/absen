<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let online = $state(true);

	onMount(() => {
		if (!browser) return;
		online = navigator.onLine;
		const update = () => (online = navigator.onLine);
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});
</script>

<svelte:head>
	<title>Offline — Absensi Wajah Siswa</title>
</svelte:head>

<div
	class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
>
	<div class="text-5xl" aria-hidden="true">📴</div>
	<h1 class="text-xl font-bold text-slate-900 dark:text-slate-100">Anda sedang offline</h1>
	<p class="text-sm text-slate-500 dark:text-slate-400">
		Halaman ini memerlukan koneksi. Data absensi Anda tetap tersimpan dengan aman di perangkat ini.
	</p>
	{#if online}
		<a href="/" class="btn-primary">Buka Aplikasi</a>
	{:else}
		<button class="btn-primary" onclick={() => window.location.reload()}>Coba Lagi</button>
		<a href="/" class="btn-secondary">Buka Aplikasi (Data Lokal)</a>
	{/if}
</div>
