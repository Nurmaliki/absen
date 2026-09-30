<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { listClasses } from '$lib/db/classes';
	import { listStudents } from '$lib/db/students';
	import {
		listSessions,
		queryRecords,
		correctAttendance,
		deleteAttendance
	} from '$lib/db/attendance';
	import { STATUS_LABELS, STATUS_ORDER, MANUAL_STATUSES } from '$lib/attendance/rules';
	import { toasts } from '$lib/stores/toast.svelte';
	import { matchesQuery } from '$lib/utils/id';
	import { formatTime } from '$lib/utils/time';
	import type { AttendanceRecord, AttendanceStatus, SchoolClass, Student } from '$lib/types';

	interface HistoryRow {
		record: AttendanceRecord;
		date: string;
		className: string;
		student: Student;
	}

	let classes = $state<SchoolClass[]>([]);
	let students = $state<Student[]>([]);
	let rows = $state<HistoryRow[]>([]);
	let loading = $state(true);

	// Filters
	let fromDate = $state('');
	let toDate = $state('');
	let classFilter = $state('');
	let statusFilter = $state<'' | AttendanceStatus>('');
	let search = $state('');

	// Correction modal
	let correcting = $state<HistoryRow | null>(null);
	let correctStatus = $state<AttendanceStatus>('present');
	let correctNotes = $state('');
	let confirmDelete = $state<HistoryRow | null>(null);

	let studentMap = $derived(new Map(students.map((s) => [s.id, s])));
	let classMap = $derived(new Map(classes.map((c) => [c.id, c.name])));

	onMount(async () => {
		if (!browser) return;
		try {
			[classes, students] = await Promise.all([
				listClasses({ includeInactive: true }),
				listStudents({ includeInactive: true })
			]);
			await loadRows();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal memuat riwayat.');
		} finally {
			loading = false;
		}
	});

	async function loadRows() {
		const sessions = await listSessions({
			classId: classFilter || undefined,
			from: fromDate || undefined,
			to: toDate || undefined
		});
		const sessionIds = sessions.map((s) => s.id);
		const sessionMap = new Map(sessions.map((s) => [s.id, s]));
		const records = await queryRecords({ sessionIds });
		rows = records
			.map((record) => {
				const session = sessionMap.get(record.sessionId);
				const student = studentMap.get(record.studentId);
				if (!session || !student) return null;
				return {
					record,
					date: session.date,
					className: classMap.get(session.classId) ?? '-',
					student
				} satisfies HistoryRow;
			})
			.filter((r): r is HistoryRow => r !== null)
			.sort(
				(a, b) =>
					b.date.localeCompare(a.date) ||
					(b.record.attendanceTime ?? '').localeCompare(a.record.attendanceTime ?? '')
			);
	}

	async function applyFilters() {
		loading = true;
		try {
			await loadRows();
		} finally {
			loading = false;
		}
	}

	const filtered = $derived(
		rows.filter((row) => {
			if (statusFilter && row.record.status !== statusFilter) return false;
			if (
				search &&
				!matchesQuery(row.student.name, search) &&
				!matchesQuery(row.student.nis, search)
			)
				return false;
			return true;
		})
	);

	function openCorrection(row: HistoryRow) {
		correcting = row;
		correctStatus = row.record.status;
		correctNotes = row.record.notes ?? '';
	}

	async function saveCorrection(event: SubmitEvent) {
		event.preventDefault();
		if (!correcting) return;
		try {
			await correctAttendance(correcting.record.id, {
				status: correctStatus,
				notes: correctNotes || undefined
			});
			toasts.success('Koreksi absensi disimpan.');
			correcting = null;
			await loadRows();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menyimpan koreksi.');
		}
	}

	async function confirmRemoveRecord() {
		if (!confirmDelete) return;
		try {
			await deleteAttendance(confirmDelete.record.id);
			toasts.success('Catatan absensi dihapus.');
			confirmDelete = null;
			await loadRows();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menghapus catatan.');
		}
	}
</script>

<PageHeader
	title="Riwayat Absensi"
	description="Telusuri, koreksi, dan kelola catatan kehadiran."
/>

