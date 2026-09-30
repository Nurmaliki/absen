<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		icon?: string;
		title: string;
		description?: string;
		children?: Snippet;
	}

	let { icon = '📭', title, description, children }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
	<div class="text-4xl" aria-hidden="true">{icon}</div>
	<h3 class="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
	{#if description}
		<p class="max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
	{/if}
	{#if children}
		<div class="mt-3">{@render children()}</div>
	{/if}
</div>
