<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import FaceCapture from './FaceCapture.svelte';
	import { getFaceEngine } from '$lib/face/engine';
	import { findBestMatch } from '$lib/face/matcher';
	import { evaluateQuality, luminanceStats } from '$lib/face/quality';
	import {
		CHALLENGE_INSTRUCTIONS,
		createBlinkTracker,
		createTurnTracker,
		DEFAULT_LIVENESS,
		evaluatePassive,
		eyeOpenness,
		headYaw,
		pickChallenge,
		type LivenessConfig
	} from '$lib/face/liveness';
	import { attachStream, captureFrame } from '$lib/utils/camera';
	import { appSettings } from '$lib/stores/app.svelte';
	import type { FaceTemplate, Student } from '$lib/types';

	/**
	 * Live recognition scanner.
	 *
	 * Pipeline per processed frame:
	 *   detect -> quality gate -> liveness -> descriptor -> match against class templates
	 *   -> emit a `recognized` event (caller handles duplicate check + persistence).
	 *
	 * The scanner never writes to the DB; it only reports a candidate. This keeps the
	 * anti-duplicate + audit logic in one place (the attendance repository).
	 */

	interface Props {
		templates: FaceTemplate[];
		students: Map<string, Student>;
		threshold: number;
		margin: number;
		livenessEnabled: boolean;
		/** When true, require a blink gesture before accepting a match (stronger anti-spoof). */
		challengeEnabled?: boolean;
		/** Called once per successful identification (caller persists). */
		onrecognized: (
			student: Student,
			info: { score: number; distance: number }
		) => boolean | 'duplicate' | Promise<boolean | 'duplicate'>;
		/** Pause processing (e.g. during manual entry modal). */
		paused?: boolean;
	}

	let {
		templates,
		students,
		threshold,
		margin,
		livenessEnabled,
		challengeEnabled = false,
		onrecognized,
		paused = false
	}: Props = $props();

	let status = $state<'idle' | 'searching' | 'recognized' | 'unknown' | 'multi' | 'challenge'>(
		'idle'
	);
	let statusMessage = $state('Arahkan wajah ke kamera.');
	let lastRecognized = $state<{ student: Student; time: string; duplicate: boolean } | null>(null);
	let engineReady = $state(false);
	let engineError = $state('');

	let processing = false;
	let cooldownUntil = 0;
	let challenge: 'blink' | 'turn-left' | 'turn-right' | null = null;
	let challengeStartedAt = 0;
	const blinkTracker = createBlinkTracker();
	let turnTracker: ReturnType<typeof createTurnTracker> | null = null;
	const livenessConfig: LivenessConfig = DEFAULT_LIVENESS;

	const TARGET_FPS = 8;
	let lastFrame = 0;

	onMount(() => {
		initializeEngine();
	});

	async function initializeEngine() {
		engineError = '';
		const engine = getFaceEngine();
		engineReady = engine.isReady();
		if (engineReady) return;
		try {
			await engine.initialize();
			engineReady = true;
		} catch (error) {
			engineReady = false;
			engineError = error instanceof Error ? error.message : 'Gagal memuat model pengenalan wajah.';
		}
	}

	onDestroy(() => {
		blinkTracker.reset();
	});

	async function handleFrame(canvas: HTMLCanvasElement) {
		if (processing || paused || !engineReady) return;
		const now = performance.now();
		if (now < cooldownUntil) return;

		processing = true;
		try {
			const engine = getFaceEngine();
			const faces = await engine.detect(canvas);

			if (faces.length === 0) {
				status = 'searching';
				statusMessage = 'Wajah tidak terdeteksi. Posisikan wajah di dalam bingkai.';
				return;
			}
			if (faces.length > 1) {
				status = 'multi';
				statusMessage = 'Terdeteksi lebih dari satu wajah. Pastikan hanya satu orang.';
				return;
			}

			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			const luminance = ctx ? luminanceStats(ctx, canvas.width, canvas.height) : undefined;
			const quality = evaluateQuality(faces, canvas.width, canvas.height, luminance);
			if (!quality.ok) {
				status = 'searching';
				statusMessage = quality.issues[0];
				return;
			}

			// --- Liveness layer ---
			if (livenessEnabled) {
				const passive = await engine.passiveLiveness(canvas);
				const passiveResult = evaluatePassive(passive, livenessConfig);
				if (!passiveResult.passed) {
					status = 'searching';
					statusMessage = passiveResult.message;
					return;
				}

				// Active challenge (opt-in): require a blink before we trust the frame. This is
				// deliberately checked *before* the descriptor so a photo can never short-circuit it.
				if (challengeEnabled) {
					const passed = updateChallenge(faces[0]?.mesh);
					if (!passed) return;
				}
			}

			// --- Descriptor + match ---
			const result = await engine.generateDescriptor(canvas);
			if (!result) {
				status = 'searching';
				statusMessage = 'Wajah terdeteksi, menunggu fokus…';
				return;
			}

			const outcome = findBestMatch(result.descriptor, templates, { threshold, margin });

			if (outcome.reason === 'no_templates') {
				status = 'unknown';
				statusMessage = 'Belum ada wajah terdaftar di kelas ini.';
				return;
			}
			if (outcome.reason === 'below_threshold') {
				status = 'unknown';
				statusMessage = 'Wajah tidak dikenali. Coba lagi atau pilih siswa manual.';
				cooldownUntil = performance.now() + 1500;
				return;
			}
			if (outcome.reason === 'ambiguous') {
				status = 'unknown';
				statusMessage = 'Wajah mirip dengan beberapa siswa. Gunakan absensi manual.';
				cooldownUntil = performance.now() + 2000;
				return;
			}

			const student = outcome.match ? students.get(outcome.match.studentId) : undefined;
			if (!student || !outcome.match) return;

			// --- Duplicate + persistence via caller (awaited so the displayed state is accurate) ---
			const resultFlag = await onrecognized(student, {
				score: outcome.match.similarity,
				distance: outcome.match.distance
			});

			if (resultFlag === 'duplicate') {
				status = 'recognized';
				statusMessage = `${student.name} sudah melakukan absensi.`;
			} else if (resultFlag === false) {
				status = 'unknown';
				statusMessage = 'Gagal menyimpan absensi. Coba lagi.';
			} else {
				status = 'recognized';
				statusMessage = `${student.name} — absensi tercatat.`;
			}
			lastRecognized = {
				student,
				time: new Date().toLocaleTimeString('id-ID'),
				duplicate: resultFlag === 'duplicate'
			};
			cooldownUntil = performance.now() + 2500;
			// Force a fresh challenge for the next student.
			challenge = null;
			turnTracker = null;
			blinkTracker.reset();
		} catch {
			// ignore frame errors
		} finally {
			processing = false;
		}
	}

	/**
	 * Run the challenge–response gesture. Returns true once the gesture is satisfied.
	 *
	 * The challenge is chosen lazily and timed: if it expires we pick a new one so the operator
	 * is never stuck. Blink is primary (most reliable on loose front-camera framing); head-turn
	 * is the fallback when landmarks are unavailable for blink.
	 */
	function updateChallenge(mesh: { x: number; y: number }[] | undefined): boolean {
		const now = performance.now();
		if (!challenge) {
			challenge = pickChallenge();
			challengeStartedAt = now;
			turnTracker =
				challenge === 'turn-left'
					? createTurnTracker('left')
					: challenge === 'turn-right'
						? createTurnTracker('right')
						: null;
			blinkTracker.reset();
			status = 'challenge';
			statusMessage = CHALLENGE_INSTRUCTIONS[challenge];
			return false;
		}

		if (now - challengeStartedAt > livenessConfig.challengeTimeoutMs) {
			// Timed out — restart with a fresh challenge rather than blocking forever.
			challenge = null;
			blinkTracker.reset();
			turnTracker = null;
			return false;
		}

		if (!mesh || mesh.length < 400) {
			status = 'challenge';
			statusMessage = CHALLENGE_INSTRUCTIONS[challenge];
			return false;
		}

		let passed = false;
		if (challenge === 'blink') {
			passed = blinkTracker.update(eyeOpenness(mesh), now);
		} else if (turnTracker) {
			passed = turnTracker.update(headYaw(mesh));
		}

		if (passed) {
			challenge = null;
			turnTracker = null;
			blinkTracker.reset();
			return true;
		}

		status = 'challenge';
		statusMessage = CHALLENGE_INSTRUCTIONS[challenge];
		return false;
	}

	const statusStyles: Record<string, string> = {
		idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
		searching: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
		recognized: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200',
		unknown: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
		multi: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
		challenge: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
	};
