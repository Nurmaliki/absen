<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import FaceCapture from '$lib/components/FaceCapture.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { getFaceEngine } from '$lib/face/engine';
	import {
		averageDescriptors,
		descriptorConsistency,
		evaluateQuality,
		luminanceStats
	} from '$lib/face/quality';
	import {
		getStudent,
		saveFaceTemplate,
		deleteFaceTemplate,
		setFaceRegistered
	} from '$lib/db/students';
	import { getClass } from '$lib/db/classes';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { Student } from '$lib/types';

	const POSES = [
		{ key: 'center', label: 'Lihat lurus ke kamera', instruction: 'Lihat lurus' },
		{ key: 'left', label: 'Sedikit menghadap ke kiri', instruction: 'Sedikit ke kiri' },
		{ key: 'right', label: 'Sedikit menghadap ke kanan', instruction: 'Sedikit ke kanan' }
	] as const;

	/** Number of accepted frames required per pose. */
	const SAMPLES_PER_POSE = 2;
	/** Max average descriptor distance between accepted samples (consistency gate). */
	const MAX_AVERAGE_DISTANCE = 0.35;

	let studentId = $derived(page.params.id);
	let student = $state<Student | null>(null);
	let className = $state('');
	let loading = $state(true);
	let loadError = $state('');

	let poseIndex = $state(0);
	let samples = $state<Record<string, number[][]>>({ center: [], left: [], right: [] });
	let liveQuality = $state<{ ok: boolean; message: string } | null>(null);
	let engineReady = $state(false);
	let capturing = $state(false);
	let saving = $state(false);
	let processing = false;
	let cooldownUntil = 0;

	const allSamples = $derived([
		...(samples.center ?? []),
		...(samples.left ?? []),
		...(samples.right ?? [])
	]);
	const totalAccepted = $derived(allSamples.length);
	const requiredTotal = SAMPLES_PER_POSE * POSES.length;
	const progress = $derived(Math.min(100, Math.round((totalAccepted / requiredTotal) * 100)));

	onMount(async () => {
		if (!browser) return;
		try {
			const s = await getStudent(studentId);
			if (!s) {
				loadError = 'Siswa tidak ditemukan.';
				return;
			}
			student = s;
			const cls = await getClass(s.classId);
			className = cls?.name ?? '';
			const engine = getFaceEngine();
			engine
				.initialize((message) => {
					engineReady = engine.isReady();
					void message;
				})
				.then(() => {
					engineReady = true;
				})
				.catch((e) => {
					loadError = e instanceof Error ? e.message : 'Gagal memuat model pengenalan wajah.';
				});
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Gagal memuat data.';
		} finally {
			loading = false;
		}
	});

	async function handleFrame(canvas: HTMLCanvasElement) {
		if (processing || saving || !student) return;
		const now = performance.now();
		if (now < cooldownUntil) return;

		processing = true;
		try {
			const engine = getFaceEngine();
			if (!engine.isReady()) {
				engineReady = false;
				return;
			}
			engineReady = true;

			const faces = await engine.detect(canvas);
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			const luminance = ctx ? luminanceStats(ctx, canvas.width, canvas.height) : undefined;
			const quality = evaluateQuality(faces, canvas.width, canvas.height, luminance);

			if (!quality.ok) {
				liveQuality = { ok: false, message: quality.issues[0] };
				return;
			}

			liveQuality = { ok: true, message: 'Wajah terdeteksi. Tahan posisi…' };

			// Auto-capture when quality is good and the current pose still needs samples.
			const pose = POSES[poseIndex];
			if (!pose) return;
			if ((samples[pose.key]?.length ?? 0) >= SAMPLES_PER_POSE) return;

			const result = await engine.generateDescriptor(canvas);
			if (!result) return;

			const accepted = samples[pose.key] ?? [];
			accepted.push(result.descriptor);
			samples = { ...samples, [pose.key]: accepted };

			cooldownUntil = performance.now() + 500; // brief cooldown between samples

			if (accepted.length >= SAMPLES_PER_POSE) {
				if (poseIndex < POSES.length - 1) {
					poseIndex += 1;
					cooldownUntil = performance.now() + 800;
				}
			}
			checkReadyToSave();
		} catch {
			// Swallow frame errors — a single bad frame should not break the flow.
		} finally {
			processing = false;
		}
	}

	function checkReadyToSave() {
		if (totalAccepted >= requiredTotal) {
			void saveTemplate();
		}
	}

	/** Validate consistency then persist the averaged descriptor. */
	async function saveTemplate() {
		if (saving || !student) return;
		const engine = getFaceEngine();

		const consistency = descriptorConsistency(
			allSamples,
			(a, b) => engine.compare(a, b),
			MAX_AVERAGE_DISTANCE
		);

		if (!consistency.consistent) {
			toasts.error(
				'Sampel wajah tidak konsisten. Pastikan hanya satu orang di depan kamera dan pencahayaan memadai. Silakan ulangi.'
			);
			reset();
			return;
		}

		saving = true;
		try {
			const descriptor = averageDescriptors(allSamples);
			await saveFaceTemplate({
				studentId: student.id,
				descriptor,
				metric: engine.metric,
				modelVersion: engine.modelVersion,
				qualityScore: 1 - consistency.averageDistance
			});
			toasts.success(`Wajah ${student.name} berhasil didaftarkan.`);
			goto('/students');
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menyimpan data wajah.');
		} finally {
			saving = false;
		}
	}

	function reset() {
		samples = { center: [], left: [], right: [] };
		poseIndex = 0;
		cooldownUntil = performance.now() + 600;
	}

	async function removeExisting() {
		if (!student) return;
		try {
			await deleteFaceTemplate(student.id);
			await setFaceRegistered(student.id, false);
			student = { ...student, faceRegistered: false };
			toasts.info('Data wajah dihapus. Silakan daftarkan ulang.');
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menghapus data wajah.');
		}
	}
