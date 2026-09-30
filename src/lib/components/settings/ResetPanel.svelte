<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { createBackup, backupFilename } from '$lib/backup/backup';
	import { resetAllData } from '$lib/backup/restore';
	import { downloadBlob } from '$lib/reports/share';
	import { toasts } from '$lib/stores/toast.svelte';

	interface Props {
		classCount: number;
	}

	let { classCount }: Props = $props();

	let showReset = $state(false);
	let confirmText = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state('');
	let wantBackupFirst = $state(true);

	const CONFIRM_WORD = 'HAPUS';

	async function doReset() {
		error = '';
		if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) {
			error = `Ketik "${CONFIRM_WORD}" untuk mengonfirmasi.`;
			return;
		}
		busy = true;
		try {
			if (wantBackupFirst) {
				if (password.length < 6) {
					error = 'Password backup minimal 6 karakter, atau matikan opsi backup.';
					busy = false;
					return;
				}
				const { blob } = await createBackup(password);
				downloadBlob(blob, backupFilename());
				toasts.info('Backup dibuat. Melanjutkan penghapusan…');
			}
			await resetAllData();
			toasts.success('Semua data telah dihapus.');
			setTimeout(() => window.location.reload(), 800);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal menghapus data.';
			busy = false;
		}
	}
</script>

<div class="card border-red-200 dark:border-red-900/50">
	<h2 class="text-sm font-semibold text-red-700 dark:text-red-300">Hapus Semua Data</h2>
	<p class="mt-1 text-xs text-slate-500">
		Menghapus seluruh kelas, siswa, data wajah, absensi, dan pengaturan dari perangkat ini. Tindakan
		ini tidak dapat dibatalkan.
	</p>
	<button class="btn-danger mt-3" onclick={() => (showReset = true)}>Hapus Semua Data</button>
</div>

<Modal open={showReset} title="Konfirmasi Hapus Semua Data" onclose={() => (showReset = false)}>
	<div class="space-y-3">
		<p class="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
			Anda akan menghapus <strong>{classCount} kelas</strong> beserta seluruh siswa, wajah, dan riwayat
			absensinya. Tindakan ini permanen.
		</p>

		<label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
			<input type="checkbox" bind:checked={wantBackupFirst} class="rounded" />
			Buat backup sebelum menghapus (disarankan)
		</label>

		{#if wantBackupFirst}
			<div>
				<label class="label" for="rm-pass">Password Backup</label>
				<input
					id="rm-pass"
					type="password"
					bind:value={password}
					class="input"
					autocomplete="new-password"
				/>
			</div>
		{/if}

		<div>
			<label class="label" for="rm-word">
				Ketik <strong>{CONFIRM_WORD}</strong> untuk mengonfirmasi
			</label>
			<input id="rm-word" bind:value={confirmText} class="input" placeholder={CONFIRM_WORD} />
		</div>

		{#if error}
			<p class="text-sm text-red-600" role="alert">{error}</p>
		{/if}
	</div>
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (showReset = false)} disabled={busy}>Batal</button>
		<button
			class="btn-danger"
			onclick={doReset}
			disabled={busy || confirmText.trim().toUpperCase() !== CONFIRM_WORD}
		>
			{busy ? 'Menghapus…' : 'Hapus Permanen'}
		</button>
	{/snippet}
</Modal>