</script>

<div class="relative">
	<FaceCapture onframe={handleFrame} overlay hint="Posisikan wajah di dalam lingkaran" />

	{#if !engineReady}
		<div
			class="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70 px-4 text-white"
		>
			{#if engineError}
				<div class="text-center">
					<div class="text-2xl" aria-hidden="true">⚠️</div>
					<p class="mt-1 text-sm">Model pengenalan wajah gagal dimuat.</p>
					<p class="mt-1 text-xs text-white/70">{engineError}</p>
					<button class="btn-secondary mt-3" onclick={initializeEngine}>Coba Lagi</button>
				</div>
			{:else}
				<div class="text-center">
					<div
						class="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-3 border-white/30 border-t-white"
					></div>
					<p class="text-sm">Memuat model pengenalan wajah…</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<div class="mt-3 rounded-xl p-3 text-sm {statusStyles[status]}" role="status" aria-live="polite">
	{#if status === 'recognized' && lastRecognized}
		<div class="flex items-center gap-3">
			<span class="text-2xl" aria-hidden="true">{lastRecognized.duplicate ? 'ℹ️' : '✅'}</span>
			<div>
				<p class="font-semibold">{lastRecognized.student.name}</p>
				<p class="text-xs">
					NIS: {lastRecognized.student.nis} · {lastRecognized.duplicate
						? 'Sudah absen'
						: 'Kehadiran berhasil'} · {lastRecognized.time}
				</p>
			</div>
		</div>
	{:else}
		<div class="flex items-center gap-2">
			<span class="text-lg" aria-hidden="true">
				{status === 'searching'
					? '🔍'
					: status === 'multi'
						? '👥'
						: status === 'unknown'
							? '❓'
							: '📷'}
			</span>
			<span>{statusMessage}</span>
		</div>
	{/if}
</div>
