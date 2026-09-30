# SECURITY.md — Model Ancaman & Kontrol Keamanan

Dokumen ini menjelaskan model ancaman sistem Absensi Wajah Siswa dan kontrol keamanan yang
diterapkan. Sistem ini **local-first**: tidak ada server penyimpanan data, sehingga sebagian besar
permukaan serangan bergeser dari server ke **perangkat pengguna**.

> **Pernyataan penting:** Penyimpanan browser (IndexedDB, localStorage, cache service worker)
> **bukan** secure enclave dan **bukan** penyimpanan terenkripsi pada tingkat OS. Siapa pun dengan
> akses fisik ke perangkat yang tidak terkunci, izin cukup pada profil browser, akses ke profil
> browser, atau ekstensi berbahaya **dapat** membaca data. Kontrol di bawah ini mengurangi risiko
> akses kasual; mereka tidak menjamin kerahasiaan terhadap penyerang yang gigih.

---

## 1. Model Ancaman

### Aset yang dilindungi

1. **Data siswa** (nama, NIS/NISN, kelas) — data pribadi.
2. **Descriptor wajah** (`faceTemplates`) — data biometrik sensitif.
3. **Catatan absensi** (`attendanceRecords`) — catatan kehadiran resmi.
4. **Kredensial admin** (PIN hash) dan **backup terenkripsi**.
5. **Integritas data** (tidak boleh diubah tanpa jejak — dijaga oleh audit log).

### Aktor ancaman & skenario

| Aktor                                | Skenario                                                      | Relevansi      |
| ------------------------------------ | ------------------------------------------------------------- | -------------- |
| Pengguna iseng                       | Membuka devtools dan membaca IndexedDB saat perangkat terbuka | Sedang         |
| Siswa/operator nakal                 | Mengubah status absensi orang lain                            | Sedang         |
| Penyerang dengan akses fisik         | Membaca/menyalin profil browser dari disk                     | Tinggi         |
| Ekstensi browser berbahaya           | Membaca IndexedDB / mengaitkan DOM                            | Sedang         |
| Penyerang jaringan                   | Mengubah aset yang dimuat dari origin                         | Rendah (HTTPS) |
| Supply chain                         | Dependensi berbahaya                                          | Sedang         |
| Serangan presentasi (spoofing wajah) | Foto/tayangan untuk menipu pengenalan                         | Tinggi         |

### Di luar cakupan

- Perlindungan terhadap penyerang dengan hak root/kernel pada perangkat.
- Perlindungan terhadap firmware/OS yang sudah terkompromi.
- Jaminan PAD (Presentation Attack Detection) bersertifikasi.
- Kerahasiaan terhadap pengguna yang memiliki password backup dan akses ke file backup.

---

## 2. Eksposur Data Lokal

- **IndexedDB tidak terenkripsi oleh aplikasi.** Data tersimpan dalam bentuk yang dapat dibaca
  oleh kode same-origin. PIN tidak dienkripsi, melainkan disimpan sebagai hash.
- **Descriptor wajah** disimpan sebagai array angka. Ini adalah data biometrik — perlakukan
  sebagai data pribadi sensitif dan hapus bila tidak diperlukan.
- **Foto mentah tidak disimpan.** Hanya descriptor yang dipersistensikan.
- **Mitigasi:** auto-lock + lock screen, PIN admin, sesi tertutup saat idle, dan konfirmasi untuk
  operasi sensitif. Dokumentasikan kepada pengguna bahwa keamanan bergantung pada keamanan
  perangkat itu sendiri (mis. PIN perangkat).

---

## 3. Perlindungan Template Biometrik

- Descriptor wajah disimpan lokal; **tidak** dikirim ke API pihak ketiga atau layanan cloud.
- Tidak ada klaim bahwa descriptor tidak dapat dibalik menjadi wajah. Model embedding umumnya
  tidak sepenuhnya non-invertible; ini adalah risiko residual yang diterima untuk kegunaan sekolah.
- Penghapusan siswa atau "Daftar Ulang" mengganti template; tidak menyimpan riwayat templat lama.
- Untuk menghapus semua biometrik: hapus siswa bersangkutan, atau "Hapus Semua Data".

