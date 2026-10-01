# Absensi Wajah Siswa

Sistem absensi siswa berbasis **pengenalan wajah** yang **local-first**, **offline-first**,
dan **privacy-first**. Tidak ada database server, tidak ada backend penyimpanan data — semua
data operasional disimpan di perangkat pengguna melalui IndexedDB, dan pengenalan wajah berjalan
sepenuhnya di browser.

Aplikasi dapat di-deploy ke **Vercel**, tetapi Vercel hanya berfungsi sebagai hosting aset
aplikasi. Tidak ada serverless function yang dipakai sebagai database.

---

## Project Overview

- **SvelteKit + TypeScript + Tailwind CSS** (PWA).
- **IndexedDB + Dexie.js** untuk seluruh data (kelas, siswa, template wajah, sesi, absensi, audit).
- **@vladmandic/human** untuk deteksi & pengenalan wajah di browser (model di-host sendiri di
  `static/models`, sehingga dapat bekerja offline setelah dimuat).
- **SheetJS/xlsx**, **jsPDF + autotable** untuk ekspor Excel & PDF; CSV dibuat secara manual
  dengan BOM UTF-8.
- **Web Share API** untuk membagikan laporan (termasuk ke WhatsApp melalui share sheet OS).
- **Web Crypto API** untuk PIN admin (PBKDF2) dan enkripsi backup (AES-GCM).

Fitur utama: master kelas, master siswa (termasuk impor XLSX/CSV), registrasi wajah multi-sampel,
sesi absensi real-time, anti-duplikat, izin/sakit/alpa, koreksi manual + audit log, dashboard,
riwayat, laporan harian/bulanan, ekspor, backup/restore terenkripsi, PWA offline, dan halaman privasi.

---

## Requirements

- **Node.js** 24 direkomendasikan; 22/24 didukung adapter Vercel, tetapi dependensi QR
  (`@zxing/library` via `@zxing/browser`) mensyaratkan Node ≥ 24, sehingga deployment dipatok ke
  `runtime: 'nodejs24.x'` di `svelte.config.js` dan `package.json` memakai
  `"engines": { "node": ">=24 <27" }`. Node yang lebih baru (mis. 26) tetap dapat dipakai untuk
  build lokal karena runtime deployment sudah dipatok.
- **npm** 10+.
- Browser modern dengan IndexedDB, Web Crypto, dan `getUserMedia` (Chrome, Edge, Safari, Firefox
  terbaru).
- **HTTPS atau localhost** untuk akses kamera dan Web Crypto.

---

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Buka `http://localhost:5173`. Saat pertama kali dijalankan, Anda akan diminta menyelesaikan wizard
onboarding (nama sekolah, tahun ajaran, semester, jam masuk, batas keterlambatan, PIN admin).

> Catatan: fitur kamera & Web Crypto memerlukan secure context. `localhost` sudah dianggap secure,
> jadi pengembangan lokal berfungsi. Untuk menguji dari perangkat lain di jaringan, gunakan HTTPS.

## Testing

```bash
# Unit / integration tests (Vitest, jsdom + fake-indexeddb)
npm run test

# End-to-end tests (Playwright)
npm run test:e2e:install   # sekali saja: unduh browser
npm run test:e2e
```

Cakupan unit: aturan absensi (present/late), anti-duplikat, agregasi laporan, validasi impor,
serialisasi backup, validasi restore, migrasi skema, penilaian kualitas wajah, matcher, kriptografi,
sanitasi spreadsheet, penanganan waktu, adapater & core mesin wajah, engine Web Worker, payload QR,
sinkronisasi antar-tab, dan taksonomi error penyimpanan.

Cakupan E2E: onboarding, master kelas/siswa, impor, sesi absensi, duplikat, absensi manual, koreksi,
tutup sesi, laporan, backup, restore, PIN lock, offline banner, kamera ditolak, reset, mode kios,
kartu QR, dan pemindai QR.

> Catatan E2E pada mesin ber-RAM kecil: alih-alih membiarkan Playwright melakukan build+preview
> sendiri (yang bisa OOM di tengah jalan), jalankan `npm run build` lalu
> `npm run preview -- --port 4173`, kemudian `PW_REUSE_SERVER=1 npx playwright test`.

