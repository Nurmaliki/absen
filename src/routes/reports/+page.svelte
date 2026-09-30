<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { listClasses } from '$lib/db/classes';
	import { getSettings } from '$lib/db/settings';
	import {
		buildDailyReport,
		buildMonthlyReport,
		buildReportSummary,
		classNameFor,
		describePeriod,
		type DailyReportRow,
		type MonthlyReportRow,
		type ReportFilters,
		type ReportSummary
	} from '$lib/reports/aggregate';
	import {
		buildDailyWorkbook,
		buildMonthlyWorkbook,
		workbookToBlob,
		excelFilename
	} from '$lib/reports/xlsx';
	import { dailyCsv, monthlyCsv, csvBlob, csvFilename } from '$lib/reports/csv';
	import { buildDailyPdf, buildMonthlyPdf, pdfFilename } from '$lib/reports/pdf';
	import {
		buildTextRecap,
		copyToClipboard,
		downloadBlob,
		shareFile,
		shareText
	} from '$lib/reports/share';
	import { appSettings } from '$lib/stores/app.svelte';
	import { toasts } from '$lib/stores/toast.svelte';
	import { formatDateTime, monthKey, todayDate } from '$lib/utils/time';
	import type { SchoolClass } from '$lib/types';

	type ReportKind = 'daily' | 'monthly';

	let classes = $state<SchoolClass[]>([]);
	let loading = $state(true);
	let generating = $state(false);

	let kind = $state<ReportKind>('monthly');
	let classId = $state('');
	let date = $state(todayDate());
	let month = $state(monthKey(todayDate()));

	let dailyRows = $state<DailyReportRow[]>([]);
	let monthlyRows = $state<MonthlyReportRow[]>([]);
	let summary = $state<ReportSummary | null>(null);
	let hasRun = $state(false);

	onMount(async () => {
		if (!browser) return;
		try {
			classes = await listClasses();
			const settings = await getSettings();
			if (!appSettings.value.schoolName) appSettings.set(settings);
		} finally {
			loading = false;
		}
	});

	function currentFilters(): ReportFilters {
		return kind === 'daily'
			? { classId: classId || undefined, date }
			: { classId: classId || undefined, month };
	}

	async function generate() {
		generating = true;
		try {
			const filters = currentFilters();
			if (kind === 'daily') {
				dailyRows = await buildDailyReport(filters);
			} else {
				monthlyRows = await buildMonthlyReport(filters);
			}
			summary = await buildReportSummary(filters);
			hasRun = true;
			if ((kind === 'daily' ? dailyRows : monthlyRows).length === 0) {
				toasts.info('Tidak ada data untuk periode ini.');
			}
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Gagal membuat laporan.');
		} finally {
			generating = false;
		}
	}

	async function metaInfo() {
		return {
			schoolName: appSettings.value.schoolName || 'Sekolah',
			className: await classNameFor(classId || undefined),
			periodLabel: describePeriod(currentFilters()),
			title: kind === 'daily' ? 'LAPORAN ABSENSI HARIAN' : 'LAPORAN ABSENSI SISWA'
		};
	}

	/** Period string used in filenames: `YYYY-MM-DD` for daily, `YYYY-MM` for monthly. */
	function periodSlug(): string {
		return kind === 'daily' ? date : month;
	}

	async function exportExcel() {
		const info = await metaInfo();
		const blob =
			kind === 'daily'
				? workbookToBlob(
						buildDailyWorkbook(dailyRows, {
							title: info.title,
							schoolName: info.schoolName,
							periodLabel: info.periodLabel
						})
					)
				: workbookToBlob(
						buildMonthlyWorkbook(monthlyRows, {
							title: info.title,
							schoolName: info.schoolName,
							periodLabel: info.periodLabel
						})
					);
		downloadBlob(
			blob,
			excelFilename(info.className, periodSlug(), kind === 'daily' ? 'harian' : 'bulanan')
		);
		toasts.success('File Excel diunduh.');
	}

	async function exportCsv() {
		const info = await metaInfo();
		const csv = kind === 'daily' ? dailyCsv(dailyRows) : monthlyCsv(monthlyRows);
		downloadBlob(
			csvBlob(csv),
			csvFilename(info.className, periodSlug(), kind === 'daily' ? 'harian' : 'bulanan')
		);
		toasts.success('File CSV diunduh.');
	}

	async function exportPdf() {
		const info = await metaInfo();
		const doc =
			kind === 'daily' ? buildDailyPdf(dailyRows, info) : buildMonthlyPdf(monthlyRows, info);
		doc.save(pdfFilename(info.className, periodSlug(), kind === 'daily' ? 'harian' : 'bulanan'));
		toasts.success('File PDF dibuat.');
	}

	async function shareReport(format: 'xlsx' | 'pdf') {
		const info = await metaInfo();
		const caption = buildTextRecap(
			summary ?? {
				className: info.className,
				periodLabel: info.periodLabel,
				present: 0,
				late: 0,
				permission: 0,
				sick: 0,
				absent: 0,
				total: 0,
				percentage: 0
			}
		);

		let blob: Blob;
		let filename: string;
		if (format === 'xlsx') {
			blob =
				kind === 'daily'
					? workbookToBlob(
							buildDailyWorkbook(dailyRows, {
								title: info.title,
								schoolName: info.schoolName,
								periodLabel: info.periodLabel
							})
						)
					: workbookToBlob(
							buildMonthlyWorkbook(monthlyRows, {
								title: info.title,
								schoolName: info.schoolName,
								periodLabel: info.periodLabel
							})
						);
			filename = excelFilename(
				info.className,
				periodSlug(),
				kind === 'daily' ? 'harian' : 'bulanan'
			);
		} else {
			const doc =
				kind === 'daily' ? buildDailyPdf(dailyRows, info) : buildMonthlyPdf(monthlyRows, info);
			blob = doc.output('blob');
			filename = pdfFilename(info.className, periodSlug(), kind === 'daily' ? 'harian' : 'bulanan');
		}

		const result = await shareFile(blob, filename, { title: info.title, text: caption });
		if (result.status === 'shared') toasts.success(result.message);
		else if (result.status === 'cancelled') toasts.info(result.message);
		else toasts.info(result.message);
	}

	async function shareSummaryText() {
		if (!summary) return;
		const text = buildTextRecap(summary);
		const result = await shareText(text, 'Rekap Absensi');
		if (result.status === 'shared') {
			toasts.success(result.message);
		} else if (result.status === 'unsupported') {
			const copied = await copyToClipboard(text);
			toasts.info(copied ? 'Rekap disalin ke clipboard.' : result.message);
		} else {
			toasts.info(result.message);
		}
	}

	const rowsAvailable = $derived(kind === 'daily' ? dailyRows.length : monthlyRows.length);
	const generatedAt = $derived(formatDateTime(new Date().toISOString()));