---

## 4. PIN Admin

- PIN **tidak** disimpan plaintext. Disimpan sebagai **PBKDF2-SHA256**, 210.000 iterasi, dengan
  salt acak 16 byte per kredensial.
- Verifikasi memakai perbandingan waktu-konstan.
- **Batasan:** PIN pendek dapat di-brute-force offline bila penyerang menyalin hash dari profil
  browser. Kekuatan PIN bergantung pada panjangnya; ini bukan pengganti autentikasi perangkat keras.
- Disarankan: PIN perangkat yang kuat + auto-lock aplikasi singkat.

---

## 5. Enkripsi & Integritas Backup

- Backup dienkripsi **AES-GCM-256**. Kunci diturunkan dari password operator via **PBKDF2-SHA256**
  (210.000 iterasi, salt acak 16 byte). IV acak 12 byte per backup.
- **Checksum SHA-256** atas plaintext disimpan di file; restore menolak file bila checksum tidak
  cocok (deteksi korupsi/tampering sebelum menulis ke database).
- Password backup **tidak** disimpan di dalam file.
- **Batasan:** restore bergantung pada kualitas password. Password lemah dapat di-brute-force
  offline. Backup adalah tanggung jawab operator; tidak ada salinan otomatis.

---

## 6. XSS

- Svelte melakukan auto-escaping pada interpolasi (`{value}`). Proyek **tidak** menggunakan `{@html}`
  pada data yang berasal dari pengguna/impor.
- Data yang ditampilkan (nama siswa hasil impor, catatan) di-render sebagai teks, bukan HTML.
- **CSP:** aplikasi tidak menyetel header CSP ketat secara default karena bergantung pada aset
  runtime model (WASM/WebGL) dan inline style yang dibutuhkan Tailwind/SvelteKit. Untuk deployment
  yang diperketat, konfigurasikan CSP melalui `svelte.config.js` (`kit.csp`) atau header di
  `vercel.json`, dengan tetap mengizinkan `wasm-unsafe-eval`, `blob:` (untuk Web Worker model), dan
  `worker-src`.
- **Rekomendasi:** untuk lingkungan yang sangat terkontrol, aktifkan CSP berbasis nonce SvelteKit dan
  uji ulang pemuatan model.

---

## 7. Risiko Dependensi & Supply Chain

- Dependensi utama: `@vladmandic/human`, `dexie`, `xlsx`, `jspdf`, `jspdf-autotable`, `@zxing/browser`.
- **Catatan `xlsx`:** versi di npm registry (0.18.5) memiliki riwayat CVE (prototype pollution /
  ReDoS). Aplikasi memitigasi dengan **membatasi ukuran impor** (maksimum 5000 baris) dan hanya
  memproses file dari operator. Untuk lingkungan berisiko tinggi, pertimbangkan memasang SheetJS
  dari distribusi resmi mereka (`https://cdn.sheetjs.com`) dan pin versi.
- Jalankan `npm audit` secara berkala. Perbarui dependensi dengan hati-hati dan uji ulang.
- Model wajah adalah aset biner yang dikomit; verifikasi sumbernya saat memperbarui.

---

## 8. Izin Kamera

- Kamera hanya aktif saat pengguna membuka registrasi wajah atau sesi absensi.
- Frame diproses di memori; **tidak diunggah**.
- Aplikasi menangani semua error `getUserMedia` (`NotAllowedError`, `NotFoundError`,
  `NotReadableError`, `OverconstrainedError`, `SecurityError`, `NotSupportedError`) dengan pesan
  yang dapat ditindaklanjuti.
- Akses kamera memerlukan HTTPS/localhost (kebijakan browser).

---

## 9. Impor Backup Berbahaya

- Backup divalidasi berlapis: **parse JSON → cek versi → dekripsi → verifikasi checksum → validasi
  skema (setiap tabel harus array) → deteksi data yatim → pratinjau**.
- Restore berjalan dalam **satu transaksi** Dexie; kegagalan menggulung balik dan **tidak**
  menghapus data lama sebelum validasi selesai.
- Restore menggantikan seluruh data — ditawarkan membuat backup kondisi terkini terlebih dahulu.
- Gagal dekripsi (password salah) atau checksum tidak cocok → restore dibatalkan.