## Build

```bash
npm run check   # svelte-check, harus 0 error
npm run build   # build produksi + service worker PWA
npm run preview # pratinjau hasil build
```

---

## Deployment to Vercel

1. Push repository ke Git.
2. Impor project di Vercel.
3. Build command: `npm run build`. Output dikelola otomatis oleh `@sveltejs/adapter-vercel`.
4. Deploy. **Tidak ada environment variable atau database yang diperlukan.**

Vercel hanya menyajikan aset aplikasi. Semua data absensi tersimpan di browser pengguna, bukan di
filesystem Vercel dan bukan di serverless function.

### Deploy via CLI

```bash
npm i -g vercel
vercel
vercel --prod
```

---

## PWA

Aplikasi adalah PWA dengan service worker (Workbox, strategi `injectManifest`) yang:

- Precache application shell (JS, CSS, ikon, font, manifest).
- Runtime-cache model wajah (`/models/*`) dengan `CacheFirst`.
- Runtime-cache halaman (dokumen HTML) dengan `NetworkFirst` agar halaman yang pernah dibuka dapat
  dibuka kembali saat offline.
- Menyediakan halaman fallback `/offline`.

Source service worker berada di `src/service-worker.ts`. Strategi `injectManifest` (bukan
`generateSW`) dipilih karena SvelteKit membundel file tersebut ke output `client/` **sebelum**
`adapter-vercel` menyalinnya ke `.vercel/output/static/`. Dengan `generateSW`, file service worker
yang dihasilkan plugin tidak ikut terdeploy (ditulis setelah adapter selesai), sehingga
registrasi gagal dengan `404`/`ERR_FAILED`. Registrasi dilakukan lewat `virtual:pwa-register`
(lihat `PwaUpdatePrompt.svelte`); auto-registrasi bawaan SvelteKit dimatikan
(`kit.serviceWorker.register: false`) agar tidak ada dua service worker.

**Service worker bukan database.** Cache menyimpan _aset_; data aplikasi tetap di IndexedDB.

### Memverifikasi perilaku offline

Uji offline tidak boleh memakai `context.setOffline(true)` bawaan Playwright: helper tersebut
membuat navigasi top-level gagal dengan `net::ERR_FAILED` meskipun ada service worker yang dapat
melayaninya. Uji E2E memakai fixture `setOffline` yang mengemulasi kondisi jaringan lewat CDP
(`Network.emulateNetworkConditions`), sehingga service worker benar-benar menyajikan shell dari
cache — meniru putusnya jaringan yang sesungguhnya. Lihat `tests/e2e/offline.spec.ts`.

---

## Face Models

Model di-host di `static/models` dan disalin dari paket `@vladmandic/human`:

| File          | Kegunaan                          |
| ------------- | --------------------------------- |
| `blazeface.*` | Deteksi wajah                     |
| `facemesh.*`  | Landmark wajah                    |
| `faceres.*`   | Embedding / descriptor pengenalan |
| `antispoof.*` | Sinyal liveness pasif             |

Untuk memperbarui model, salin ulang dari `node_modules/@vladmandic/human/models/`.

### Catatan penting: konfigurasi engine Human

Dua hal krusial di `src/lib/face/adapter.ts` (`HumanFaceEngine`) — keduanya pernah menyebabkan
gejala "model tidak pernah selesai dimuat / progres 0%":

1. **Semua model yang bobotnya tidak kita sertakan harus dinonaktifkan secara eksplisit.**
   Human akan mencoba memuat _setiap_ model yang berstatus `enabled` (default-nya termasuk
   `emotion`, `iris`, `hand`, `body`, …). Bila file bobotnya tidak ada, seluruh proses `load()`
   gagal dengan error samar `Cannot read properties of undefined (reading 'inputs')`. Karena itu
   `iris`, `emotion`, `liveness`, `body`, `hand`, `gesture`, `object`, dan `segmentation`
   di-set `enabled: false`.

