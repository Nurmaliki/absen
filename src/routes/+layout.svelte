<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import LockScreen from '$lib/components/LockScreen.svelte';
	import OnboardingWizard from '$lib/components/OnboardingWizard.svelte';
	import PwaUpdatePrompt from '$lib/components/PwaUpdatePrompt.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { getSettings } from '$lib/db/settings';
	import { hasAdmin } from '$lib/security/auth';
	import { onDbLifecycle } from '$lib/db/database';
	import { onSync } from '$lib/db/sync';
	import { setFaceEnginePreference } from '$lib/face/engine';
	import { appLock, appSettings, network } from '$lib/stores/app.svelte';
	import { kiosk } from '$lib/stores/kiosk.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { recreateDatabase } from '$lib/backup/restore';

	let { children } = $props();

	let bootState = $state<'loading' | 'onboarding' | 'ready' | 'error'>('loading');
	let bootError = $state('');
	let needsOnboarding = $state(false);
	let dbBlocked = $state(false);

	async function boot() {
		try {
			const adminExists = await hasAdmin();
			const settings = await getSettings();
			appSettings.set(settings);
			setFaceEnginePreference(settings.faceEngineMode ?? 'auto');
			needsOnboarding = !adminExists || !settings.onboardingComplete;
			bootState = needsOnboarding ? 'onboarding' : 'ready';
		} catch (error) {
			bootError =
				error instanceof Error ? error.message : 'Gagal membuka penyimpanan lokal (IndexedDB).';
			bootState = 'error';
		}
	}

	onMount(() => {
		if (!browser) return;
		boot();

		const onOnline = () => network.set(true);
		const onOffline = () => network.set(false);
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);

		// Auto-lock after inactivity.
		const activityEvents = ['pointerdown', 'keydown', 'visibilitychange'];
		const onActivity = () => {
			if (document.visibilityState === 'visible') appLock.touch();
		};
		activityEvents.forEach((event) => window.addEventListener(event, onActivity));

		const interval = window.setInterval(() => {
			const minutes = appSettings.value.autoLockMinutes;
			if (minutes <= 0) return;
			if (bootState !== 'ready' || needsOnboarding) return;
			if (Date.now() - appLock.lastActivity > minutes * 60_000) {
				appLock.lock();
			}
		}, 30_000);

		// Another tab is holding an older schema open: surface an actionable banner.
		const offLifecycle = onDbLifecycle((kind) => {
			if (kind === 'blocked') dbBlocked = true;
			if (kind === 'versionchange') {
				toasts.push('info', 'Aplikasi diperbarui di tab lain. Memuat ulang…');
				window.location.reload();
			}
		});

		// Keep settings fresh when another tab edits them.
		const offSync = onSync((event) => {
			if (event.kind === 'settings:changed') {
				getSettings()
					.then((next) => appSettings.set(next))
					.catch(() => {});
			}
			if (event.kind === 'data:reset' || event.kind === 'data:restored') {
				window.location.reload();
			}
		});

		const onFullscreenChange = () => kiosk.syncFromFullscreen();
		document.addEventListener('fullscreenchange', onFullscreenChange);

		return () => {
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			activityEvents.forEach((event) => window.removeEventListener(event, onActivity));
			window.clearInterval(interval);
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			offLifecycle();
			offSync();
		};
	});

	async function handleOnboardingComplete() {
		needsOnboarding = false;
		appLock.unlock();
		bootState = 'ready';
	}

	async function tryRecreate() {
		try {
			await recreateDatabase();
			window.location.reload();
		} catch (error) {
			bootError = error instanceof Error ? error.message : 'Gagal memulihkan database.';
		}
	}

	const showChrome = $derived(bootState === 'ready' && !needsOnboarding);

	/**
	 * Warn when the last encrypted backup is older than the configured reminder window.
	 * Local-first means the browser is the only copy — a stale backup is a real risk, so we
	 * surface it persistently (not as a dismissible toast).
	 */
	const backupOverdue = $derived.by(() => {
		if (!showChrome) return false;
		const days = appSettings.value.backupReminderDays;
		if (!days || days <= 0) return false;
		const last = appSettings.value.lastBackupAt;
		if (!last) return true; // never backed up
		const elapsed = Date.now() - new Date(last).getTime();
		return elapsed > days * 24 * 60 * 60 * 1000;
	});
</script>

<svelte:head>
	<title
		>{appSettings.value.schoolName
			? `${appSettings.value.schoolName} — Absensi Wajah`
			: 'Absensi Wajah Siswa'}</title
	>
	{#if !showChrome}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

{#if bootState === 'loading'}
	<Spinner fullPage message="Menyiapkan aplikasi…" />
{:else if bootState === 'error'}
	<div class="flex min-h-dvh items-center justify-center px-4">
		<div class="card max-w-md text-center">
			<div class="text-3xl" aria-hidden="true">⚠️</div>
			<h1 class="mt-2 text-lg font-semibold">Penyimpanan lokal bermasalah</h1>
			<p class="mt-2 text-sm text-slate-600 dark:text-slate-300">{bootError}</p>
			<p class="mt-2 text-xs text-slate-500">
				Jika masalah berlanjut, Anda dapat membuat ulang database kosong. Data lama pada database
				yang rusak tidak dapat dipulihkan dari sini.
			</p>
			<div class="mt-4 flex flex-col gap-2">
				<button class="btn-secondary" onclick={() => boot()}>Coba Lagi</button>
				<button class="btn-danger" onclick={tryRecreate}>Buat Ulang Database</button>
			</div>
		</div>
	</div>
{:else if bootState === 'onboarding'}
	<OnboardingWizard oncomplete={handleOnboardingComplete} />
{:else}
	<div class="flex min-h-dvh">
		{#if !kiosk.active}
			<Sidebar />
		{/if}
		<div class="flex min-w-0 flex-1 flex-col">
			{#if !kiosk.active}
				{#if !network.online}
					<div
						class="flex items-center gap-2 bg-slate-800 px-4 py-1.5 text-xs text-white"
						role="status"
					>
						<span aria-hidden="true">📴</span>
						Mode offline — data tetap tersimpan di perangkat ini.
					</div>
				{/if}
				{#if dbBlocked}
					<div
						class="flex items-center gap-2 bg-amber-600 px-4 py-1.5 text-xs text-white"
						role="alert"
					>
						<span aria-hidden="true">⚠️</span>
						Pembaruan database tertunda karena aplikasi masih terbuka di tab lain.
						<button class="ml-1 underline" onclick={() => window.location.reload()}
							>Muat ulang</button
						>
					</div>
				{/if}
				{#if backupOverdue}
					<div
						class="flex items-center gap-2 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
						role="status"
					>
						<span aria-hidden="true">💾</span>
						Sudah waktunya membuat backup. Data hanya tersimpan di perangkat ini.
						<a href="/settings" class="ml-1 font-medium underline">Buka Pengaturan</a>
					</div>
				{/if}
			{/if}
			<main
				class="mx-auto w-full max-w-6xl flex-1 px-4 py-5 {kiosk.active ? 'pb-8' : 'pb-24 lg:pb-8'}"
			>
				{@render children()}
			</main>
		</div>
	</div>
	{#if !kiosk.active}
		<BottomNav />
	{/if}
	{#if showChrome && appLock.locked}
		<LockScreen />
	{/if}
{/if}

<ToastHost />
<PwaUpdatePrompt />
