<script lang="ts">
	import { createStudent, type StudentInput } from '$lib/db/students';
	import { listClasses } from '$lib/db/classes';
	import type { ImportRow } from '$lib/students/import';
	import { importSummary } from '$lib/students/import';
	import { toasts } from '$lib/stores/toast.svelte';
	import Modal from './Modal.svelte';
	import { sanitizeSpreadsheetCell } from '$lib/utils/sanitize';

	interface Props {
		open: boolean;
		rows: ImportRow[];
		onclose: () => void;
		onimported: () => void;
	}

	let { open, rows, onclose, onimported }: Props = $props();

	let importing = $state(false);
	let progress = $state(0);

	const summary = $derived(importSummary(rows));
	const validRows = $derived(rows.filter((r) => r.errors.length === 0));
	const invalidRows = $derived(rows.filter((r) => r.errors.length > 0));

	async function confirmImport() {
		importing = true;
		progress = 0;
		let success = 0;
		let failed = 0;
		try {
			const classes = await listClasses();
			const classMap = new Map(classes.map((c) => [c.id, c]));
			for (const row of validRows) {
				// Guard: re-resolve class id at import time (the list may have changed).
				if (!row.classId || !classMap.has(row.classId)) {
					failed++;
					continue;
				}
				const input: StudentInput = {
					nis: row.nis,
					nisn: row.nisn || undefined,
					name: row.name,
					classId: row.classId,
					gender: row.gender || undefined
				};
				try {
					await createStudent(input);
					success++;
				} catch {
					failed++;
				}
				progress = Math.round(((success + failed) / validRows.length) * 100);
			}
			if (success > 0) toasts.success(`${success} siswa berhasil diimpor.`);
			if (failed > 0) toasts.warning(`${failed} siswa gagal diimpor (kemungkinan NIS duplikat).`);
			onimported();
			onclose();
		} finally {
			importing = false;
		}
	}
</script>

<Modal
	{open}
	title="Pratinjau Impor Siswa"
	description="Periksa data berikut sebelum menyimpan. Baris dengan error tidak akan diimpor."
	{onclose}
	size="lg"
>
	<div class="mb-4 grid grid-cols-3 gap-3 text-center">
		<div class="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
			<p class="text-lg font-bold">{summary.total}</p>
			<p class="text-xs text-slate-500">Total</p>
		</div>
		<div class="rounded-lg bg-brand-50 p-2 dark:bg-brand-900/30">
			<p class="text-lg font-bold text-brand-700 dark:text-brand-300">{summary.valid}</p>
			<p class="text-xs text-slate-500">Valid</p>
		</div>
		<div class="rounded-lg bg-red-50 p-2 dark:bg-red-900/30">
			<p class="text-lg font-bold text-red-700 dark:text-red-300">{summary.invalid}</p>
			<p class="text-xs text-slate-500">Error</p>
		</div>
	</div>

	<div class="-mx-5 max-h-72 overflow-auto px-5">
		<table class="w-full min-w-[560px] text-sm">
			<thead class="sticky top-0 bg-white dark:bg-slate-900">
				<tr
					class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
				>
					<th class="py-2">Baris</th>
					<th class="py-2">NIS</th>
					<th class="py-2">Nama</th>
					<th class="py-2">Kelas</th>
					<th class="py-2">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.rowNumber)}
					<tr
						class="border-b border-slate-100 dark:border-slate-800 {row.errors.length > 0
							? 'bg-red-50/50 dark:bg-red-900/10'
							: ''}"
					>
						<td class="py-2 text-slate-400">{row.rowNumber}</td>
						<td class="py-2">{sanitizeSpreadsheetCell(row.nis)}</td>
						<td class="py-2">{sanitizeSpreadsheetCell(row.name)}</td>
						<td class="py-2">{sanitizeSpreadsheetCell(row.className)}</td>
						<td class="py-2">
							{#if row.errors.length === 0}
								<span
									class="badge bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
									>OK</span
								>
							{:else}
								<span class="text-xs text-red-600">{row.errors.join(' ')}</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if importing}
		<div class="mt-4">
			<div class="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
				<div class="h-full bg-brand-600 transition-all" style="width: {progress}%"></div>
			</div>
			<p class="mt-1 text-center text-xs text-slate-500">Mengimpor… {progress}%</p>
		</div>
	{/if}

	{#snippet footer()}
		<button class="btn-secondary" onclick={onclose} disabled={importing}>Batal</button>
		<button class="btn-primary" onclick={confirmImport} disabled={importing || summary.valid === 0}>
			{importing ? 'Mengimpor…' : `Impor ${summary.valid} Siswa`}
		</button>
	{/snippet}
</Modal>

{#if invalidRows.length > 0}
	<p class="sr-only">{invalidRows.length} baris memiliki error dan dilewati.</p>
{/if}