2. **Kesiapan dibaca dari properti `state`, bukan method `ready()`.** Human 3.3.x mengekspos
   status sebagai string (`'config' | 'check' | 'backend' | 'load' | 'run:<model>' | 'idle'`)
   dan **tidak** memiliki method `ready()`. Adapter menandai siap setelah `load()` sukses
   (flag internal `loaded`), sehingga `isReady()` benar-benar mengembalikan `true`.

Selain itu, inisialisasi mencoba beberapa backend secara berurutan: **`webgl` → `wasm` → `cpu`**,
agar tetap berfungsi di perangkat/browser tanpa WebGL (headless, GPU terkunci, sebagian perangkat
mobile). Ada uji regresi di `tests/unit/face-adapter.test.ts` yang mengunci perilaku ini.

Model dimuat secara **lazy** saat kamera pertama kali digunakan, dan di-cache oleh service worker
setelah dimuat, sehingga operasi berikutnya dapat berjalan offline.

---

## Browser Support

| Browser                           | Dukungan                                             |
| --------------------------------- | ---------------------------------------------------- |
| Chrome / Edge (desktop & Android) | Penuh                                                |
| Safari (macOS & iOS)              | Penuh (Web Share sangat baik di iOS)                 |
| Firefox                           | Penuh (file share sheet terbatas; fallback ke unduh) |

Fitur yang bergantung pada browser dan selalu ditangani secara graceful: Web Share, `navigator.storage.estimate`,
`navigator.storage.persist`, dan pemilihan perangkat kamera.

---

## Camera Permission

