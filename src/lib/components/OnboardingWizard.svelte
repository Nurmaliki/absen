<script lang="ts">
	import { createAdminPin } from '$lib/security/auth';
	import { completeOnboarding, saveSettings } from '$lib/db/settings';
	import { appSettings } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { isValidClock } from '$lib/utils/time';

	interface Props {
		oncomplete: () => void;
	}

	let { oncomplete }: Props = $props();

	let step = $state(1);
	let busy = $state(false);
	let error = $state('');

	const totalSteps = 6;

	let schoolName = $state('');
	let academicYear = $state(defaultAcademicYear());
	let semester = $state<'Ganjil' | 'Genap'>('Ganjil');
	let entryTime = $state('06:30');
	let lateThreshold = $state('07:00');
	let pin = $state('');
	let pinConfirm = $state('');

	function defaultAcademicYear(): string {
		const now = new Date();
		const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
		return `${year}/${year + 1}`;
	}

	function next() {
		error = '';
		if (step === 1 && !schoolName.trim()) {
			error = 'Nama sekolah wajib diisi.';
			return;
		}
		if (step === 2 && !academicYear.trim()) {
			error = 'Tahun ajaran wajib diisi.';
			return;
		}
		if (step === 4 && !isValidClock(entryTime)) {
			error = 'Jam masuk tidak valid. Gunakan format HH:MM.';
			return;
		}
		if (step === 5 && !isValidClock(lateThreshold)) {
			error = 'Batas keterlambatan tidak valid. Gunakan format HH:MM.';
			return;
		}
		step = Math.min(totalSteps, step + 1);
	}

	function back() {
		error = '';
		step = Math.max(1, step - 1);
	}

	async function finish() {
		error = '';
		if (pin.length < 4) {
			error = 'PIN minimal 4 digit.';
			return;
		}
		if (pin !== pinConfirm) {
			error = 'Konfirmasi PIN tidak cocok.';
			return;
		}
		busy = true;
		try {
			await createAdminPin(pin);
			await saveSettings({
				defaultEntryTime: entryTime,
				lateThreshold
			});
			const settings = await completeOnboarding({
				schoolName: schoolName.trim(),
				academicYear: academicYear.trim(),
				semester,
				defaultEntryTime: entryTime,
				lateThreshold
			});
			appSettings.set(settings);
			toasts.success('Pengaturan awal selesai. Selamat menggunakan!');
			oncomplete();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menyimpan pengaturan.';
		} finally {
			busy = false;
		}
	}

	const stepTitles = [
		'Nama Sekolah',
		'Tahun Ajaran',
		'Semester',
		'Jam Masuk Default',
		'Batas Keterlambatan',
		'PIN Administrator'
	];
</script>

<div class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-8">
	<div class="mb-6 text-center">
		<div class="text-4xl" aria-hidden="true">🎓</div>
		<h1 class="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
			Selamat Datang di Absensi Wajah
		</h1>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
			Atur aplikasi dalam beberapa langkah singkat.
		</p>
	</div>

	<div class="card">
		<div class="mb-4">
			<div class="flex items-center justify-between text-xs text-slate-500">
				<span>Langkah {step} dari {totalSteps}</span>
				<span>{Math.round((step / totalSteps) * 100)}%</span>
			</div>
			<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
				<div
					class="h-full rounded-full bg-brand-600 transition-all"
					style="width: {Math.round((step / totalSteps) * 100)}%"
				></div>
			</div>
			<h2 class="mt-3 text-base font-semibold text-slate-800 dark:text-slate-100">
				{stepTitles[step - 1]}
			</h2>
		</div>

		<div class="space-y-4">
			{#if step === 1}
				<div>
					<label class="label" for="school-name">Nama Sekolah</label>
					<input
						id="school-name"
						bind:value={schoolName}
						class="input"
						placeholder="contoh: SMP Negeri 1 Nusantara"
						autocomplete="organization"
					/>
				</div>
			{:else if step === 2}
				<div>
					<label class="label" for="academic-year">Tahun Ajaran</label>
					<input
						id="academic-year"
						bind:value={academicYear}
						class="input"
						placeholder="2026/2027"
					/>
					<p class="mt-1 text-xs text-slate-500">Format: YYYY/YYYY</p>
				</div>
			{:else if step === 3}
				<fieldset>
					<legend class="label">Semester</legend>
					<div class="flex gap-3">
						{#each ['Ganjil', 'Genap'] as option (option)}
							<label
								class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 transition {semester ===
								option
									? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
									: 'border-slate-300 dark:border-slate-700'}"
							>
								<input type="radio" bind:group={semester} value={option} class="sr-only" />
								<span class="text-sm font-medium">{option}</span>
							</label>
						{/each}
					</div>
				</fieldset>
			{:else if step === 4}
				<div>
					<label class="label" for="entry-time">Jam Masuk Default</label>
					<input id="entry-time" type="time" bind:value={entryTime} class="input" />
					<p class="mt-1 text-xs text-slate-500">Jam ini menjadi acuan pembukaan sesi absensi.</p>
				</div>
			{:else if step === 5}
				<div>
					<label class="label" for="late-threshold">Batas Keterlambatan</label>
					<input id="late-threshold" type="time" bind:value={lateThreshold} class="input" />
					<p class="mt-1 text-xs text-slate-500">
						Pindai setelah jam ini akan dicatat sebagai <strong>Terlambat</strong>.
					</p>
				</div>
			{:else if step === 6}
				<div class="space-y-4">
					<div>
						<label class="label" for="pin">PIN Administrator</label>
						<input
							id="pin"
							type="password"
							inputmode="numeric"
							bind:value={pin}
							class="input"
							placeholder="Minimal 4 digit"
							autocomplete="new-password"
						/>
					</div>
					<div>
						<label class="label" for="pin-confirm">Konfirmasi PIN</label>
						<input
							id="pin-confirm"
							type="password"
							inputmode="numeric"
							bind:value={pinConfirm}
							class="input"
							placeholder="Ulangi PIN"
							autocomplete="new-password"
						/>
					</div>
					<p
						class="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
					>
						PIN hanya disimpan sebagai hash di perangkat ini dan tidak dikirim ke server. Jangan
						lupakan PIN Anda.
					</p>
				</div>
			{/if}
		</div>

		{#if error}
			<p class="mt-3 text-sm text-red-600" role="alert">{error}</p>
		{/if}

		<div class="mt-6 flex justify-between gap-2">
			<button type="button" class="btn-secondary" onclick={back} disabled={step === 1 || busy}>
				Kembali
			</button>
			{#if step < totalSteps}
				<button type="button" class="btn-primary" onclick={next}>Lanjut</button>
			{:else}
				<button type="button" class="btn-primary" onclick={finish} disabled={busy}>
					{busy ? 'Menyimpan…' : 'Selesai'}
				</button>
			{/if}
		</div>
	</div>
</div>
