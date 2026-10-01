<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import { getSettings, saveSettings, thresholdAssessment } from '$lib/db/settings';
	import { changeAdminPin } from '$lib/security/auth';
	import { listClasses } from '$lib/db/classes';
	import { appSettings, appLock } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { isValidClock } from '$lib/utils/time';
	import {
		estimateStorage,
		requestPersistentStorage,
		storageWarningMessage,
		type StorageInfo
	} from '$lib/utils/storage';
	import { formatBytes } from '$lib/utils/id';
	import BackupPanel from '$lib/components/settings/BackupPanel.svelte';
	import ResetPanel from '$lib/components/settings/ResetPanel.svelte';
	import CameraSettings from '$lib/components/settings/CameraSettings.svelte';

	let loading = $state(true);
	let saving = $state(false);
	let storage = $state<StorageInfo | null>(null);
	let classCount = $state(0);

	let form = $state({
		schoolName: '',
		academicYear: '',
		semester: 'Ganjil',
		defaultEntryTime: '06:30',
		lateThreshold: '07:00',
		recognitionThreshold: 0.5,
		recognitionMargin: 0.08,
		livenessEnabled: true,
		livenessChallengeEnabled: false,
		autoLockMinutes: 15,
		backupReminderDays: 7
	});

	let pinForm = $state({ current: '', next: '', confirm: '' });
	let pinError = $state('');

	onMount(async () => {
		if (!browser) return;
		try {
			const settings = await getSettings();
			form = {
				schoolName: settings.schoolName,
				academicYear: settings.academicYear,
				semester: settings.semester,
				defaultEntryTime: settings.defaultEntryTime,
				lateThreshold: settings.lateThreshold,
				recognitionThreshold: settings.recognitionThreshold,
				recognitionMargin: settings.recognitionMargin,
				livenessEnabled: settings.livenessEnabled,
				livenessChallengeEnabled: settings.livenessChallengeEnabled ?? false,
				autoLockMinutes: settings.autoLockMinutes,
				backupReminderDays: settings.backupReminderDays
			};
			classCount = (await listClasses({ includeInactive: true })).length;
			storage = await estimateStorage();
		} finally {
			loading = false;
		}
	});

	const thresholdInfo = $derived(thresholdAssessment(form.recognitionThreshold));
	const storageWarning = $derived(storage ? storageWarningMessage(storage) : null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!isValidClock(form.defaultEntryTime)) return toasts.error('Jam masuk tidak valid.');
		if (!isValidClock(form.lateThreshold)) return toasts.error('Batas keterlambatan tidak valid.');
		saving = true;
		try {
			const next = await saveSettings(form);
			appSettings.set(next);
			toasts.success('Pengaturan disimpan.');
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan.');
		} finally {
			saving = false;
		}
	}

	async function savePin(event: SubmitEvent) {
		event.preventDefault();
		pinError = '';
		if (pinForm.next.length < 4) return (pinError = 'PIN baru minimal 4 digit.');
		if (pinForm.next !== pinForm.confirm) return (pinError = 'Konfirmasi PIN tidak cocok.');
		try {
			await changeAdminPin(pinForm.current, pinForm.next);
			pinForm = { current: '', next: '', confirm: '' };
			toasts.success('PIN berhasil diubah.');
		} catch (e) {
			pinError = e instanceof Error ? e.message : 'Gagal mengubah PIN.';
		}
	}

	async function lockNow() {
		appLock.lock();
	}

	async function enablePersistence() {
		const granted = await requestPersistentStorage();
		toasts.info(
			granted
				? 'Penyimpanan permanen diaktifkan.'
				: 'Browser tidak mengabulkan penyimpanan permanen. Aplikasi tetap berjalan normal.'
		);
		storage = await estimateStorage();
	}
</script>

<PageHeader title="Pengaturan" description="Konfigurasi aplikasi, keamanan, dan data." />

