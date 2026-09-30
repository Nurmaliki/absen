<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import {
		backupFilename,
		createBackup,
		decryptAndValidateBackup,
		parseBackupFile,
		type BackupFileV1,
		type DecryptResult
	} from '$lib/backup/backup';
	import { restoreBackup } from '$lib/backup/restore';
	import { downloadBlob } from '$lib/reports/share';
	import { toasts } from '$lib/stores/toast.svelte';

	let showBackup = $state(false);
	let backupPassword = $state('');
	let backupConfirm = $state('');
	let backupBusy = $state(false);
	let backupError = $state('');

	let showRestore = $state(false);
	let restoreFile = $state<File | null>(null);
	let restorePassword = $state('');
	let restoreBusy = $state(false);
	let restoreError = $state('');
	let restorePreview = $state<DecryptResult | null>(null);

	async function doBackup() {
		backupError = '';
		if (backupPassword.length < 6) return (backupError = 'Password minimal 6 karakter.');
		if (backupPassword !== backupConfirm) return (backupError = 'Konfirmasi password tidak cocok.');
		backupBusy = true;
		try {
			const { blob } = await createBackup(backupPassword);
			downloadBlob(blob, backupFilename());
			toasts.success('Backup terenkripsi berhasil dibuat. Simpan file dengan aman.');
			showBackup = false;
			backupPassword = '';
			backupConfirm = '';
		} catch (e) {
			backupError = e instanceof Error ? e.message : 'Gagal membuat backup.';
		} finally {
			backupBusy = false;
		}
	}

	function pickRestoreFile(event: Event) {
		const input = event.target as HTMLInputElement;
		restoreFile = input.files?.[0] ?? null;
		restorePreview = null;
		restoreError = '';
	}

	async function validateRestore() {
		restoreError = '';
		restorePreview = null;
		if (!restoreFile) return (restoreError = 'Pilih file backup terlebih dahulu.');
		if (!restorePassword) return (restoreError = 'Masukkan password backup.');
		restoreBusy = true;
		try {
			const text = await restoreFile.text();
			const parsed: BackupFileV1 = parseBackupFile(text);
			restorePreview = await decryptAndValidateBackup(parsed, restorePassword);
			toasts.success('Backup valid. Periksa pratinjau sebelum memulihkan.');
		} catch (e) {
			restoreError = e instanceof Error ? e.message : 'Backup tidak valid.';
		} finally {
			restoreBusy = false;
		}
	}

	async function applyRestore() {
		if (!restorePreview) return;
		restoreBusy = true;
		try {
			await restoreBackup(restorePreview.data);
			toasts.success('Data berhasil dipulihkan. Memuat ulang…');
			setTimeout(() => window.location.reload(), 900);
		} catch (e) {
			restoreError = e instanceof Error ? e.message : 'Gagal memulihkan data.';
			restoreBusy = false;
		}
	}
</script>

<div class="card">
	<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Backup & Restore</h2>
	<p class="mt-1 text-xs text-slate-500">
		Backup bersifat terenkripsi (AES-GCM). Password backup tidak disimpan di dalam file — simpan
		dengan aman karena tidak dapat dipulihkan.
	</p>
	<div class="mt-3 flex flex-wrap gap-2">
		<button class="btn-primary" onclick={() => (showBackup = true)}>Buat Backup</button>
		<button class="btn-secondary" onclick={() => (showRestore = true)}>Pulihkan dari Backup</button>
	</div>
</div>

<Modal open={showBackup} title="Buat Backup" onclose={() => (showBackup = false)}>
	<p class="text-sm text-slate-600 dark:text-slate-300">
		Buat password untuk mengenkripsi file backup. Anda akan memerlukannya untuk memulihkan data.
	</p>
	<div class="mt-4 space-y-3">
		<div>
			<label class="label" for="bk-pass">Password Backup</label>
			<input
				id="bk-pass"
				type="password"
				bind:value={backupPassword}
				class="input"
				autocomplete="new-password"
			/>
		</div>
		<div>
			<label class="label" for="bk-conf">Konfirmasi Password</label>
			<input
				id="bk-conf"
				type="password"
				bind:value={backupConfirm}
				class="input"
				autocomplete="new-password"
			/>
		</div>
		{#if backupError}
			<p class="text-sm text-red-600" role="alert">{backupError}</p>
		{/if}
	</div>
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (showBackup = false)}>Batal</button>
		<button class="btn-primary" onclick={doBackup} disabled={backupBusy}>
			{backupBusy ? 'Membuat…' : 'Buat Backup'}
		</button>
	{/snippet}
</Modal>

<Modal
	open={showRestore}
	title="Pulihkan dari Backup"
	onclose={() => (showRestore = false)}
	size="lg"
>
	<div class="space-y-3">
		<div>
			<label class="label" for="rs-file">File Backup (.enc)</label>
			<input
				id="rs-file"
				type="file"
				accept=".enc,.json,application/json"
				onchange={pickRestoreFile}
				class="input"
			/>
		</div>
		<div>
			<label class="label" for="rs-pass">Password Backup</label>
			<input
				id="rs-pass"
				type="password"
				bind:value={restorePassword}
				class="input"
				autocomplete="current-password"
			/>
		</div>
		{#if restoreError}
			<p class="text-sm text-red-600" role="alert">{restoreError}</p>
		{/if}

		{#if restorePreview}
			<div class="rounded-lg bg-brand-50 p-3 dark:bg-brand-900/20">
				<p class="text-sm font-medium text-brand-800 dark:text-brand-200">
					Backup valid — pratinjau data:
				</p>
				<ul class="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-600 dark:text-slate-300">
					<li>Kelas: {restorePreview.preview.counts.classes}</li>
					<li>Siswa: {restorePreview.preview.counts.students}</li>
					<li>Data wajah: {restorePreview.preview.counts.faceTemplates}</li>
					<li>Sesi: {restorePreview.preview.counts.attendanceSessions}</li>
					<li>Catatan absensi: {restorePreview.preview.counts.attendanceRecords}</li>
					<li>Log audit: {restorePreview.preview.counts.auditLogs}</li>
				</ul>
				{#if restorePreview.preview.counts.orphanStudents > 0 || restorePreview.preview.counts.orphanRecords > 0}
					<p class="mt-2 text-xs text-amber-700 dark:text-amber-300">
						Peringatan: {restorePreview.preview.counts.orphanStudents} siswa tanpa kelas,
						{restorePreview.preview.counts.orphanRecords} catatan tanpa sesi. Data akan tetap diimpor.
					</p>
				{/if}
				<p class="mt-2 text-xs text-red-600">
					Memulihkan akan <strong>menggantikan seluruh data saat ini</strong>. Anda akan ditawari
					backup terlebih dahulu.
				</p>
			</div>
		{/if}
	</div>
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (showRestore = false)} disabled={restoreBusy}
			>Batal</button
		>
		{#if restorePreview}
			<button class="btn-danger" onclick={applyRestore} disabled={restoreBusy}>
				{restoreBusy ? 'Memulihkan…' : 'Pulihkan Sekarang'}
			</button>
		{:else}
			<button class="btn-primary" onclick={validateRestore} disabled={restoreBusy}>
				{restoreBusy ? 'Memeriksa…' : 'Validasi Backup'}
			</button>
		{/if}
	{/snippet}
</Modal>
