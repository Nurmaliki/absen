<script lang="ts">
	import { onMount } from 'svelte';
	import { listCameras } from '$lib/utils/camera';
	import { saveSettings } from '$lib/db/settings';
	import { appSettings } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	let devices = $state<MediaDeviceInfo[]>([]);
	let selected = $state('');
	let permissionDenied = $state(false);

	onMount(async () => {
		selected = appSettings.value.cameraDeviceId ?? '';
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
