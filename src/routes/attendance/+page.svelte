<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LiveScanner from '$lib/components/LiveScanner.svelte';
	import QrScanner from '$lib/components/QrScanner.svelte';
	import ManualEntryDialog from '$lib/components/ManualEntryDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { onSync } from '$lib/db/sync';
	import { kiosk } from '$lib/stores/kiosk.svelte';
	import { listClasses } from '$lib/db/classes';
	import { listStudents, getFaceTemplatesForStudents } from '$lib/db/students';
	import {
		closeSession,
		findSession,
		openSession,
		recordFaceAttendance,
		recordManualAttendance,
		DuplicateAttendanceError,
		listRecordsForSession,
		getRecord
	} from '$lib/db/attendance';
	import { getSettings } from '$lib/db/settings';
	import {
		summarizeSession,
		unrecordedStudents,
		STATUS_LABELS,
		MANUAL_STATUSES
	} from '$lib/attendance/rules';
	import { appSettings } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { clockTime, formatDateOnly, todayDate } from '$lib/utils/time';
	import type {
		AttendanceRecord,
		AttendanceSession,
		AttendanceStatus,
		FaceTemplate,
		SchoolClass,
		Student
	} from '$lib/types';

	let classes = $state<SchoolClass[]>([]);
	let selectedClassId = $state('');
	let session = $state<AttendanceSession | null>(null);
	let students = $state<Student[]>([]);
	let templates = $state<FaceTemplate[]>([]);
	let records = $state<AttendanceRecord[]>([]);
	let loading = $state(true);
	let starting = $state(false);

	// Setup form
	let entryTime = $state('06:30');
	let lateThreshold = $state('07:00');

	// Manual entry
	let showManual = $state(false);
	let manualStudentId = $state('');

	// Close session
	let showClose = $state(false);

	// Scanning mode: face is the default, QR is the fallback when a face fails or is missing.
	let scanMode = $state<'face' | 'qr'>('face');

	let studentMap = $derived(new Map(students.map((s) => [s.id, s])));
	let counts = $derived(summarizeSession(students, records));
	let unrecorded = $derived(unrecordedStudents(students, records));
	let classMap = $derived(new Map(classes.map((c) => [c.id, c.name])));
	let selectedClass = $derived(classes.find((c) => c.id === selectedClassId));

	onMount(() => {
		let unsubscribe: (() => void) | undefined;

		if (browser) {
			(async () => {
				try {
					const [cls, settings] = await Promise.all([listClasses(), getSettings()]);
					classes = cls;
					entryTime = settings.defaultEntryTime;
					lateThreshold = settings.lateThreshold;
					if (classes.length > 0) selectedClassId = classes[0].id;
				} catch (e) {
					toasts.error(e instanceof Error ? e.message : 'Gagal memuat data.');
				} finally {
					loading = false;
				}
			})();

			// Reflect attendance changes made in another tab (same class/session).
			unsubscribe = onSync((event) => {
				if (event.kind !== 'attendance:changed') return;
				if (session && (!event.sessionId || event.sessionId === session.id)) {
					refreshRecords();
				}
			});
		}

		return () => {
			unsubscribe?.();
			kiosk.exit();
		};
	});

	async function loadClassData() {
		if (!selectedClassId) return;
		students = await listStudents({ classId: selectedClassId });
		templates = await getFaceTemplatesForStudents(students.map((s) => s.id));
	}

	async function startSession() {
		if (!selectedClassId) return;
		starting = true;
		try {
			await loadClassData();
			const existing = await findSession(selectedClassId, todayDate());
			if (existing && existing.status === 'open') {
				session = existing;
				records = await listRecordsForSession(existing.id);
				toasts.info('Melanjutkan sesi yang sedang terbuka.');
			} else {
				session = await openSession({
					classId: selectedClassId,
					startTime: clockTime(),
					lateAfter: lateThreshold
				});
				records = [];
				toasts.success('Sesi absensi dibuka.');
			}
			entryTime = session.startTime;
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal membuka sesi.');
		} finally {
			starting = false;
		}
	}

	async function refreshRecords() {
		if (!session) return;
		records = await listRecordsForSession(session.id);
	}

	/** Called by LiveScanner for each successful identification. */
	async function handleRecognized(
		student: Student,
		info: { score: number; distance: number }
	): Promise<boolean | 'duplicate'> {
		if (!session) return false;
		try {
			const record = await recordFaceAttendance({
				sessionId: session.id,
				studentId: student.id,
				lateAfter: session.lateAfter,
				recognitionScore: info.score,
				recognitionDistance: info.distance
			});
			records = [...records, record];
			toasts.success(`${student.name} — ${STATUS_LABELS[record.status]} tercatat.`);
			return true;
		} catch (e) {
			if (e instanceof DuplicateAttendanceError) {
				const existing = e.existing;
				toasts.info(
					`${student.name} sudah melakukan absensi pada ${
						existing.attendanceTime
							? new Date(existing.attendanceTime).toLocaleTimeString('id-ID')
							: 'sebelumnya'
					}.`
				);
				await refreshRecords();
				return 'duplicate';
			}
			toasts.error('Gagal menyimpan absensi.');
			await refreshRecords();
			return false;
		}
	}

	/**
	 * QR fallback: resolve a scanned card to a student in the current class and record
	 * attendance. Uses the same anti-duplicate repository path as face/manual.
	 */
	async function handleQrScanned(payload: { studentId: string; nis: string }): Promise<boolean> {
		if (!session) return true; // keep scanning; nothing to record into
		const student = studentMap.get(payload.studentId);
		if (!student) {
			toasts.warning('Kartu QR tidak cocok dengan siswa di kelas ini.');
			return true;
		}
		try {
			const record = await recordManualAttendance({
				sessionId: session.id,
				studentId: student.id,
				status: 'present',
				notes: 'Absensi via QR'
			});
			records = [...records, record];
			toasts.success(`${student.name} — ${STATUS_LABELS[record.status]} tercatat (QR).`);
		} catch (e) {
			if (e instanceof DuplicateAttendanceError) {
				toasts.info(`${student.name} sudah melakukan absensi.`);
			} else {
				toasts.error(e instanceof Error ? e.message : 'Gagal menyimpan absensi QR.');
			}
		}
		return true;
	}

	async function submitManual(input: {
		studentId: string;
		status: AttendanceStatus;
		notes?: string;
	}) {
		if (!session) return;
		try {
			const record = await recordManualAttendance({
				sessionId: session.id,
				studentId: input.studentId,
				status: input.status,
				notes: input.notes
			});
			records = [...records, record];
			const student = studentMap.get(input.studentId);
			toasts.success(
				`${student?.name ?? 'Siswa'} — ${STATUS_LABELS[record.status]} dicatat manual.`
			);
			showManual = false;
			manualStudentId = '';
		} catch (e) {
			if (e instanceof DuplicateAttendanceError) {
				toasts.warning('Siswa ini sudah memiliki catatan absensi pada sesi ini.');
			} else {
				toasts.error(e instanceof Error ? e.message : 'Gagal menyimpan absensi manual.');
			}
		}
	}

	function openManualFor(studentId: string) {
		manualStudentId = studentId;
		showManual = true;
	}

	async function confirmCloseSession() {
		if (!session) return;
		try {
			await closeSession(session.id, { markAbsentStudentIds: unrecorded.map((s) => s.id) });
			toasts.success(
				unrecorded.length > 0
					? `Sesi ditutup. ${unrecorded.length} siswa ditandai alpa.`
					: 'Sesi ditutup.'
			);
			session = { ...session, status: 'closed' };
			await refreshRecords();
			showClose = false;
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal menutup sesi.');
		}
	}

	function endSession() {
		session = null;
		records = [];
		students = [];
		templates = [];
	}