</script>

{#if loading}
	<Spinner fullPage message="Memuat…" />
{:else if loadError}
	<div class="card mx-auto max-w-md text-center" role="alert">
		<p class="text-sm text-red-600">{loadError}</p>
		<a href="/students" class="btn-secondary mt-3">Kembali ke Daftar Siswa</a>
	</div>
{:else if student}
	<PageHeader
		title="Registrasi Wajah"
		description="{student.name} · NIS {student.nis} · {className}"
	>
		<a href="/students" class="btn-secondary">Kembali</a>
	</PageHeader>

	{#if student.faceRegistered}
		<div
			class="mb-4 flex items-center justify-between rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
		>
			<span>Wajah siswa ini sudah terdaftar. Mendaftar ulang akan menggantikan data lama.</span>
			<button class="btn-secondary" onclick={removeExisting}>Hapus Wajah Lama</button>
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<div>
			<FaceCapture onframe={handleFrame} overlay hint={POSES[poseIndex]?.label ?? 'Menyimpan…'} />

			{#if liveQuality}
				<p
					class="mt-2 rounded-lg px-3 py-2 text-sm {liveQuality.ok
						? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
						: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'}"
					role="status"
				>
					{liveQuality.message}
				</p>
			{/if}
		</div>

		<div class="card">
			<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Instruksi</h2>
			<p class="mt-1 text-xs text-slate-500">
				Kami mengambil beberapa sampel dari 3 posisi untuk hasil pengenalan yang lebih akurat.
			</p>

			<ol class="mt-4 space-y-3">
				{#each POSES as pose, i (pose.key)}
					{@const done = (samples[pose.key]?.length ?? 0) >= SAMPLES_PER_POSE}
					{@const samplesTaken = samples[pose.key]?.length ?? 0}
					<li class="flex items-center gap-3">
						<span
							class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold {done
								? 'bg-brand-600 text-white'
								: i === poseIndex
									? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40'
									: 'bg-slate-100 text-slate-500 dark:bg-slate-800'}"
						>
							{done ? '✓' : i + 1}
						</span>
						<div class="flex-1">
							<p class="text-sm font-medium {i === poseIndex && !done ? 'text-brand-600' : ''}">
								{pose.label}
							</p>
							<p class="text-xs text-slate-400">
								{samplesTaken}/{SAMPLES_PER_POSE} sampel
							</p>
						</div>
					</li>
				{/each}
			</ol>

			<div class="mt-4">
				<div class="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
					<div class="h-full bg-brand-600 transition-all" style="width: {progress}%"></div>
				</div>
				<p class="mt-1 text-right text-xs text-slate-500">{progress}%</p>
			</div>

			{#if !engineReady}
				<p class="mt-3 text-xs text-slate-500">Memuat model pengenalan wajah…</p>
			{/if}

			<div class="mt-4 flex gap-2">
				<button class="btn-secondary flex-1" onclick={reset}>Ulangi Sampel</button>
				<button
					class="btn-primary flex-1"
					onclick={saveTemplate}
					disabled={totalAccepted < requiredTotal || saving}
				>
					{saving ? 'Menyimpan…' : 'Simpan Wajah'}
				</button>
			</div>

			<p class="mt-3 text-xs text-slate-400">
				Cahaya yang baik dan wajah yang jelas sangat membantu. Bila kualitas wajah buruk, sistem
				akan meminta Anda memindahkan ke tempat yang lebih terang.
			</p>
		</div>
	</div>
{/if}
