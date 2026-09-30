<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { APP_VERSION } from '$lib/backup/backup';
	import { appSettings } from '$lib/stores/app.svelte';
</script>

<PageHeader title="Privasi & Keamanan" description="Bagaimana data Anda disimpan dan digunakan." />

<div class="prose-sm max-w-3xl space-y-5 text-slate-700 dark:text-slate-300">
	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
			Data disimpan di perangkat Anda
		</h2>
		<p class="mt-2 text-sm">
			Seluruh data absensi — daftar kelas, siswa, template wajah, catatan kehadiran, dan pengaturan
			— disimpan <strong>secara lokal di perangkat ini</strong> menggunakan IndexedDB pada browser.
			Aplikasi <strong>tidak mengirim data siswa atau template wajah ke server aplikasi</strong>.
		</p>
		<p class="mt-2 text-sm">
			Aplikasi ini dirancang <em>local-first</em>: pembuatan laporan, pengenalan wajah, dan
			penyimpanan absensi semuanya berjalan di browser tanpa backend penyimpanan data.
		</p>
	</section>

	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
			Bagaimana template wajah digunakan
		</h2>
		<p class="mt-2 text-sm">
			Saat registrasi wajah, aplikasi menghasilkan <strong>descriptor</strong> — representasi matematis
			dari ciri wajah, bukan foto asli. Descriptor ini disimpan lokal dan hanya digunakan untuk mencocokkan
			wajah saat absensi. Foto mentah tidak disimpan secara permanen.
		</p>
		<p class="mt-2 text-sm">
			Deskriptor wajah bersifat biometrik. Meskipun bukan foto, perlakukan seperti data pribadi
			sensitif. Hapus descriptor siswa bila tidak lagi diperlukan melalui halaman siswa.
		</p>
	</section>

	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
			Backup adalah tanggung jawab operator
		</h2>
		<p class="mt-2 text-sm">
			Karena tidak ada server, <strong>tidak ada salinan cadangan otomatis</strong>. Backup
			terenkripsi harus dibuat manual dan disimpan di tempat yang aman. Password backup tidak
			disimpan di dalam file; bila lupa, backup tidak dapat dipulihkan.
		</p>
	</section>

	<section class="card border-amber-200 dark:border-amber-900/50">
		<h2 class="text-base font-semibold text-amber-800 dark:text-amber-200">
			Risiko kehilangan data
		</h2>
		<p class="mt-2 text-sm">
			Menghapus <strong>data situs/browser</strong>, membersihkan cache penyimpanan, atau memakai
			mode penyamaran dapat <strong>menghapus seluruh database lokal</strong> beserta absensi. Pastikan
			melakukan backup rutin.
		</p>
	</section>

	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
			Bagaimana data siswa dihapus
		</h2>
		<ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
			<li>Menghapus siswa akan menghapus data wajahnya dari perangkat ini.</li>
			<li>
				Menu "Hapus Semua Data" menghapus seluruh database lokal (perlu konfirmasi bertingkat).
			</li>
			<li>
				Tidak ada data yang tersisa di server manapun karena tidak ada server penyimpanan data.
			</li>
		</ul>
	</section>

	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
			Keterbatasan pengenalan wajah & liveness
		</h2>
		<ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
			<li>
				Pengenalan wajah bekerja secara probabilistik dan <strong>dapat salah</strong>. Selalu
				tersedia opsi absensi manual dan koreksi.
			</li>
			<li>
				Liveness/anti-spoof hanya mengurangi risiko sederhana (foto/tayangan), <strong
					>bukan jaminan mutlak</strong
				> terhadap serangan presentasi yang canggih.
			</li>
			<li>
				Sistem tidak membuat keputusan disipliner otomatis berdasarkan skor pengenalan. Status
				kehadiran tetap dikontrol oleh operator.
			</li>
		</ul>
	</section>

	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
			Keterbatasan penyimpanan browser
		</h2>
		<p class="mt-2 text-sm">
			Penyimpanan browser <strong>bukan secure enclave</strong>. Siapa pun yang memiliki akses fisik
			ke perangkat yang tidak terkunci, atau ekstensi browser berbahaya, berpotensi membaca data.
			Gunakan PIN perangkat, auto-lock aplikasi, dan jaga perangkat tetap aman.
		</p>
	</section>

	<section class="card">
		<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Akses kamera</h2>
		<p class="mt-2 text-sm">
			Kamera hanya aktif saat Anda membuka sesi absensi atau registrasi wajah. Frame diproses di
			memori perangkat dan tidak diunggah. Akses kamera memerlukan HTTPS atau localhost.
		</p>
	</section>

	<p class="text-xs text-slate-400">
		Versi aplikasi {APP_VERSION} · {appSettings.value.schoolName || 'Sekolah'}
	</p>
</div>