</script>

<PageHeader title="Absensi" description="Kenali wajah siswa dan catat kehadiran secara otomatis." />

{#if loading}
	<Spinner fullPage />
{:else if classes.length === 0}
	<EmptyState
		icon="🏫"
		title="Belum ada kelas"
		description="Buat kelas dan daftarkan siswa terlebih dahulu."
	>
		<a href="/classes" class="btn-primary">Buat Kelas</a>
	</EmptyState>
{:else if !session}
	<div class="card mx-auto max-w-md">
		<h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">Mulai Sesi Absensi</h2>
		<div class="mt-4 space-y-4">
			<div>
				<label class="label" for="att-class">Kelas</label>
				<select id="att-class" bind:value={selectedClassId} class="input">
					{#each classes as cls (cls.id)}
						<option value={cls.id}>{cls.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="label" for="att-entry">Jam Masuk</label>
					<input id="att-entry" type="time" bind:value={entryTime} class="input" disabled />
				</div>
				<div>
					<label class="label" for="att-late">Terlambat Setelah</label>
					<input id="att-late" type="time" bind:value={lateThreshold} class="input" />
				</div>
			</div>
			<p class="text-xs text-slate-500">{formatDateOnly(todayDate())}</p>
			<button class="btn-primary w-full" onclick={startSession} disabled={starting}>
				{starting ? 'Menyiapkan…' : 'Mulai Absensi'}
			</button>
		</div>
	</div>
{:else}
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<div>
			<h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">
				ABSENSI KELAS {classMap.get(session.classId) ?? ''}
			</h2>
			<p class="text-sm text-slate-500">
				{formatDateOnly(session.date)} · Mulai {session.startTime}{session.lateAfter
					? ` · Telat > ${session.lateAfter}`
					: ''}
			</p>
		</div>
		<div class="flex gap-2">
			<button class="btn-secondary" onclick={() => openManualFor('')}>Absensi Manual</button>
			{#if !kiosk.active}
				<button class="btn-secondary" onclick={() => kiosk.enter()}>Mode Kios</button>
			{:else}
				<button class="btn-secondary" onclick={() => kiosk.exit()}>Keluar Kios</button>
			{/if}
			{#if session.status === 'open'}
				<button class="btn-danger" onclick={() => (showClose = true)}>Tutup Absensi</button>
			{:else}
				<button class="btn-secondary" onclick={endSession}>Selesai</button>
			{/if}
		</div>
	</div>

	{#if session.status === 'closed'}
		<div
			class="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"
		>
			Sesi ini sudah ditutup. Anda masih dapat melakukan koreksi melalui riwayat.
		</div>
	{/if}

	<!-- Live counters -->
	<div class="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
		{#each [{ k: 'present', l: 'Hadir', c: 'text-brand-600' }, { k: 'late', l: 'Terlambat', c: 'text-amber-600' }, { k: 'permission', l: 'Izin', c: 'text-blue-600' }, { k: 'sick', l: 'Sakit', c: 'text-purple-600' }, { k: 'absent', l: 'Alpa', c: 'text-red-600' }, { k: 'unrecorded', l: 'Belum', c: 'text-slate-500' }] as item (item.k)}
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold tabular-nums {item.c}">
					{counts[item.k as keyof typeof counts]}
				</p>
				<p class="text-[11px] text-slate-500">{item.l}</p>
			</div>
		{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<div>
			{#if session.status === 'open'}
				{#if scanMode === 'face'}
					<LiveScanner
						{templates}
						students={studentMap}
						threshold={appSettings.value.recognitionThreshold}
						margin={appSettings.value.recognitionMargin}
						livenessEnabled={appSettings.value.livenessEnabled}
						challengeEnabled={appSettings.value.livenessChallengeEnabled ?? false}
						onrecognized={handleRecognized}
						paused={showManual || showClose}
					/>
				{:else}
					<QrScanner deviceId={appSettings.value.cameraDeviceId} onscanned={handleQrScanned} />
				{/if}
			{:else}
				<div class="rounded-2xl bg-slate-100 p-8 text-center dark:bg-slate-800">
					<p class="text-sm text-slate-500">Kamera dinonaktifkan karena sesi sudah ditutup.</p>
				</div>
			{/if}

			{#if session.status === 'open'}
				<div class="mt-3 flex gap-2">
					<button
						class={scanMode === 'face' ? 'btn-primary' : 'btn-secondary'}
						onclick={() => (scanMode = 'face')}>Wajah</button
					>
					<button
						class={scanMode === 'qr' ? 'btn-primary' : 'btn-secondary'}
						onclick={() => (scanMode = 'qr')}>Kartu QR</button
					>
				</div>
			{/if}

			{#if templates.length === 0 && scanMode === 'face'}
				<p
					class="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
				>
					Belum ada siswa di kelas ini yang memiliki wajah terdaftar. Daftarkan wajah, gunakan kartu
					QR, atau absensi manual.
				</p>
			{/if}
		</div>

		<div class="card max-h-[70vh] overflow-y-auto">
			<h3 class="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
				Daftar Siswa ({students.length})
			</h3>
			<ul class="space-y-1">
				{#each students as student (student.id)}
					{@const record = records.find((r) => r.studentId === student.id)}
					<li
						class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm {record
							? ''
							: 'bg-slate-50 dark:bg-slate-800/50'}"
					>
						<div class="min-w-0">
							<p class="truncate font-medium">{student.name}</p>
							<p class="text-xs text-slate-400">
								{student.nis}{student.faceRegistered ? '' : ' · tanpa wajah'}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if record}
								<span
									class="badge {record.status === 'present'
										? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
										: record.status === 'late'
											? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40'
											: record.status === 'absent'
												? 'bg-red-100 text-red-800 dark:bg-red-900/40'
												: 'bg-slate-100 text-slate-600 dark:bg-slate-800'}"
								>
									{STATUS_LABELS[record.status]}
								</span>
							{:else}
								<button
									class="text-xs text-brand-600 hover:underline"
									onclick={() => openManualFor(student.id)}>Catat</button
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<!-- Manual attendance modal -->
<ManualEntryDialog
	open={showManual}
	{students}
	{records}
	initialStudentId={manualStudentId}
	onsubmit={submitManual}
	onclose={() => (showManual = false)}
/>

<!-- Close session modal -->
<Modal
	open={showClose}
	title="Tutup Sesi Absensi"
	onclose={() => (showClose = false)}
	description="Tandai siswa yang belum tercatat sebagai Alpa?"
>
	{#if unrecorded.length === 0}
		<p class="text-sm text-slate-600 dark:text-slate-300">
			Semua siswa sudah tercatat. Tutup sesi sekarang?
		</p>
	{:else}
		<p class="text-sm text-slate-600 dark:text-slate-300">
			{unrecorded.length} siswa belum tercatat. Bila Anda menutup sesi, mereka akan ditandai
			<strong>Alpa</strong>. Anda masih dapat mengoreksi status setelahnya melalui riwayat.
		</p>
		<ul class="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-slate-500">
			{#each unrecorded as s (s.id)}
				<li>{s.name}</li>
			{/each}
		</ul>
	{/if}
	{#snippet footer()}
		<button class="btn-secondary" onclick={() => (showClose = false)}>Batal</button>
		<button class="btn-danger" onclick={confirmCloseSession}>
			{unrecorded.length > 0 ? `Tutup & Tandai ${unrecorded.length} Alpa` : 'Tutup Sesi'}
		</button>
	{/snippet}
</Modal>
