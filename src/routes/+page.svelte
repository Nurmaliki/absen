<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import StatCard from '$lib/components/StatCard.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { loadDashboard, type DashboardData } from '$lib/services/dashboard';
	import { appSettings } from '$lib/stores/app.svelte';
	import { estimateStorage, storageWarningMessage, type StorageInfo } from '$lib/utils/storage';
	import { formatBytes, formatPercent } from '$lib/utils/id';
	import { formatDateOnly, formatDateTime } from '$lib/utils/time';

	let dashboard = $state<DashboardData | null>(null);
	let loading = $state(true);
	let error = $state('');
	let storage = $state<StorageInfo | null>(null);

	onMount(async () => {
		if (!browser) return;
		try {
			dashboard = await loadDashboard();
			storage = await estimateStorage();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Gagal memuat dashboard.';
		} finally {
			loading = false;
		}
	});

	const lastBackup = $derived(
		dashboard?.recentActivity.find((a) => a.action === 'backup')?.createdAt
	);
	const storageWarning = $derived(storage ? storageWarningMessage(storage) : null);
</script>

<div class="space-y-5">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				{formatDateOnly(dashboard?.date ?? '')}
			</p>
		</div>
		{#if appSettings.value.schoolName}
			<p class="text-sm font-medium text-slate-600 dark:text-slate-300">
				{appSettings.value.schoolName}
			</p>
		{/if}
	</header>

	{#if loading}
		<Spinner fullPage message="Memuat data…" />
	{:else if error}
		<div class="card border-red-200 bg-red-50 dark:bg-red-900/20" role="alert">
			<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
		</div>
	{:else if dashboard}
		{#if storageWarning}
			<div
				class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
				role="alert"
			>
				<span aria-hidden="true">⚠️</span>
				<span>{storageWarning}</span>
			</div>
		{/if}

		<section aria-label="Ringkasan hari ini">
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
				<StatCard label="Total Siswa" value={dashboard.totalStudents} icon="👥" />
				<StatCard
					label="Hadir Hari Ini"
					value={dashboard.todayCounts.present}
					accent="present"
					icon="✓"
				/>
				<StatCard label="Terlambat" value={dashboard.todayCounts.late} accent="late" icon="⏰" />
				<StatCard label="Izin" value={dashboard.todayCounts.permission} accent="permission" />
				<StatCard label="Sakit" value={dashboard.todayCounts.sick} accent="sick" />
				<StatCard label="Alpa" value={dashboard.todayCounts.absent} accent="absent" />
			</div>
		</section>

		<div class="grid gap-4 lg:grid-cols-2">
			<section class="card" aria-label="Persentase kehadiran hari ini">
				<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Kehadiran Hari Ini</h2>
				<p class="mt-2 text-3xl font-bold text-brand-600 dark:text-brand-400">
					{formatPercent(dashboard.todayPercentage)}
				</p>
				<p class="mt-1 text-xs text-slate-500">
					{dashboard.todayCounts.present + dashboard.todayCounts.late} dari {dashboard.todayCounts
						.total} siswa sudah tercatat
				</p>
				<div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
					<div
						class="h-full rounded-full bg-brand-600 transition-all"
						style="width: {Math.min(100, dashboard.todayPercentage)}%"
					></div>
				</div>
				<p class="mt-3 text-xs text-slate-500">
					Wajah terdaftar: {dashboard.faceRegistered}/{dashboard.faceTotal} siswa
				</p>
			</section>

			<section class="card" aria-label="Sesi absensi">
				<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Sesi Absensi Aktif</h2>
				{#if dashboard.openSessions.length === 0}
					<p class="mt-3 text-sm text-slate-500">Belum ada sesi absensi yang dibuka hari ini.</p>
					<a href="/attendance" class="btn-primary mt-3">Mulai Absensi</a>
				{:else}
					<ul class="mt-3 space-y-2">
						{#each dashboard.openSessions as session (session.id)}
							<li
								class="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 dark:bg-brand-900/20"
							>
								<div>
									<p class="text-sm font-medium text-brand-800 dark:text-brand-200">
										{dashboard.classes.find((c) => c.classId === session.classId)?.className ??
											'Kelas'}
									</p>
									<p class="text-xs text-slate-500">
										Mulai {session.startTime}{session.lateAfter
											? ` · Telat > ${session.lateAfter}`
											: ''}
									</p>
								</div>
								<span class="badge bg-brand-600 text-white">TERBUKA</span>
							</li>
						{/each}
					</ul>
					<a href="/attendance" class="btn-primary mt-3">Lanjutkan Absensi</a>
				{/if}
			</section>
		</div>

		<section class="card" aria-label="Statistik per kelas">
			<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
				Statistik Kehadiran per Kelas
			</h2>
			{#if dashboard.classes.length === 0}
				<EmptyState
					icon="🏫"
					title="Belum ada kelas"
					description="Tambahkan kelas terlebih dahulu untuk mulai mencatat kehadiran."
				>
					<a href="/classes" class="btn-primary">Tambah Kelas</a>
				</EmptyState>
			{:else}
				<div class="mt-3 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
					<table class="w-full min-w-[560px] text-sm">
						<thead>
							<tr
								class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
							>
								<th class="pb-2 font-medium">Kelas</th>
								<th class="pb-2 text-center font-medium">Siswa</th>
								<th class="pb-2 text-center font-medium">H</th>
								<th class="pb-2 text-center font-medium">T</th>
								<th class="pb-2 text-center font-medium">I</th>
								<th class="pb-2 text-center font-medium">S</th>
								<th class="pb-2 text-center font-medium">A</th>
								<th class="pb-2 text-right font-medium">%</th>
							</tr>
						</thead>
						<tbody>
							{#each dashboard.classes as cls (cls.classId)}
								<tr class="border-b border-slate-100 dark:border-slate-800">
									<td class="py-2 font-medium">{cls.className}</td>
									<td class="py-2 text-center tabular-nums">{cls.total}</td>
									<td class="py-2 text-center tabular-nums text-brand-600">{cls.present}</td>
									<td class="py-2 text-center tabular-nums text-amber-600">{cls.late}</td>
									<td class="py-2 text-center tabular-nums text-blue-600">{cls.permission}</td>
									<td class="py-2 text-center tabular-nums text-purple-600">{cls.sick}</td>
									<td class="py-2 text-center tabular-nums text-red-600">{cls.absent}</td>
									<td class="py-2 text-right tabular-nums">{formatPercent(cls.percentage)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<div class="grid gap-4 lg:grid-cols-2">
			<section class="card" aria-label="Aktivitas terbaru">
				<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Aktivitas Terbaru</h2>
				{#if dashboard.recentActivity.length === 0}
					<p class="mt-3 text-sm text-slate-500">Belum ada aktivitas.</p>
				{:else}
					<ul class="mt-3 space-y-2">
						{#each dashboard.recentActivity as log (log.id)}
							<li class="flex items-start gap-2 text-sm">
								<span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500"></span>
								<div class="min-w-0">
									<p class="truncate text-slate-700 dark:text-slate-300">{log.description}</p>
									<p class="text-xs text-slate-400">{formatDateTime(log.createdAt)}</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="card" aria-label="Belum hadir dan status backup">
				<h2 class="text-sm font-semibold text-slate-700 dark:text-slate-200">
					Belum Tercatat Hari Ini
				</h2>
				{#if dashboard.unrecorded.length === 0}
					<p class="mt-3 text-sm text-slate-500">Semua siswa aktif sudah tercatat 🎉</p>
				{:else}
					<ul class="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
						{#each dashboard.unrecorded as s (s.id)}
							<li class="flex justify-between">
								<span class="truncate">{s.name}</span>
								<span class="text-xs text-slate-400">{s.className}</span>
							</li>
						{/each}
					</ul>
				{/if}

				<div class="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
					<p class="text-xs text-slate-500">
						Backup terakhir:
						{lastBackup ? formatDateTime(lastBackup) : 'Belum pernah'}
					</p>
					{#if storage?.supported}
						<p class="mt-1 text-xs text-slate-500">
							Penyimpanan: {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
						</p>
					{/if}
					<a href="/settings" class="btn-secondary mt-2 w-full">Kelola Backup</a>
				</div>
			</section>
		</div>
	{/if}
</div>
