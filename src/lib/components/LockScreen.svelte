<script lang="ts">
	import { verifyAdminPin } from '$lib/security/auth';
	import { appLock, appSettings } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	let pin = $state('');
	let error = $state('');
	let busy = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		busy = true;
		try {
			const ok = await verifyAdminPin(pin);
			if (ok) {
				appLock.unlock();
				pin = '';
				toasts.success('Selamat datang kembali.');
			} else {
				error = 'PIN salah. Coba lagi.';
				pin = '';
				input?.focus();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memverifikasi PIN.';
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		// Autofocus when the lock screen appears.
		if (appLock.locked) input?.focus();
	});
</script>

<div
	class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/95 px-4 backdrop-blur-sm"
	role="dialog"
	aria-modal="true"
	aria-label="Layar terkunci"
>
	<form
		class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"
		onsubmit={submit}
	>
		<div class="mb-4 text-center">
			<div class="text-3xl" aria-hidden="true">🔒</div>
			<h1 class="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
				Aplikasi Terkunci
			</h1>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Masukkan PIN administrator untuk melanjutkan.
			</p>
			{#if appSettings.value.schoolName}
				<p class="mt-1 text-xs text-slate-400">{appSettings.value.schoolName}</p>
			{/if}
		</div>

		<label class="label" for="lock-pin">PIN</label>
		<input
			id="lock-pin"
			bind:this={input}
			bind:value={pin}
			type="password"
			inputmode="numeric"
			autocomplete="current-password"
			class="input text-center text-2xl tracking-[0.4em]"
			placeholder="••••"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? 'lock-error' : undefined}
		/>
		{#if error}
			<p id="lock-error" class="mt-2 text-sm text-red-600" role="alert">{error}</p>
		{/if}

		<button type="submit" class="btn-primary mt-4 w-full" disabled={busy || pin.length < 4}>
			{busy ? 'Memeriksa…' : 'Buka Kunci'}
		</button>
	</form>
</div>
