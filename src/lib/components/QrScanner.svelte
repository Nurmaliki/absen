<script lang="ts">
	import { onDestroy } from 'svelte';
	import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
	import { parseQrPayload, type QrPayload } from '$lib/reports/qr';
	import { mapCameraError } from '$lib/utils/camera';
	import { toasts } from '$lib/stores/toast.svelte';

	/**
	 * Camera QR scanner (attendance fallback).
	 *
	 * Decodes QR codes locally with `@zxing/browser` — no frames or decoded values leave the
	 * device. Only payloads in our own `ABSEN:` format are surfaced; any other QR in the room
	 * is ignored, so a random poster cannot silently record attendance.
	 */

	interface Props {
		/** Prefer a specific camera (from settings). */
		deviceId?: string;
		/** Called once per decoded, valid payload. Return true to keep scanning. */
		onscanned: (payload: QrPayload, raw: string) => boolean | Promise<boolean>;
	}

	let { deviceId, onscanned }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let error = $state('');
	let starting = $state(false);
	let scanning = $state(false);
	let lastValue = '';
	let controls: IScannerControls | null = null;

	async function start() {
		if (!video) return;
		starting = true;
		error = '';
		try {
			const reader = new BrowserQRCodeReader();
			controls = await reader.decodeFromConstraints(
				{ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' } },
				video,
				(result) => {
					if (!result) return;
					const text = result.getText();
					if (!text || text === lastValue) return;
					const payload = parseQrPayload(text);
					if (!payload) {
						// Not our QR — note it once so the operator understands, then keep going.
						if (lastValue !== text) toasts.info('Kode QR tidak dikenali (bukan kartu absensi).');
						lastValue = text;
						return;
					}
					lastValue = text;
					void Promise.resolve(onscanned(payload, text)).then((keepScanning) => {
						if (keepScanning) setTimeout(() => (lastValue = ''), 1500);
					});
				}
			);
			scanning = true;
		} catch (e) {
			error = mapCameraError(e).message;
		} finally {
			starting = false;
		}
	}

	function stop() {
		controls?.stop();
		controls = null;
		scanning = false;
	}

	onDestroy(stop);
</script>

<div class="relative overflow-hidden rounded-2xl bg-black">
	<video bind:this={video} class="aspect-square w-full object-cover" muted playsinline></video>

	{#if !scanning}
		<div class="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-white">
			<div class="text-center">
				{#if error}
					<p class="text-sm">Kamera QR bermasalah.</p>
					<p class="mt-1 text-xs text-white/70">{error}</p>
				{/if}
				<button class="btn-secondary mt-3" onclick={start} disabled={starting}>
					{starting ? 'Menyalakan…' : 'Aktifkan Pemindai QR'}
				</button>
			</div>
		</div>
	{/if}
</div>

<div class="mt-2 flex items-center justify-between">
	<p class="text-xs text-slate-500">
		{scanning ? 'Arahkan kamera ke kode QR kartu siswa.' : 'Pemindai QR nonaktif.'}
	</p>
	{#if scanning}
		<button class="text-xs text-slate-500 underline" onclick={stop}>Hentikan</button>
	{/if}
</div>
