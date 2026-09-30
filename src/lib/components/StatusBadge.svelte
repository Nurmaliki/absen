<script lang="ts">
	import type { AttendanceStatus } from '$lib/types';
	import { STATUS_LABELS } from '$lib/attendance/rules';

	interface Props {
		status: AttendanceStatus;
	}

	let { status }: Props = $props();

	const styles: Record<AttendanceStatus, string> = {
		present: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
		late: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
		permission: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
		sick: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
		absent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
	};
</script>

<span class="badge {styles[status]}">{STATUS_LABELS[status]}</span>
