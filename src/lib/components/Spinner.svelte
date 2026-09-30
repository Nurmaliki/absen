<script lang="ts">
	interface Props {
		message?: string;
		fullPage?: boolean;
	}

	let { message = 'Memuat…', fullPage = false }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center gap-3 {fullPage ? 'min-h-[60vh]' : 'py-8'}"
	role="status"
	aria-live="polite"
>
	<span
		class="h-8 w-8 animate-spin rounded-full border-3 border-brand-200 border-t-brand-600"
		aria-hidden="true"
	></span>
	<p class="text-sm text-slate-500 dark:text-slate-400">{message}</p>
</div>
