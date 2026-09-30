<script lang="ts">
	import { page } from '$app/state';

	interface NavItem {
		href: string;
		label: string;
		icon: string;
	}

	const items: NavItem[] = [
		{ href: '/', label: 'Home', icon: '🏠' },
		{ href: '/attendance', label: 'Absensi', icon: '📷' },
		{ href: '/students', label: 'Siswa', icon: '👥' },
		{ href: '/reports', label: 'Laporan', icon: '📊' },
		{ href: '/settings', label: 'Lainnya', icon: '⚙️' }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<nav
	class="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden dark:border-slate-800 dark:bg-slate-900"
	aria-label="Navigasi bawah"
>
	<div class="mx-auto flex max-w-lg items-stretch justify-around">
		{#each items as item (item.href)}
			<a
				href={item.href}
				class="flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium transition {isActive(
					item.href
				)
					? 'text-brand-600 dark:text-brand-400'
					: 'text-slate-500 dark:text-slate-400'}"
				aria-current={isActive(item.href) ? 'page' : undefined}
			>
				<span class="text-lg" aria-hidden="true">{item.icon}</span>
				{item.label}
			</a>
		{/each}
	</div>
</nav>
