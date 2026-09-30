<script lang="ts">
	import { page } from '$app/state';
	import { appSettings } from '$lib/stores/app.svelte';

	interface NavItem {
		href: string;
		label: string;
		icon: string;
	}

	const primary: NavItem[] = [
		{ href: '/', label: 'Dashboard', icon: '🏠' },
		{ href: '/attendance', label: 'Absensi', icon: '📷' },
		{ href: '/students', label: 'Siswa', icon: '👥' },
		{ href: '/classes', label: 'Kelas', icon: '🏫' },
		{ href: '/history', label: 'Riwayat', icon: '🕘' },
		{ href: '/reports', label: 'Laporan', icon: '📊' }
	];

	const secondary: NavItem[] = [
		{ href: '/settings', label: 'Pengaturan', icon: '⚙️' },
		{ href: '/privacy', label: 'Privasi', icon: '🔒' }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<aside
	class="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900"
>
	<div class="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
		<span class="text-2xl" aria-hidden="true">🎓</span>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
				{appSettings.value.schoolName || 'Absensi Wajah'}
			</p>
			<p class="text-xs text-slate-500 dark:text-slate-400">Sistem Absensi Siswa</p>
		</div>
	</div>

	<nav class="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Navigasi utama">
		{#each primary as item (item.href)}
			<a
				href={item.href}
				class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition {isActive(
					item.href
				)
					? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
					: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}"
				aria-current={isActive(item.href) ? 'page' : undefined}
			>
				<span aria-hidden="true">{item.icon}</span>
				{item.label}
			</a>
		{/each}
	</nav>

	<nav
		class="space-y-1 border-t border-slate-200 p-3 dark:border-slate-800"
		aria-label="Navigasi sekunder"
	>
		{#each secondary as item (item.href)}
			<a
				href={item.href}
				class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition {isActive(
					item.href
				)
					? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
					: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}"
				aria-current={isActive(item.href) ? 'page' : undefined}
			>
				<span aria-hidden="true">{item.icon}</span>
				{item.label}
			</a>
		{/each}
	</nav>
</aside>
