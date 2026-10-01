<script lang="ts">
	import { onMount } from 'svelte';
	import { listCameras } from '$lib/utils/camera';
	import { saveSettings } from '$lib/db/settings';
	import { appSettings } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { setFaceEnginePreference, type FaceEngineKind } from '$lib/face/engine';
	import { WorkerFaceEngine } from '$lib/face/worker-engine';

	let devices = $state<MediaDeviceInfo[]>([]);
	let selected = $state('');
	let permissionDenied = $state(false);
	let engineMode = $state<FaceEngineKind>('auto');
	let workerSupported = $state(false);

	onMount(async () => {
		selected = appSettings.value.cameraDeviceId ?? '';
		engineMode = appSettings.value.faceEngineMode ?? 'auto';
		workerSupported = WorkerFaceEngine.isSupported();
		// enumerateDevices only exposes labels after camera permission is granted once.
		devices = await listCameras();
		if (devices.length === 0) permissionDenied = true;
	});

	async function requestDevices() {
		try {
			// A short-lived stream triggers the permission prompt so labels become available.
			const stream = await navigator.mediaDevices.getUserMedia({ video: true });
			stream.getTracks().forEach((t) => t.stop());
			devices = await listCameras();
			permissionDenied = devices.length === 0;
		} catch {
			permissionDenied = true;
			toasts.error('Akses kamera ditolak atau tidak tersedia.');
		}
	}

	async function saveDevice() {
		await saveSettings({ cameraDeviceId: selected || undefined });
		appSettings.patch({ cameraDeviceId: selected || undefined });
		toasts.success('Perangkat kamera disimpan.');
	}

	async function saveEngineMode() {
		await saveSettings({ faceEngineMode: engineMode });
		appSettings.patch({ faceEngineMode: engineMode });
		// Rebuild the singleton so the change takes effect on the next scan.
		setFaceEnginePreference(engineMode);
		toasts.success('Mode pemrosesan wajah disimpan.');
	}
</script>

<div class="card">
	<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Kamera</h2>
	<p class="mt-1 text-xs text-slate-500">
		Pilih kamera yang digunakan untuk absensi. Label kamera hanya muncul setelah izin diberikan.
	</p>
	{#if permissionDenied && devices.length === 0}
		<button class="btn-secondary mt-3" onclick={requestDevices}>Izinkan & Muat Kamera</button>
	{:else}
		<div class="mt-3 flex flex-wrap items-end gap-2">
			<div class="min-w-[12rem] flex-1">
				<label class="label" for="cam-device">Perangkat Kamera</label>
				<select id="cam-device" bind:value={selected} class="input">
					<option value="">Kamera default</option>
					{#each devices as device (device.deviceId)}
						<option value={device.deviceId}>{device.label || device.deviceId.slice(0, 8)}</option>
					{/each}
				</select>
			</div>
			<button class="btn-secondary" onclick={saveDevice}>Simpan</button>
		</div>
	{/if}
</div>

<div class="card">
	<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Pemrosesan Wajah</h2>
	<p class="mt-1 text-xs text-slate-500">
		Secara default pengenalan wajah dijalankan di <em>Web Worker</em> (thread terpisah) agar antarmuka
		tidak tersendat. Jika perangkat menampilkan masalah, Anda dapat memaksa mode lain.
	</p>
	{#if !workerSupported}
		<p
			class="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
		>
			Browser ini tidak mendukung Web Worker + OffscreenCanvas, sehingga pemrosesan berjalan di
			thread utama.
		</p>
	{/if}
	<div class="mt-3 flex flex-wrap items-end gap-2">
		<div class="min-w-[12rem] flex-1">
			<label class="label" for="engine-mode">Mode Pemrosesan</label>
			<select
				id="engine-mode"
				bind:value={engineMode}
				class="input"
				disabled={!workerSupported && engineMode !== 'main'}
			>
				<option value="auto">Otomatis (disarankan)</option>
				<option value="worker">Worker (thread terpisah)</option>
				<option value="main">Thread utama (kompatibilitas)</option>
			</select>
		</div>
		<button class="btn-secondary" onclick={saveEngineMode}>Simpan</button>
	</div>
</div>