</script>

<PageHeader title="Laporan" description="Buat dan bagikan laporan kehadiran." />

<div class="card mb-4">
	<div class="flex gap-2">
		<button
			class="btn {kind === 'daily'
				? 'bg-brand-600 text-white'
				: 'border border-slate-300 dark:border-slate-700'}"
			onclick={() => (kind = 'daily')}>Harian</button
		>
		<button
			class="btn {kind === 'monthly'
				? 'bg-brand-600 text-white'
				: 'border border-slate-300 dark:border-slate-700'}"
			onclick={() => (kind = 'monthly')}>Bulanan</button
		>
	</div>

	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		<div>
			<label class="label" for="r-class">Kelas</label>
			<select id="r-class" bind:value={classId} class="input">
				<option value="">Semua Kelas</option>
				{#each classes as cls (cls.id)}
					<option value={cls.id}>{cls.name}</option>
				{/each}
			</select>
		</div>
		{#if kind === 'daily'}
			<div>
				<label class="label" for="r-date">Tanggal</label>
				<input id="r-date" type="date" bind:value={date} class="input" />
			</div>
		{:else}
			<div>
				<label class="label" for="r-month">Bulan</label>
				<input id="r-month" type="month" bind:value={month} class="input" />
			</div>
		{/if}
		<div class="flex items-end">
			<button class="btn-primary w-full" onclick={generate} disabled={generating}>
				{generating ? 'Membuat…' : 'Buat Laporan'}
			</button>
		</div>
	</div>
</div>

{#if loading}
	<Spinner />
{:else if !hasRun}
	<EmptyState icon="📊" title="Pilih periode" description="Atur filter lalu tekan Buat Laporan." />
{:else if rowsAvailable === 0}
	<EmptyState
		icon="📭"
		title="Tidak ada data"
		description="Tidak ada catatan absensi untuk periode yang dipilih."
	/>
{:else}
	{#if summary}
		<div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold text-brand-600">{summary.present}</p>
				<p class="text-[11px] text-slate-500">Hadir</p>
			</div>
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold text-amber-600">{summary.late}</p>
				<p class="text-[11px] text-slate-500">Terlambat</p>
			</div>
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold text-blue-600">{summary.permission}</p>
				<p class="text-[11px] text-slate-500">Izin</p>
			</div>
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold text-purple-600">{summary.sick}</p>
				<p class="text-[11px] text-slate-500">Sakit</p>
			</div>
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold text-red-600">{summary.absent}</p>
				<p class="text-[11px] text-slate-500">Alpa</p>
			</div>
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold">{summary.total}</p>
				<p class="text-[11px] text-slate-500">Total</p>
			</div>
			<div class="rounded-lg bg-white p-2 text-center shadow-sm dark:bg-slate-900">
				<p class="text-lg font-bold text-brand-600">{summary.percentage.toFixed(1)}%</p>
				<p class="text-[11px] text-slate-500">Kehadiran</p>
			</div>
		</div>
	{/if}

	<div class="card mb-4">
		<h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">Export & Bagikan</h3>
		<div class="mt-3 flex flex-wrap gap-2">
			<button class="btn-secondary" onclick={exportExcel}>⬇️ Excel (.xlsx)</button>
			<button class="btn-secondary" onclick={exportCsv}>⬇️ CSV</button>
			<button class="btn-secondary" onclick={exportPdf}>⬇️ PDF</button>
			<button class="btn-primary" onclick={() => shareReport('xlsx')}>📤 Bagikan Excel</button>
			<button class="btn-primary" onclick={() => shareReport('pdf')}>📤 Bagikan PDF</button>
			<button class="btn-secondary" onclick={shareSummaryText}>💬 Bagikan Rekap Teks</button>
		</div>
		<p class="mt-2 text-xs text-slate-500">
			Berbagi menggunakan menu berbagi perangkat (termasuk WhatsApp). Bila tidak didukung, file akan
			diunduh agar dapat dibagikan manual.
		</p>
	</div>

	<div class="card -mx-4 overflow-x-auto px-0 sm:mx-0">
		{#if kind === 'daily'}
			<table class="w-full min-w-[640px] text-sm">
				<thead>
					<tr
						class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
					>
						<th class="px-4 py-3">Tanggal</th>
						<th class="px-4 py-3">Kelas</th>
						<th class="px-4 py-3">NIS</th>
						<th class="px-4 py-3">Nama</th>
						<th class="px-4 py-3">Jam</th>
						<th class="px-4 py-3">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each dailyRows as row, i (i)}
						<tr class="border-b border-slate-100 dark:border-slate-800">
							<td class="px-4 py-2 whitespace-nowrap">{row.date}</td>
							<td class="px-4 py-2">{row.className}</td>
							<td class="px-4 py-2 tabular-nums">{row.nis}</td>
							<td class="px-4 py-2">{row.name}</td>
							<td class="px-4 py-2">{row.time}</td>
							<td class="px-4 py-2">{row.status}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<table class="w-full min-w-[640px] text-sm">
				<thead>
					<tr
						class="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"
					>
						<th class="px-4 py-3">No</th>
						<th class="px-4 py-3">NIS</th>
						<th class="px-4 py-3">Nama</th>
						<th class="px-4 py-3 text-center">H</th>
						<th class="px-4 py-3 text-center">T</th>
						<th class="px-4 py-3 text-center">I</th>
						<th class="px-4 py-3 text-center">S</th>
						<th class="px-4 py-3 text-center">A</th>
						<th class="px-4 py-3 text-right">%</th>
					</tr>
				</thead>
				<tbody>
					{#each monthlyRows as row, i (i)}
						<tr class="border-b border-slate-100 dark:border-slate-800">
							<td class="px-4 py-2 text-slate-400">{i + 1}</td>
							<td class="px-4 py-2 tabular-nums">{row.nis}</td>
							<td class="px-4 py-2 font-medium">{row.name}</td>
							<td class="px-4 py-2 text-center tabular-nums">{row.present}</td>
							<td class="px-4 py-2 text-center tabular-nums">{row.late}</td>
							<td class="px-4 py-2 text-center tabular-nums">{row.permission}</td>
							<td class="px-4 py-2 text-center tabular-nums">{row.sick}</td>
							<td class="px-4 py-2 text-center tabular-nums">{row.absent}</td>
							<td class="px-4 py-2 text-right tabular-nums">{row.percentage.toFixed(1)}%</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
	<p class="mt-2 text-xs text-slate-400">Dibuat: {generatedAt}</p>
{/if}
