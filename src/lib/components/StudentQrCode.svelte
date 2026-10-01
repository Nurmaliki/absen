<script lang="ts">
	import { renderStudentQrSvg } from '$lib/reports/qr';
	import type { Student } from '$lib/types';

	/**
	 * Renders a student's attendance QR code locally (no network).
	 *
	 * The SVG is generated imperatively via `@zxing/browser`'s writer and mounted into this
	 * container, which avoids `{@html}` for generated markup.
	 */

	interface Props {
		student: Pick<Student, 'id' | 'nis' | 'name'>;
		size?: number;
	}

	let { student, size = 160 }: Props = $props();
	let container = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!container) return;
		container.replaceChildren();
		const svg = renderStudentQrSvg(student, size);
		container.appendChild(svg);
		return () => container?.replaceChildren();
	});
</script>

<div class="inline-flex flex-col items-center gap-1">
	<div bind:this={container} class="rounded-lg bg-white p-2" aria-label="Kode QR absensi"></div>
	<p class="text-xs text-slate-500">{student.name} · {student.nis}</p>
</div>
