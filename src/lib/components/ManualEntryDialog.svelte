<script lang="ts">
	import Modal from './Modal.svelte';
	import { STATUS_LABELS, MANUAL_STATUSES } from '$lib/attendance/rules';
	import type { AttendanceRecord, AttendanceStatus, Student } from '$lib/types';

	/**
	 * Manual attendance entry dialog.
	 *
	 * Extracted from the attendance route so that route focuses on session lifecycle +
	 * scanner orchestration. The dialog is presentation-only: it collects a student, status
	 * and optional note, then hands them to the parent's `onsubmit`. Duplicate handling stays
	 * in the parent because it needs the session and record list.
	 */

	interface Props {
		open: boolean;
		students: Student[];
		/** Records already written for this session (used to disable already-recorded students). */
		records: AttendanceRecord[];
		/** Pre-selected student when opened from a row's "Catat" button. */
		initialStudentId?: string;
		onsubmit: (input: {
			studentId: string;
			status: AttendanceStatus;
			notes?: string;
		}) => Promise<void> | void;
		onclose: () => void;
	}

	let { open, students, records, initialStudentId = '', onsubmit, onclose }: Props = $props();

	let studentId = $state('');
	let status = $state<AttendanceStatus>('present');
	let notes = $state('');

	// Whenever the dialog opens, reset to the caller-provided selection.
	$effect(() => {
		if (open) {
			studentId = initialStudentId;
			status = 'present';
			notes = '';
		}
	});

	const recordedIds = $derived(new Set(records.map((r) => r.studentId)));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!studentId) return;
		await onsubmit({ studentId, status, notes: notes || undefined });
	}
</script>

<Modal {open} title="Absensi Manual" {onclose}>
	<form onsubmit={submit} class="space-y-4">
		<div>
			<label class="label" for="manual-student">Siswa</label>
			<select id="manual-student" bind:value={studentId} class="input" required>
				<option value="">Pilih siswa</option>
				{#each students as s (s.id)}
					<option value={s.id} disabled={recordedIds.has(s.id)}>
						{s.name} ({s.nis}){recordedIds.has(s.id) ? ' — sudah tercatat' : ''}
					</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="label" for="manual-status">Status</label>
			<select id="manual-status" bind:value={status} class="input">
				{#each MANUAL_STATUSES as value (value)}
					<option {value}>{STATUS_LABELS[value]}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="label" for="manual-notes">Catatan (opsional)</label>
			<input
				id="manual-notes"
				bind:value={notes}
				class="input"
				placeholder="contoh: surat dokter"
			/>
		</div>
		<div class="flex justify-end gap-2">
			<button type="button" class="btn-secondary" onclick={onclose}>Batal</button>
			<button type="submit" class="btn-primary" disabled={!studentId}>Simpan</button>
		</div>
	</form>
</Modal>