Kamera memerlukan izin pengguna dan secure context (HTTPS/localhost). Bila akses ditolak atau gagal,
aplikasi menampilkan pesan yang dapat ditindaklanjuti (mis. _"Akses kamera ditolak. Aktifkan izin
kamera pada pengaturan browser kemudian coba kembali."_).

> Anda **harus** mengakses aplikasi melalui HTTPS di produksi. Vercel menyediakan HTTPS otomatis.

---

## IndexedDB

Database `absensi-wajah` dikelola dengan Dexie, dengan versioning dan migration. Tabel:
`classes`, `students`, `faceTemplates`, `attendanceSessions`, `attendanceRecords`, `teachers`,
`settings`, `auditLogs`.

Aturan penting: **1 siswa + 1 sesi = maksimal 1 catatan absensi**, ditegakkan di lapisan data
(index `[sessionId+studentId]`) di dalam transaksi.

> **PERINGATAN PENTING:** Menghapus **data situs/browser**, membersihkan penyimpanan, atau memakai
> mode penyamaran akan **menghapus seluruh database lokal** beserta seluruh data absensi. Tidak ada
> server yang menyimpan salinan. **Lakukan backup rutin.**

---

## Backup

Menu **Pengaturan → Backup & Restore → Buat Backup**. Backup:

- Mencakup kelas, siswa, template wajah, sesi, catatan absensi, pengaturan, dan log audit.
- Dienkripsi dengan **AES-GCM**, kunci diturunkan dari password Anda (PBKDF2-SHA256, 210.000 iterasi).
- Memuat **checksum** plaintext (SHA-256) untuk verifikasi integritas.
- Memakai format ber-versi (`backupVersion`).
- Password **tidak** disimpan di dalam file. Bila lupa password, backup **tidak dapat dipulihkan**.

Nama file: `absensi-backup-YYYY-MM-DD.enc`.

## Restore

Alur restore: **Pilih file → Password → Dekripsi → Validasi skema → Cek versi → Pratinjau →
Konfirmasi → Restore dalam transaksi**.

- Database lama **tidak** dihapus sebelum backup baru tervalidasi.
- Restore dilakukan dalam satu transaksi Dexie (rollback bila gagal).
- Restore akan **menggantikan seluruh data saat ini** — disarankan membuat backup kondisi saat ini
  terlebih dahulu.

---

## Security

Lihat [`docs/SECURITY.md`](docs/SECURITY.md) untuk threat model lengkap. Ringkas:

- PIN admin disimpan sebagai hash PBKDF2 + salt acak (bukan plaintext).
- Backup terenkripsi AES-GCM dengan checksum integritas.
- Sanitasi formula-injection pada ekspor CSV/XLSX.
- Auto-lock, lock screen, dan konfirmasi pada operasi sensitif.

Aplikasi ini **tidak** mengklaim keamanan tingkat secure enclave. Penyimpanan browser dapat dibaca
oleh pihak yang memiliki akses fisik ke perangkat atau ekstensi berbahaya.

---

## Privacy

Lihat halaman **`/privacy`** di dalam aplikasi. Pokok-pokoknya:

- Data disimpan di perangkat; tidak dikirim ke server aplikasi.
- Foto mentah tidak disimpan permanen; hanya **descriptor** wajah (biometrik) yang disimpan lokal.
- Backup adalah tanggung jawab operator.
- Penghapusan data browser dapat menghapus database lokal.
- Pengenalan wajah & liveness bersifat probabilistik dan **tidak sempurna**.

---

## Known Limitations

- **Backup & data lokal**: tidak ada sinkronisasi multi-perangkat; setiap perangkat punya datanya sendiri.
- **Liveness**: challenge-response (kedip) + antispoof pasif mengurangi spoofing sederhana, tetapi
  **bukan** jaminan terhadap serangan presentasi canggih.
- **Akurasi wajah**: bergantung cahaya, sudut, dan kualitas kamera. Ambang batas dapat dikonfigurasi.
- **Web Share**: file sharing tidak tersedia di semua browser; aplikasi otomatis beralih ke unduh.
- **Performa**: pengenalan wajah dibatasi ~8 FPS dan dicocokkan hanya terhadap kelas yang dipilih.
  Perangkat kelas bawah mungkin terasa lebih lambat.
- **PIN**: melindungi dari akses kasual, bukan dari penyerang dengan akses perangkat/OS.
- Model wajah berukuran beberapa MB, sehingga pemuatan pertama memerlukan waktu dan bandwidth.

---

## Troubleshooting

| Masalah                                  | Solusi                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "Akses kamera ditolak"                   | Aktifkan izin kamera di pengaturan browser, muat ulang, lalu coba lagi. Pastikan akses via HTTPS/localhost.                          |
| Kamera tidak muncul / hitam              | Tutup aplikasi lain yang memakai kamera. Coba pilih kamera lain di Pengaturan → Kamera.                                              |
| Wajah tidak dikenali                     | Perbaiki pencahayaan, dekatkan wajah, atau turunkan sedikit ambang batas pengenalan di Pengaturan. Daftarkan ulang wajah bila perlu. |
| Pencahayaan kurang                       | Pindah ke tempat lebih terang. Aplikasi akan memberi tahu bila kualitas frame buruk.                                                 |
| Web Crypto tidak tersedia                | Buka aplikasi melalui HTTPS atau localhost (bukan IP biasa).                                                                         |
| Data hilang setelah membersihkan browser | Data lokal memang terhapus. Pulihkan dari backup terakhir.                                                                           |
| Backup tidak dapat didekripsi            | Password salah atau file rusak; checksum akan menolaknya.                                                                            |
| Penyimpanan penuh                        | Lakukan backup, lalu hapus data lama. Minta penyimpanan permanen di Pengaturan.                                                      |
| Halaman offline tidak muncul             | Buka aplikasi saat online setidaknya sekali agar service worker & aset ter-cache.                                                    |

---

## Arsitektur Singkat

```text
SvelteKit PWA (Vercel hosting)
   |
   +-- Application Shell (+layout, navigasi)
   +-- Camera  -> Deteksi -> Quality Gate -> Liveness -> Descriptor -> Matching
   |      (inferensi dijalankan di Web Worker agar UI tidak tersendat)
   +-- Attendance Engine (aturan present/late, anti-duplikat, audit)
   +-- IndexedDB (Dexie)  -> data utama  <---- BroadcastChannel (sinkron antar-tab)
   +-- Reporting Engine   -> XLSX / CSV / PDF
   +-- Backup Engine      -> AES-GCM terenkripsi
   +-- QR Fallback        -> @zxing/browser (baca & tulis kode QR)
   +-- Web Share API      -> WhatsApp / Email / aplikasi lain
```

Business logic dipisahkan dari komponen Svelte: aturan absensi (`$lib/attendance`), akses data
(`$lib/db`), mesin wajah (`$lib/face`), laporan (`$lib/reports`), backup (`$lib/backup`), dan
keamanan (`$lib/security`).

---

## Pemrosesan Wajah di Web Worker

Inferensi TFJS berjalan di **Web Worker** (`src/lib/face/face.worker.ts`) sehingga thread utama
tetap bebas untuk render, input, dan frame kamera. Ini penting agar UI tidak tersendat di
perangkat kelas ber-RAM kecil.

- Sumber frame dikirim sebagai `ImageBitmap` (transferable) — tidak menyalin piksel.
- `compare()` (jarak vektor 1024-dimensi) tetap di thread utama karena lebih cepat daripada
  bolak-balik ke worker.
- Mesin yang sama (`HumanEngineCore` di `src/lib/face/core.ts`) dipakai baik oleh worker maupun
  fallback thread utama (`HumanFaceEngine`), sehingga perilaku identik.
- Mode dapat dipaksa dari **Pengaturan → Pemrosesan Wajah** (`auto` / `worker` / `main`) untuk
  troubleshooting. Browser tanpa `Worker` + `OffscreenCanvas` otomatis memakai thread utama.
- Bila model gagal dimuat (mis. berkas `/models` tidak tersedia saat deploy), UI menampilkan
  pesan spesifik beserta tombol **Coba Lagi** alih-alih berhenti di "Memuat model…" selamanya.

## Sinkronisasi Antar-Tab

IndexedDB dibagikan antar tab pada origin yang sama, tetapi state di memori tidak. Aplikasi
mengirim sinyal perubahan melalui `BroadcastChannel` (`src/lib/db/sync.ts`) dan setiap tab
membaca ulang data yang terpengaruh:

- Perubahan absensi di satu tab langsung tercermin di tab lain.
- Perubahan pengaturan disinkronkan otomatis.
- `data:reset` / `data:restored` memuat ulang tab lain agar tidak memakai data basi.

Bila `BroadcastChannel` tidak tersedia (browser lama, mode privat), aplikasi tetap berjalan
normal per-tab.

## Ketahanan Penyimpanan (Quota & Blocked)

Aplikasi menerjemahkan error IndexedDB menjadi pesan yang bisa ditindaklanjuti
(`src/lib/db/errors.ts`):

- **Quota penuh** (`QuotaExceededError`) → saran membuat backup lalu menghapus data lama.
- **Upgrade terblokir** (`blocked`) → banner "tutup tab lain lalu muat ulang".
- **Database hilang** (`versionchange`) → muat ulang otomatis.

Penulisan berisiko (tambah siswa, absensi, template wajah) dibungkus `withStorageGuards()`.

## Mode Kios

Untuk tablet di depan kelas: tombol **Mode Kios** di halaman Absensi menyembunyikan sidebar &
navigasi bawah serta meminta layar penuh (best-effort), sehingga hanya kamera, daftar siswa, dan
penghitung yang terlihat. Keluar dengan **Keluar Kios** atau tombol Esc (sinkron via
`fullscreenchange`).

## Cadangan QR (Fallback Absensi)

Bila pengenalan wajah gagal atau siswa belum punya wajah terdaftar, absensi dapat dicatat lewat
**kartu QR**:

- Kartu QR dibuat lokal (`@zxing/browser`) di halaman registrasi wajah siswa — tidak ada data
  yang dikirim ke mana pun. Tombol **Cetak Kartu** membuka jendela cetak.
- Pemindai QR (`QrScanner.svelte`) tersedia pada mode **Kartu QR** di halaman Absensi.
- Format payload `ABSEN:<id>:<nis>` divalidasi ketat; kode QR lain (poster, tautan) diabaikan,
  sehingga tidak bisa mencatat absensi palsu.

---

## Scripts

| Perintah           | Fungsi                   |
| ------------------ | ------------------------ |
| `npm run dev`      | Server pengembangan      |
| `npm run build`    | Build produksi           |
| `npm run preview`  | Pratinjau build produksi |
| `npm run check`    | Type-check Svelte/TS     |
| `npm run test`     | Unit test (Vitest)       |
| `npm run test:e2e` | E2E test (Playwright)    |
| `npm run format`   | Format dengan Prettier   |
