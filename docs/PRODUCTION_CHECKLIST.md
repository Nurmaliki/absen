# PRODUCTION CHECKLIST

Gunakan daftar ini sebelum merilis ke produksi. Tandai setiap item setelah **diverifikasi** pada
build produksi (bukan hanya dev).

> Status kolom menandakan apakah item sudah diverifikasi otomatis oleh build/test yang disertakan
> (`✅ otomatis` = tercakup oleh `npm run check` / `npm run test` / `npm run test:e2e` / `npm run build`),
> atau `⬜ manual` = memerlukan pengujian manual pada perangkat/browser nyata.

## Build & Validasi

- [ ] ✅ otomatis — `npm install` berhasil
- [ ] ✅ otomatis — `npm run check` berhasil tanpa error
- [ ] ✅ otomatis — `npm run test` lulus (unit + integration)
- [ ] ✅ otomatis — `npm run test:e2e` lulus (Chromium desktop + mobile emulation)
- [ ] ✅ otomatis — `npm run build` berhasil
- [ ] ⬜ manual — Deployment Vercel diuji dan berhasil
- [ ] ⬜ manual — HTTPS aktif pada domain produksi (Vercel otomatis)
- [ ] ⬜ manual — Tidak ada environment variable / serverless DB yang diperlukan

## Kamera & Wajah

- [ ] ⬜ manual — Kamera diuji pada perangkat nyata (HP & laptop)
- [ ] ⬜ manual — Pesan error kamera (ditolak, tidak ada, tidak terbaca) muncul dengan benar
- [ ] ⬜ manual — Model wajah tersedia secara offline setelah pemuatan pertama
- [ ] ⬜ manual — Registrasi wajah multi-sampel berhasil
- [ ] ⬜ manual — Pengenalan wajah berhasil pada siswa terdaftar
- [ ] ⬜ manual — Wajah tidak dikenali menampilkan opsi coba lagi & manual
- [ ] ⬜ manual — Beberapa wajah terdeteksi ditolak dengan pesan jelas
- [ ] ⬜ manual — Liveness/antispoof diuji (foto/tayangan ditolak)

## PWA & Offline

- [ ] ✅ otomatis — Service worker dihasilkan oleh build (`injectManifest`) dan tersalin ke `.vercel/output/static/service-worker.js`
- [ ] ✅ otomatis — Service worker terdaftar dan mengontrol halaman (`navigator.serviceWorker.controller`)
- [ ] ✅ otomatis — Aplikasi terbuka saat offline setelah sekali kunjungan online (uji CDP offline)
- [ ] ✅ otomatis — Data IndexedDB terbaca saat offline
- [ ] ⬜ manual — PWA dapat dipasang (installable)
- [ ] ⬜ manual — Setelah memuat online sekali: matikan internet → aplikasi tetap bisa dibuka
- [ ] ⬜ manual — Offline: data lokal dapat dilihat
- [ ] ⬜ manual — Offline: sesi absensi dapat dijalankan (dengan model sudah ter-cache)
- [ ] ⬜ manual — Offline: laporan/ekspor lokal berfungsi
- [ ] ⬜ manual — Refresh tidak menghilangkan data

## Data & IndexedDB

- [ ] ✅ otomatis — Migrasi skema v1 → v2 teruji dan tidak menghapus data
- [ ] ✅ otomatis — Anti-duplikat absensi teruji (termasuk race concurrent)
- [ ] ⬜ manual — Data bertahan setelah refresh & restart browser
- [ ] ⬜ manual — Penyimpanan persisten (`navigator.storage.persist`) diuji

## Laporan & Ekspor

- [ ] ⬜ manual — Ekspor XLSX terbuka benar di Excel/LibreOffice (tanggal/jam tidak rusak)
- [ ] ⬜ manual — Ekspor CSV terbuka benar (BOM/encoding nama Indonesia)
- [ ] ⬜ manual — Ekspor PDF tampil rapi (header, tabel, footer "Dibuat:")
- [ ] ✅ otomatis — Sanitasi formula-injection pada ekspor teruji
- [ ] ⬜ manual — Web Share diuji (termasuk file share ke WhatsApp pada perangkat yang mendukung)
- [ ] ⬜ manual — Fallback unduh + rekap teks saat share tidak didukung

## Backup & Restore

- [ ] ✅ otomatis — Serialisasi backup + round-trip teruji
- [ ] ✅ otomatis — Password salah ditolak
- [ ] ✅ otomatis — Backup korup ditolak (checksum)
- [ ] ✅ otomatis — Restore menggantikan data dengan benar
- [ ] ⬜ manual — Backup → reset → restore menghasilkan data ekuivalen pada perangkat nyata
- [ ] ⬜ manual — File backup sesuai format (`absensi-backup-YYYY-MM-DD.enc`)

## Keamanan & Privasi

- [ ] ✅ otomatis — PIN tidak disimpan plaintext (hash PBKDF2) — teruji
- [ ] ✅ otomatis — Backup tidak memuat password — teruji
- [ ] ⬜ manual — Notice privasi (`/privacy`) ditinjau oleh pihak yang berwenang
- [ ] ⬜ manual — Tidak ada data siswa/descriptor yang dikirim ke backend (verifikasi Network tab)
- [ ] ⬜ manual — Auto-lock & lock screen diuji pada perangkat nyata
- [ ] ⬜ manual — Konfirmasi operasi sensitif (hapus data, restore) diuji

## Responsif & Aksesibilitas

- [ ] ⬜ manual — Mobile diuji (bottom navigation)
- [ ] ⬜ manual — Tablet diuji
- [ ] ⬜ manual — Desktop diuji (sidebar)
- [ ] ⬜ manual — Navigasi keyboard berfungsi (fokus terlihat)
- [ ] ⬜ manual — Label form terhubung (`label for` / aria)
- [ ] ⬜ manual — Kontras warna memadai

## Recovery

- [ ] ⬜ manual — IndexedDB gagal dibuka → pesan + opsi buat ulang DB
- [ ] ⬜ manual — Model gagal dimuat → pesan actionable
- [ ] ⬜ manual — Storage penuh → peringatan tampil
- [ ] ⬜ manual — Refresh saat offline tidak crash

---

## Cara Menjalankan Verifikasi Otomatis

```bash
npm install
npm run check
npm run test
npm run test:e2e:install   # sekali saja
npm run test:e2e
npm run build
```

Semua perintah di atas harus keluar dengan status 0 sebelum menandai checklist build sebagai selesai.