---

## 10. Prototype Pollution

- Tidak ada `Object.assign`/merge mendalam atas objek yang berasal dari file pengguna tanpa validasi.
- Payload backup divalidasi berdasarkan tipe per-field; array di-assert sebelum digunakan.
- Sebaiknya hindari `JSON.parse` langsung ke model aplikasi tanpa pemeriksaan (sudah diterapkan).

---

## 11. Validasi File Impor

- Impor siswa divalidasi baris per baris: NIS/nama/kelas wajib, deteksi duplikat di dalam file dan
  terhadap database, dan pemetaan kelas harus ada.
- **Tidak ada** baris invalid yang ditulis ke database; pengguna melihat pratinjau dengan error
  per-baris sebelum konfirmasi.
- **DoS via impor besar:** dibatasi `MAX_IMPORT_ROWS = 5000`.

---

## 12. Formula Injection (CSV/XLSX)

- Sel yang diawali `=`, `+`, `-`, `@`, TAB, atau CR disanitasi dengan prefiks apostrof (`'`) sebelum
  ditulis ke CSV/XLSX.
- CSV memakai BOM UTF-8 dan quoting RFC4180; CRLF untuk interoperabilitas Excel.
- Sanitasi diterapkan pada header maupun baris.

---

## 13. Denial-of-Service

- Impor dibatasi jumlah baris.
- Proses frame dibatasi (~8 FPS) dan hanya terhadap kelas terpilih.
- Pemuatan model dapat gagal pada perangkat berspesifikasi rendah; kesalahan ditangani dengan pesan
  yang dapat ditindaklanjuti dan tidak membuat aplikasi crash total.

---

## 14. Akses Fisik

- Jika penyerang memiliki perangkat yang terbuka, mereka dapat membuka IndexedDB. Mitigasi terbaik
  adalah **kunci perangkat** dan **auto-lock aplikasi**.
- Backup harus disimpan di lokasi terenkripsi (mis. cloud pribadi dengan 2FA), bukan di folder
  publik.

---

## 15. Integritas & Audit

- Setiap perubahan penting (membuat/mengubah/menonaktifkan siswa, registrasi wajah, absensi,
  koreksi, penghapusan, backup, restore, perubahan pengaturan) dicatat di `auditLogs`.
- Audit log adalah _append-only_ dari sisi aplikasi (tidak ada UI untuk menyuntingnya), tetapi dapat
  dimodifikasi dengan akses langsung ke IndexedDB. Ini adalah batas jujur dari sistem local-first.

---

## 16. Contoh Aktivasi CSP (opsional, lanjutan)

Jika ingin memperketat, tambahkan di `svelte.config.js`:

```js
kit: {
  csp: {
    directives: {
      'default-src': ['self'],
      'script-src': ['self', 'wasm-unsafe-eval', 'blob:'],
      'worker-src': ['self', 'blob:'],
      'img-src': ['self', 'data:', 'blob:'],
      'connect-src': ['self', 'blob:'],
      'style-src': ['self', 'unsafe-inline']
    }
  }
}
```

Uji ulang pemuatan model wajah dan operasi kamera setelah mengaktifkan CSP.

---

## Ringkasan Kontrol

| Kontrol                            | Status                       |
| ---------------------------------- | ---------------------------- |
| PIN hashed (PBKDF2, salt, iterasi) | ✅                           |
| Perbandingan waktu-konstan         | ✅                           |
| Backup terenkripsi AES-GCM         | ✅                           |
| Checksum integritas backup         | ✅                           |
| Validasi skema backup berlapis     | ✅                           |
| Restore transaksional (rollback)   | ✅                           |
| Sanitasi formula injection         | ✅                           |
| Batas ukuran impor                 | ✅                           |
| Penanganan error kamera lengkap    | ✅                           |
| Audit log lengkap                  | ✅                           |
| Auto-lock + lock screen            | ✅                           |
| Tanpa transmisi data ke server     | ✅                           |
| CSP ketat                          | ⚠️ Opsional (lihat §16)      |
| Verifikasi versi `xlsx`            | ⚠️ Perhatikan CVE (lihat §7) |
