<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
		size?: 'sm' | 'md' | 'lg';
	}

	let { open, title, description, onclose, children, footer, size = 'md' }: Props = $props();

	const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onclose?.();
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose?.();
		}}
	>
		<div
			class="w-full {sizes[
				size
			]} rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-slate-900"
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<div class="mb-3 flex items-start justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
					{#if description}
						<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
					{/if}
				</div>
				{#if onclose}
					<button
						type="button"
						class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
						aria-label="Tutup"
						onclick={onclose}>✕</button
					>
				{/if}
			</div>
			<div class="max-h-[70vh] overflow-y-auto">{@render children()}</div>
			{#if footer}
				<div class="mt-5 flex justify-end gap-2">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}