<div class="card mb-4">
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
		<div>
			<label class="label" for="h-from">Dari Tanggal</label>
			<input id="h-from" type="date" bind:value={fromDate} class="input" />
		</div>
		<div>
			<label class="label" for="h-to">Sampai Tanggal</label>
			<input id="h-to" type="date" bind:value={toDate} class="input" />
		</div>
		<div>
			<label class="label" for="h-class">Kelas</label>
			<select id="h-class" bind:value={classFilter} class="input">
				<option value="">Semua</option>
				{#each classes as cls (cls.id)}
					<option value={cls.id}>{cls.name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="label" for="h-status">Status</label>
			<select id="h-status" bind:value={statusFilter} class="input">
				<option value="">Semua</option>
				{#each STATUS_ORDER as status (status)}
					<option value={status}>{STATUS_LABELS[status]}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-end">
			<button class="btn-primary w-full" onclick={applyFilters}>Terapkan Filter</button>
		</div>
	</div>
	<div class="mt-3">
		<input
			type="search"
			bind:value={search}
			class="input"
			placeholder="Cari nama atau NIS…"
			aria-label="Cari riwayat"
		/>
	</div>
</div>

{#if loading}
	<Spinner />
{:else if filtered.length === 0}
	<EmptyState
		icon="🕘"
		title="Tidak ada catatan"
		description="Belum ada catatan absensi yang cocok dengan filter Anda."
	/>
{:else}
	<p class="mb-2 text-xs text-slate-500">{filtered.length} catatan ditemukan</p>
	<div class="card -mx-4 overflow-x-auto px-0 sm:mx-0">
		<table class="w-full min-w-[720px] text-sm">
			<thead>
				<tr
					class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
				>
					<th class="px-4 py-3 font-medium">Tanggal</th>
					<th class="px-4 py-3 font-medium">Jam</th>
					<th class="px-4 py-3 font-medium">NIS</th>
					<th class="px-4 py-3 font-medium">Nama</th>
					<th class="px-4 py-3 font-medium">Kelas</th>
					<th class="px-4 py-3 font-medium">Status</th>
					<th class="px-4 py-3 font-medium">Metode</th>
					<th class="px-4 py-3 text-right font-medium">Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as row (row.record.id)}
					<tr
						class="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
					>
						<td class="px-4 py-2 whitespace-nowrap">{row.date}</td>
						<td class="px-4 py-2 whitespace-nowrap tabular-nums">
							{row.record.attendanceTime ? formatTime(row.record.attendanceTime) : '-'}
						</td>
						<td class="px-4 py-2 tabular-nums">{row.student.nis}</td>
						<td class="px-4 py-2 font-medium">{row.student.name}</td>
						<td class="px-4 py-2">{row.className}</td>
						<td class="px-4 py-2"><StatusBadge status={row.record.status} /></td>
						<td class="px-4 py-2 text-xs text-slate-500">
							{row.record.method === 'face' ? 'Wajah' : 'Manual'}
						</td>
						<td class="px-4 py-2 text-right whitespace-nowrap text-xs">
							<button class="text-brand-600 hover:underline" onclick={() => openCorrection(row)}
								>Koreksi</button
							>
							<span class="mx-1 text-slate-300">|</span>
							<button class="text-red-600 hover:underline" onclick={() => (confirmDelete = row)}
								>Hapus</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<Modal open={!!correcting} title="Koreksi Absensi" onclose={() => (correcting = null)}>
	<form onsubmit={saveCorrection} class="space-y-4">
		<p class="text-sm text-slate-600 dark:text-slate-300">
			{correcting?.student.name} · {correcting?.date}
		</p>
		<div>
			<label class="label" for="c-status">Status</label>
			<select id="c-status" bind:value={correctStatus} class="input">
				{#each MANUAL_STATUSES as status (status)}
					<option value={status}>{STATUS_LABELS[status]}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="label" for="c-notes">Catatan</label>
			<input
				id="c-notes"
				bind:value={correctNotes}
				class="input"
				placeholder="Alasan koreksi (opsional)"
			/>
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn-secondary" onclick={() => (correcting = null)}>Batal</button>
			<button type="submit" class="btn-primary">Simpan Koreksi</button>
		</div>
	</form>
</Modal>

<Modal
	open={!!confirmDelete}
	title="Hapus Catatan Absensi"
	description="Catatan ini akan dihapus permanen dan tindakan ini dicatat pada log audit."
	onclose={() => (confirmDelete = null)}
	size="sm"
>
	<p class="text-sm text-slate-600 dark:text-slate-300">
		Hapus catatan absensi <strong>{confirmDelete?.student.name}</strong> tanggal {confirmDelete?.date}?
	</p>
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (confirmDelete = null)}>Batal</button>
		<button class="btn-danger" onclick={confirmRemoveRecord}>Hapus</button>
	{/snippet}
</Modal>
