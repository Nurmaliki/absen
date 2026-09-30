<script lang="ts">
	interface Props {
		label: string;
		value: string | number;
		hint?: string;
		accent?: 'default' | 'present' | 'late' | 'permission' | 'sick' | 'absent';
		icon?: string;
	}

	let { label, value, hint, accent = 'default', icon }: Props = $props();

	const accents: Record<string, string> = {
		default: 'text-slate-900 dark:text-slate-100',
		present: 'text-brand-700 dark:text-brand-300',
		late: 'text-amber-600 dark:text-amber-400',
		permission: 'text-blue-600 dark:text-blue-400',
		sick: 'text-purple-600 dark:text-purple-400',
		absent: 'text-red-600 dark:text-red-400'
	};
</script>

<div class="card">
	<div class="flex items-start justify-between gap-2">
		<p class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
			{label}
		</p>
		{#if icon}<span class="text-lg" aria-hidden="true">{icon}</span>{/if}
	</div>
	<p class="mt-1 text-2xl font-bold tabular-nums {accents[accent]}">
		{typeof value === 'number' ? value.toLocaleString('id-ID') : value}
	</p>
	{#if hint}
		<p class="mt-0.5 text-xs text-slate-400">{hint}</p>
	{/if}
</div>
