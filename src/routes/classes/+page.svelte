<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import {
		createClass,
		listClassesWithStats,
		setClassActive,
		updateClass,
		type ClassWithStats
	} from '$lib/db/classes';
	import { getSettings } from '$lib/db/settings';
	import { toasts } from '$lib/stores/toast.svelte';
	import { matchesQuery } from '$lib/utils/id';

	let classes = $state<ClassWithStats[]>([]);
	let loading = $state(true);
	let search = $state('');
	let showInactive = $state(false);
	let showForm = $state(false);
	let editing = $state<ClassWithStats | null>(null);
	let saving = $state(false);
	let formError = $state('');
	let confirmTarget = $state<ClassWithStats | null>(null);

	let form = $state({ name: '', grade: '', academicYear: '', semester: 'Ganjil' });

	async function refresh() {
		classes = await listClassesWithStats({ includeInactive: showInactive });
	}

	onMount(async () => {
		if (!browser) return;
		try {
			const settings = await getSettings();
			form.academicYear = settings.academicYear;
			form.semester = settings.semester;
			await refresh();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal memuat kelas.');
		} finally {
			loading = false;
		}
	});

	const filtered = $derived(
		classes.filter((c) => matchesQuery(c.name, search) || matchesQuery(c.grade, search))
	);

	function openCreate() {
		editing = null;
		formError = '';
		form = { name: '', grade: '', academicYear: form.academicYear, semester: form.semester };
		showForm = true;
	}

	function openEdit(cls: ClassWithStats) {
		editing = cls;
		formError = '';
		form = {
			name: cls.name,
			grade: cls.grade,
			academicYear: cls.academicYear,
			semester: cls.semester
		};
		showForm = true;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		formError = '';
		if (!form.name.trim()) {
			formError = 'Nama kelas wajib diisi.';
			return;
		}
		saving = true;
		try {
			if (editing) {
				await updateClass(editing.id, form);
				toasts.success('Kelas diperbarui.');
			} else {
				await createClass(form);
				toasts.success('Kelas ditambahkan.');
			}
			showForm = false;
			await refresh();
		} catch (e) {
			formError = e instanceof Error ? e.message : 'Gagal menyimpan kelas.';
		} finally {
			saving = false;
		}
	}

	async function toggleActive(cls: ClassWithStats) {
		if (cls.active) {
			confirmTarget = cls;
			return;
		}
		await setClassActive(cls.id, true);
		toasts.success(`Kelas ${cls.name} diaktifkan.`);
		await refresh();
	}

	async function confirmDeactivate() {
		if (!confirmTarget) return;
		await setClassActive(confirmTarget.id, false);
		toasts.info(`Kelas ${confirmTarget.name} dinonaktifkan.`);
		confirmTarget = null;
		await refresh();
	}
</script>

<PageHeader title="Master Kelas" description="Kelola kelas, tahun ajaran, dan semester.">
	<button class="btn-primary" onclick={openCreate}>+ Tambah Kelas</button>
</PageHeader>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<input
		type="search"
		bind:value={search}
		class="input max-w-xs"
		placeholder="Cari kelas atau tingkat…"
		aria-label="Cari kelas"
	/>
	<label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
		<input type="checkbox" bind:checked={showInactive} onchange={refresh} class="rounded" />
		Tampilkan kelas nonaktif
	</label>
</div>

{#if loading}
	<Spinner />
{:else if filtered.length === 0}
	<EmptyState
		icon="🏫"
		title={classes.length === 0 ? 'Belum ada kelas' : 'Tidak ada hasil'}
		description={classes.length === 0
			? 'Tambahkan kelas untuk mulai mendaftarkan siswa.'
			: 'Coba ubah kata pencarian Anda.'}
	>
		{#if classes.length === 0}
			<button class="btn-primary" onclick={openCreate}>Tambah Kelas</button>
		{/if}
	</EmptyState>
{:else}
	<div class="card -mx-4 overflow-x-auto px-0 sm:mx-0">
		<table class="w-full min-w-[640px] text-sm">
			<thead>
				<tr
					class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
				>
					<th class="px-4 py-3 font-medium">Kelas</th>
					<th class="px-4 py-3 font-medium">Tingkat</th>
					<th class="px-4 py-3 font-medium">Tahun Ajaran</th>
					<th class="px-4 py-3 font-medium">Semester</th>
					<th class="px-4 py-3 text-center font-medium">Siswa</th>
					<th class="px-4 py-3 text-center font-medium">Wajah</th>
					<th class="px-4 py-3 text-center font-medium">Status</th>
					<th class="px-4 py-3 text-right font-medium">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as cls (cls.id)}
					<tr
						class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
					>
						<td class="px-4 py-3 font-medium">{cls.name}</td>
						<td class="px-4 py-3">{cls.grade || '-'}</td>
						<td class="px-4 py-3">{cls.academicYear}</td>
						<td class="px-4 py-3">{cls.semester}</td>
						<td class="px-4 py-3 text-center tabular-nums">{cls.studentCount}</td>
						<td class="px-4 py-3 text-center tabular-nums">
							<span
								class={cls.faceRegisteredCount < cls.studentCount
									? 'text-amber-600'
									: 'text-brand-600'}>{cls.faceRegisteredCount}</span
							>
						</td>
						<td class="px-4 py-3 text-center">
							<span
								class="badge {cls.active
									? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
									: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}"
							>
								{cls.active ? 'Aktif' : 'Nonaktif'}
							</span>
						</td>
						<td class="px-4 py-3 text-right whitespace-nowrap">
							<button
								class="text-brand-600 hover:underline"
								onclick={() => openEdit(cls)}
								aria-label={`Ubah kelas ${cls.name}`}>Ubah</button
							>
							<span class="mx-1 text-slate-300">|</span>
							<button
								class={cls.active
									? 'text-amber-600 hover:underline'
									: 'text-brand-600 hover:underline'}
								onclick={() => toggleActive(cls)}
							>
								{cls.active ? 'Nonaktifkan' : 'Aktifkan'}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Modal
	open={showForm}
	title={editing ? 'Ubah Kelas' : 'Tambah Kelas'}
	onclose={() => (showForm = false)}
>
	<form onsubmit={save} class="space-y-4">
		<div>
			<label class="label" for="class-name">Nama Kelas</label>
			<input
				id="class-name"
				bind:value={form.name}
				class="input"
				placeholder="contoh: 7A"
				required
			/>
		</div>
		<div>
			<label class="label" for="class-grade">Tingkat</label>
			<input id="class-grade" bind:value={form.grade} class="input" placeholder="contoh: 7" />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="label" for="class-year">Tahun Ajaran</label>
				<input
					id="class-year"
					bind:value={form.academicYear}
					class="input"
					placeholder="2026/2027"
				/>
			</div>
			<div>
				<label class="label" for="class-semester">Semester</label>
				<select id="class-semester" bind:value={form.semester} class="input">
					<option value="Ganjil">Ganjil</option>
					<option value="Genap">Genap</option>
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
	open={!!confirmTarget}
	title="Nonaktifkan Kelas"
	description="Kelas nonaktif tidak akan muncul saat memilih kelas untuk absensi, tetapi data historisnya tetap tersimpan."
	onclose={() => (confirmTarget = null)}
	size="sm"
>
	<p class="text-sm text-slate-600 dark:text-slate-300">
		Nonaktifkan kelas <strong>{confirmTarget?.name}</strong>?
	</p>
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (confirmTarget = null)}>Batal</button>
		<button class="btn-danger" onclick={confirmDeactivate}>Nonaktifkan</button>
	{/snippet}
</Modal>