{#if loading}
	<Spinner fullPage />
{:else}
	<div class="space-y-6">
		<!-- School settings -->
		<form class="card" onsubmit={save}>
			<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Identitas Sekolah</h2>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label class="label" for="set-school">Nama Sekolah</label>
					<input id="set-school" bind:value={form.schoolName} class="input" />
				</div>
				<div>
					<label class="label" for="set-year">Tahun Ajaran</label>
					<input
						id="set-year"
						bind:value={form.academicYear}
						class="input"
						placeholder="2026/2027"
					/>
				</div>
				<div>
					<label class="label" for="set-semester">Semester</label>
					<select id="set-semester" bind:value={form.semester} class="input">
						<option value="Ganjil">Ganjil</option>
						<option value="Genap">Genap</option>
					</select>
				</div>
			</div>

			<h2 class="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">Absensi</h2>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="set-entry">Jam Masuk Default</label>
					<input id="set-entry" type="time" bind:value={form.defaultEntryTime} class="input" />
				</div>
				<div>
					<label class="label" for="set-late">Batas Keterlambatan</label>
					<input id="set-late" type="time" bind:value={form.lateThreshold} class="input" />
				</div>
			</div>

			<h2 class="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">
				Pengenalan Wajah
			</h2>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="set-threshold">
						Ambang Batas Pengenalan ({form.recognitionThreshold.toFixed(2)})
					</label>
					<input
						id="set-threshold"
						type="range"
						min="0.3"
						max="0.8"
						step="0.01"
						bind:value={form.recognitionThreshold}
						class="w-full"
					/>
					<p
						class="mt-1 text-xs {thresholdInfo.level === 'permissive'
							? 'text-red-600'
							: 'text-slate-500'}"
					>
						{thresholdInfo.message}
					</p>
				</div>
				<div>
					<label class="label" for="set-margin">
						Margin Kejelasan ({form.recognitionMargin.toFixed(2)})
					</label>
					<input
						id="set-margin"
						type="range"
						min="0.02"
						max="0.2"
						step="0.01"
						bind:value={form.recognitionMargin}
						class="w-full"
					/>
					<p class="mt-1 text-xs text-slate-500">
						Selisih minimum antara kandidat terbaik dan kedua untuk menghindari salah kenal.
					</p>
				</div>
			</div>
			<label class="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
				<input type="checkbox" bind:checked={form.livenessEnabled} class="rounded" />
				Aktifkan Liveness (anti-spoof) — disarankan untuk produksi
			</label>
			<label class="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
				<input
					type="checkbox"
					bind:checked={form.livenessChallengeEnabled}
					class="rounded"
					disabled={!form.livenessEnabled}
				/>
				Wajibkan gerakan (berkedip) sebelum absensi diterima — lebih kuat, sedikit lebih lambat
			</label>

			<h2 class="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">
				Keamanan & Lainnya
			</h2>
			<div class="mt-3 grid gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="set-lock">Auto Lock (menit, 0 = nonaktif)</label>
					<input
						id="set-lock"
						type="number"
						min="0"
						max="120"
						bind:value={form.autoLockMinutes}
						class="input"
					/>
				</div>
				<div>
					<label class="label" for="set-backup">Pengingat Backup (hari)</label>
					<input
						id="set-backup"
						type="number"
						min="1"
						max="90"
						bind:value={form.backupReminderDays}
						class="input"
					/>
				</div>
			</div>

			<div class="mt-5 flex justify-end">
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}
				</button>
			</div>
		</form>

		<!-- Camera -->
		<CameraSettings />

		<!-- Security -->
		<div class="card">
			<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">PIN Administrator</h2>
			<form class="mt-3 grid gap-3 sm:grid-cols-3" onsubmit={savePin}>
				<div>
					<label class="label" for="pin-cur">PIN Lama</label>
					<input
						id="pin-cur"
						type="password"
						inputmode="numeric"
						bind:value={pinForm.current}
						class="input"
					/>
				</div>
				<div>
					<label class="label" for="pin-new">PIN Baru</label>
					<input
						id="pin-new"
						type="password"
						inputmode="numeric"
						bind:value={pinForm.next}
						class="input"
					/>
				</div>
				<div>
					<label class="label" for="pin-conf">Konfirmasi</label>
					<input
						id="pin-conf"
						type="password"
						inputmode="numeric"
						bind:value={pinForm.confirm}
						class="input"
					/>
				</div>
				{#if pinError}
					<p class="text-sm text-red-600 sm:col-span-3" role="alert">{pinError}</p>
				{/if}
				<div class="flex items-end gap-2 sm:col-span-3">
					<button type="submit" class="btn-secondary">Ubah PIN</button>
					<button type="button" class="btn-secondary" onclick={lockNow}>Kunci Sekarang</button>
				</div>
			</form>
			<p class="mt-2 text-xs text-slate-500">
				PIN disimpan sebagai hash PBKDF2 dan tidak pernah dikirim ke server.
			</p>
		</div>

		<!-- Storage -->
		{#if storage?.supported}
			<div class="card">
				<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Penyimpanan</h2>
				<div class="mt-3 grid gap-3 sm:grid-cols-3">
					<div>
						<p class="text-xs text-slate-500">Terpakai</p>
						<p class="text-lg font-semibold">{formatBytes(storage.usage)}</p>
					</div>
					<div>
						<p class="text-xs text-slate-500">Perkiraan tersedia</p>
						<p class="text-lg font-semibold">{formatBytes(storage.quota)}</p>
					</div>
					<div>
						<p class="text-xs text-slate-500">Status permanen</p>
						<p class="text-lg font-semibold">
							{storage.persisted === true ? 'Ya' : storage.persisted === false ? 'Tidak' : '-'}
						</p>
					</div>
				</div>
				{#if storageWarning}
					<p class="mt-2 text-sm text-amber-700 dark:text-amber-300" role="alert">
						{storageWarning}
					</p>
				{/if}
				{#if !storage.persisted}
					<button class="btn-secondary mt-3" onclick={enablePersistence}>
						Minta Penyimpanan Permanen
					</button>
					<p class="mt-1 text-xs text-slate-500">
						Browser dapat menolak permintaan ini. Aplikasi tetap berfungsi tanpa status permanen.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Backup & Restore -->
		<BackupPanel />

		<!-- Reset -->
		<ResetPanel {classCount} />
	</div>
{/if}
