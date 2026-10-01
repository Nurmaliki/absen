<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getFaceEngine } from '$lib/face/engine';
	import {
		attachStream,
		captureFrame,
		isCameraSupported,
		listCameras,
		mapCameraError,
		startCamera,
		type CameraHandle
	} from '$lib/utils/camera';

	interface Props {
		/**
		 * Called every processed frame with the capture canvas (already resized).
		 * May return a promise; the loop will not schedule the next *processed* frame until it
		 * settles, which prevents overlapping inferences on slow devices.
		 */
		onframe?: (canvas: HTMLCanvasElement) => void | Promise<void>;
		/** Hint text shown over the video. */
		hint?: string;
		/** Whether to draw the overlay bounding boxes. */
		overlay?: boolean;
	}

	let { onframe, hint, overlay = false }: Props = $props();

	let video = $state<HTMLVideoElement | null>(null);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let handle: CameraHandle | null = null;
	let running = $state(false);
	let starting = $state(false);
	let error = $state<{ message: string; hint: string } | null>(null);
	let devices = $state<MediaDeviceInfo[]>([]);
	let selectedDevice = $state('');
	let frameLoop = 0;
	let lastFrame = 0;
	let autoStartTried = false;
	/**
	 * Single source of truth for "a frame is being processed". Consumers no longer need their
	 * own guard: `processFrame` skips while `busy` is true, so slow engines simply drop frames
	 * instead of queueing overlapping inferences.
	 */
	let busy = false;

	/** Frames per second cap for engine processing (keeps CPU reasonable on phones). */
	const TARGET_FPS = 8;

	async function ensureEngine() {
		const engine = getFaceEngine();
		if (!engine.isReady()) await engine.initialize();
	}

	async function start(deviceId?: string) {
		starting = true;
		error = null;
		try {
			if (!isCameraSupported()) {
				error = mapCameraError({ name: 'NotSupportedError' });
				return;
			}
			handle?.stop();
			handle = await startCamera({ deviceId: deviceId || undefined, facingMode: 'user' });
			if (video) await attachStream(video, handle.stream);
			running = true;
			devices = await listCameras();
			if (!selectedDevice)
				selectedDevice = handle.stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
			scheduleLoop();
		} catch (e) {
			error = mapCameraError(e);
		} finally {
			starting = false;
		}
	}

	function scheduleLoop() {
		cancelAnimationFrame(frameLoop);
		const loop = (timestamp: number) => {
			if (!running) return;
			const interval = 1000 / TARGET_FPS;
			if (timestamp - lastFrame >= interval) {
				lastFrame = timestamp;
				processFrame();
			}
			frameLoop = requestAnimationFrame(loop);
		};
		frameLoop = requestAnimationFrame(loop);
	}

	function processFrame() {
		if (!video || !canvas || video.readyState < 2) return;
		if (busy) return; // previous frame still being analysed — drop this one
		captureFrame(video, canvas);
		const outcome = onframe?.(canvas);
		if (outcome && typeof (outcome as Promise<void>).then === 'function') {
			busy = true;
			(outcome as Promise<void>).finally(() => {
				busy = false;
			});
		}
	}

	async function switchDevice() {
		if (selectedDevice) await start(selectedDevice);
	}

	function stop() {
		running = false;
		cancelAnimationFrame(frameLoop);
		handle?.stop();
		handle = null;
		if (video) video.srcObject = null;
	}

	onDestroy(stop);

	// Expose imperative-ish start via an effect so parent can trigger on mount.
	export function begin() {
		return start();
	}

	// Auto-start once when the component mounts (after a tick).
	$effect(() => {
		if (!autoStartTried) {
			autoStartTried = true;
			ensureEngine().catch(() => {});
			start();
		}
	});
</script>

<div class="relative overflow-hidden rounded-2xl bg-black" style="aspect-ratio: 4 / 3;">
	<video
		bind:this={video}
		class="h-full w-full object-cover"
		playsinline
		muted
		aria-label="Pratinjau kamera"
	></video>
	<canvas bind:this={canvas} class="hidden"></canvas>

	{#if hint && running}
		<div
			class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-center text-sm text-white"
		>
			{hint}
		</div>
	{/if}

	{#if overlay}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="h-2/3 w-1/2 rounded-full border-2 border-white/60"></div>
		</div>
	{/if}

	{#if starting}
		<div class="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
			<div class="text-center">
				<div
					class="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-3 border-white/30 border-t-white"
				></div>
				<p class="text-sm">Menyalakan kamera…</p>
			</div>
		</div>
	{/if}

	{#if error}
		<div
			class="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-white"
		>
			<div class="max-w-xs">
				<div class="text-3xl" aria-hidden="true">📷</div>
				<p class="mt-2 font-semibold">{error.message}</p>
				<p class="mt-1 text-sm text-white/80">{error.hint}</p>
				<button class="btn-primary mt-3" onclick={() => start()}>Coba Lagi</button>
			</div>
		</div>
	{/if}
</div>

{#if devices.length > 1}
	<div class="mt-2 flex items-center gap-2">
		<label class="text-xs text-slate-500" for="camera-select">Kamera</label>
		<select
			id="camera-select"
			bind:value={selectedDevice}
			onchange={switchDevice}
			class="input max-w-xs text-xs"
		>
			{#each devices as device, i (device.deviceId)}
				<option value={device.deviceId}>{device.label || `Kamera ${i + 1}`}</option>
			{/each}
		</select>
	</div>
{/if}
