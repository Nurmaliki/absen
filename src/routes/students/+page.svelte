<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ImportPreviewDialog from '$lib/components/ImportPreviewDialog.svelte';
	import {
		createStudent,
		deleteStudent,
		listStudents,
		setStudentActive,
		updateStudent
	} from '$lib/db/students';
	import { listClasses, getClass } from '$lib/db/classes';
	import type { SchoolClass, Student } from '$lib/types';
	import {
		parseStudentFile,
		validateAgainstDatabase,
		type ImportRow,
		buildImportTemplate
	} from '$lib/students/import';
	import { workbookToBlob } from '$lib/reports/xlsx';
	import { downloadBlob } from '$lib/reports/share';
	import { toasts } from '$lib/stores/toast.svelte';
	import { describeStorageError } from '$lib/db/errors';
	import { matchesQuery } from '$lib/utils/id';

	let students = $state<Student[]>([]);
	let classes = $state<SchoolClass[]>([]);
	let classMap = $state(new Map<string, string>());
	let loading = $state(true);
	let search = $state('');
	let classFilter = $state('');
	let showInactive = $state(false);

	let showForm = $state(false);
	let editing = $state<Student | null>(null);
	let form = $state({ nis: '', nisn: '', name: '', classId: '', gender: '' });
	let saving = $state(false);
	let formError = $state('');

	let confirmDelete = $state<Student | null>(null);
	let importRows = $state<ImportRow[]>([]);
	let showImport = $state(false);
	let importError = $state('');

	async function refresh() {
		students = await listStudents({
			classId: classFilter || undefined,
			includeInactive: showInactive
		});
	}

	onMount(async () => {
		if (!browser) return;
		try {
			classes = await listClasses({ includeInactive: true });
			classMap = new Map(classes.map((c) => [c.id, c.name]));
			await refresh();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal memuat siswa.');
		} finally {
			loading = false;
		}
	});

	const filtered = $derived(
		students.filter((s) => matchesQuery(s.name, search) || matchesQuery(s.nis, search))
	);

	function openCreate() {
		editing = null;
		formError = '';
		form = { nis: '', nisn: '', name: '', classId: classes[0]?.id ?? '', gender: '' };
		showForm = true;
	}

	function openEdit(student: Student) {
		editing = student;
		formError = '';
		form = {
			nis: student.nis,
			nisn: student.nisn ?? '',
			name: student.name,
			classId: student.classId,
			gender: student.gender ?? ''
		};
		showForm = true;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		formError = '';
		if (!form.nis.trim()) return (formError = 'NIS wajib diisi.');
		if (!form.name.trim()) return (formError = 'Nama wajib diisi.');
		if (!form.classId) return (formError = 'Kelas wajib dipilih.');
		saving = true;
		try {
			const payload = {
				nis: form.nis,
				nisn: form.nisn,
				name: form.name,
				classId: form.classId,
				gender: form.gender
			};
			if (editing) {
				await updateStudent(editing.id, payload);
				toasts.success('Data siswa diperbarui.');
			} else {
				await createStudent(payload);
				toasts.success('Siswa ditambahkan.');
			}
			showForm = false;
			await refresh();
		} catch (e) {
			const { message, action } = describeStorageError(e);
			formError = action ? `${message} ${action}` : message;
		} finally {
			saving = false;
		}
	}

	async function toggleActive(student: Student) {
		await setStudentActive(student.id, !student.active);
		toasts.info(student.active ? 'Siswa dinonaktifkan.' : 'Siswa diaktifkan.');
		await refresh();
	}

	async function confirmRemove() {
		if (!confirmDelete) return;
		try {
			await deleteStudent(confirmDelete.id);
			toasts.success('Siswa dihapus.');
			confirmDelete = null;
			await refresh();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menghapus siswa.');
		}
	}

	async function handleFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importError = '';
		try {
			const parsed = await parseStudentFile(file);
			if (parsed.errors.length > 0) {
				importError = parsed.errors.join(' ');
				input.value = '';
				return;
			}
			const existing = await listStudents({ includeInactive: true });
			importRows = validateAgainstDatabase(parsed.rows, existing, classes);
			showImport = true;
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Gagal membaca file.';
		} finally {
			input.value = '';
		}
	}

	function downloadTemplate() {
		downloadBlob(workbookToBlob(buildImportTemplate()), 'template-import-siswa.xlsx');
	}
</script>

<PageHeader title="Master Siswa" description="Kelola data siswa dan registrasi wajah.">
	<button class="btn-secondary" onclick={downloadTemplate}>Template Impor</button>
	<label class="btn-secondary cursor-pointer">
		Impor XLSX/CSV
		<input type="file" accept=".xlsx,.xls,.csv" class="sr-only" onchange={handleFile} />
	</label>
	<button class="btn-primary" onclick={openCreate} disabled={classes.length === 0}
		>+ Tambah Siswa</button
	>
</PageHeader>

