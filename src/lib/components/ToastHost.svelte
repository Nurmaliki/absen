<script lang="ts">
	import { toasts } from '$lib/stores/toast.svelte';

	const colors: Record<string, string> = {
		success: 'bg-brand-600',
		error: 'bg-red-600',
		info: 'bg-slate-700',
		warning: 'bg-amber-600'
	};
	const icons: Record<string, string> = {
		success: '✓',
		error: '✕',
		info: 'ℹ',
		warning: '⚠'
	};
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
	role="status"
	aria-live="polite"
>
	{#each toasts.items as toast (toast.id)}
		<div
			class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg {colors[
				toast.kind
			]} animate-[fadeIn_150ms_ease-out]"
		>
			<span aria-hidden="true" class="mt-0.5 shrink-0">{icons[toast.kind]}</span>
			<span class="flex-1 leading-snug">{toast.message}</span>
			<button
				type="button"
				class="shrink-0 rounded p-1 hover:bg-white/20"
				aria-label="Tutup notifikasi"
				onclick={() => toasts.dismiss(toast.id)}>✕</button
			>
		</div>
	{/each}
</div>

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
