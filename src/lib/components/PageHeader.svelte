<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		children?: Snippet;
	}

	let { title, description, children }: Props = $props();
</script>

<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div>
		<h1 class="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
		{#if description}
			<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
		{/if}
	</div>
	{#if children}
		<div class="flex flex-wrap gap-2">{@render children()}</div>
	{/if}
</header>