{#if importError}
	<div
		class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
		role="alert"
	>
		{importError}
	</div>
{/if}

<div class="mb-4 flex flex-wrap items-center gap-3">
	<input
		type="search"
		bind:value={search}
		class="input max-w-xs"
		placeholder="Cari nama atau NIS…"
		aria-label="Cari siswa"
	/>
	<select
		bind:value={classFilter}
		onchange={refresh}
		class="input max-w-[10rem]"
		aria-label="Filter kelas"
	>
		<option value="">Semua Kelas</option>
		{#each classes as cls (cls.id)}
			<option value={cls.id}>{cls.name}</option>
		{/each}
	</select>
	<label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
		<input type="checkbox" bind:checked={showInactive} onchange={refresh} class="rounded" />
		Tampilkan nonaktif
	</label>
</div>

{#if loading}
	<Spinner />
{:else if classes.length === 0}
	<EmptyState
		icon="🏫"
		title="Belum ada kelas"
		description="Buat kelas terlebih dahulu sebelum menambahkan siswa."
	>
		<a href="/classes" class="btn-primary">Buat Kelas</a>
	</EmptyState>
{:else if filtered.length === 0}
	<EmptyState
		icon="👥"
		title={students.length === 0 ? 'Belum ada siswa' : 'Tidak ada hasil'}
		description={students.length === 0
			? 'Tambahkan siswa secara manual atau impor dari file.'
			: 'Coba ubah pencarian atau filter.'}
	>
		{#if students.length === 0}
			<button class="btn-primary" onclick={openCreate}>Tambah Siswa</button>
		{/if}
	</EmptyState>
{:else}
	<div class="card -mx-4 overflow-x-auto px-0 sm:mx-0">
		<table class="w-full min-w-[720px] text-sm">
			<thead>
				<tr
					class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
				>
					<th class="px-4 py-3 font-medium">NIS</th>
					<th class="px-4 py-3 font-medium">NISN</th>
					<th class="px-4 py-3 font-medium">Nama</th>
					<th class="px-4 py-3 font-medium">Kelas</th>
					<th class="px-4 py-3 text-center font-medium">Status</th>
					<th class="px-4 py-3 text-center font-medium">Wajah</th>
					<th class="px-4 py-3 text-right font-medium">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as student (student.id)}
					<tr
						class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
					>
						<td class="px-4 py-3 tabular-nums">{student.nis}</td>
						<td class="px-4 py-3 tabular-nums text-slate-500">{student.nisn || '-'}</td>
						<td class="px-4 py-3 font-medium">{student.name}</td>
						<td class="px-4 py-3">{classMap.get(student.classId) ?? '-'}</td>
						<td class="px-4 py-3 text-center">
							<span
								class="badge {student.active
									? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
									: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
							>
								{student.active ? 'Aktif' : 'Nonaktif'}
							</span>
						</td>
						<td class="px-4 py-3 text-center">
							{#if student.faceRegistered}
								<span
									class="badge bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
									>Terdaftar</span
								>
							{:else}
								<span
									class="badge bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
									>Belum</span
								>
							{/if}
						</td>
						<td class="px-4 py-3 text-right whitespace-nowrap text-xs">
							<a
								href="/students/{student.id}/face"
								class="text-brand-600 hover:underline"
								aria-label={`Registrasi wajah ${student.name}`}
							>
								{student.faceRegistered ? 'Daftar Ulang' : 'Daftar Wajah'}
							</a>
							<span class="mx-1 text-slate-300">|</span>
							<button class="text-brand-600 hover:underline" onclick={() => openEdit(student)}
								>Ubah</button
							>
							<span class="mx-1 text-slate-300">|</span>
							<button class="text-amber-600 hover:underline" onclick={() => toggleActive(student)}>
								{student.active ? 'Nonaktif' : 'Aktifkan'}
							</button>
							<span class="mx-1 text-slate-300">|</span>
							<button class="text-red-600 hover:underline" onclick={() => (confirmDelete = student)}
								>Hapus</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Modal
	open={showForm}
	title={editing ? 'Ubah Siswa' : 'Tambah Siswa'}
	onclose={() => (showForm = false)}
>
	<form onsubmit={save} class="space-y-4">
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="label" for="s-nis">NIS</label>
				<input id="s-nis" bind:value={form.nis} class="input" required />
			</div>
			<div>
				<label class="label" for="s-nisn">NISN (opsional)</label>
				<input id="s-nisn" bind:value={form.nisn} class="input" />
			</div>
		</div>
		<div>
			<label class="label" for="s-name">Nama Lengkap</label>
			<input id="s-name" bind:value={form.name} class="input" required />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="label" for="s-class">Kelas</label>
				<select id="s-class" bind:value={form.classId} class="input" required>
					<option value="">Pilih kelas</option>
					{#each classes as cls (cls.id)}
						<option value={cls.id}>{cls.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="label" for="s-gender">Jenis Kelamin</label>
				<select id="s-gender" bind:value={form.gender} class="input">
					<option value="">-</option>
					<option value="L">Laki-laki</option>
					<option value="P">Perempuan</option>
				</select>
			</div>
		</div>
		{#if formError}
			<p class="text-sm text-red-600" role="alert">{formError}</p>
		{/if}
		<div class="flex justify-end gap-2 pt-2">
			<button type="button" class="btn-secondary" onclick={() => (showForm = false)}>Batal</button>
			<button type="submit" class="btn-primary" disabled={saving}>
				{saving ? 'Menyimpan…' : 'Simpan'}
			</button>
		</div>
	</form>
</Modal>

<Modal
	open={!!confirmDelete}
	title="Hapus Siswa"
	description="Menghapus siswa juga menghapus data wajah dan tidak dapat dibatalkan."
	onclose={() => (confirmDelete = null)}
	size="sm"
>
	<p class="text-sm text-slate-600 dark:text-slate-300">
		Hapus <strong>{confirmDelete?.name}</strong> (NIS {confirmDelete?.nis})?
	</p>
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (confirmDelete = null)}>Batal</button>
		<button class="btn-danger" onclick={confirmRemove}>Hapus</button>
	{/snippet}
</Modal>

<ImportPreviewDialog
	open={showImport}
	rows={importRows}
	onclose={() => (showImport = false)}
	onimported={refresh}
/>
