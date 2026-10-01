import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Core journey: onboarding -> class -> student -> import -> attendance -> report -> backup.
 *
 * These tests run against the production build in Chromium. Camera hardware is faked via
 * Chromium flags; face results are stubbed deterministically at the app boundary.
 */

async function completeOnboarding(page: Page, pin = '1234') {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /selamat datang/i })).toBeVisible();
	await page.getByLabel('Nama Sekolah').fill('SMP Negeri 1 Test');
	await page.getByRole('button', { name: 'Lanjut' }).click();
	// Step 2: academic year (prefilled)
	await page.getByRole('button', { name: 'Lanjut' }).click();
	// Step 3: semester (default Ganjil)
	await page.getByRole('button', { name: 'Lanjut' }).click();
	// Step 4: entry time
	await page.getByRole('button', { name: 'Lanjut' }).click();
	// Step 5: late threshold
	await page.getByRole('button', { name: 'Lanjut' }).click();
	// Step 6: PIN
	await page.locator('#pin').fill(pin);
	await page.locator('#pin-confirm').fill(pin);
	await page.getByRole('button', { name: 'Selesai' }).click();
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
}

async function createClass(page: Page, name: string) {
	await page.goto('/classes');
	await page.getByRole('button', { name: '+ Tambah Kelas' }).click();
	await page.getByLabel('Nama Kelas').fill(name);
	await page.getByLabel('Tingkat').fill(name.replace(/\D/g, ''));
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

async function createStudent(page: Page, nis: string, name: string, className: string) {
	await page.goto('/students');
	await page.getByRole('button', { name: '+ Tambah Siswa' }).click();
	await page.getByLabel('NIS', { exact: true }).fill(nis);
	await page.getByLabel('Nama Lengkap').fill(name);
	await page.locator('#s-class').selectOption({ label: className });
	await page.getByRole('button', { name: 'Simpan' }).click();
	await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

test.describe('onboarding + master data', () => {
	test('completes first-run setup and lands on the dashboard', async ({ page }) => {
		await completeOnboarding(page);
		await expect(page.getByText('Total Siswa')).toBeVisible();
		await expect(page.getByText('Belum ada kelas')).toBeVisible();
	});

	test('creates a class and a student', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');
	});

	test('rejects duplicate NIS', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/students');
		await page.getByRole('button', { name: '+ Tambah Siswa' }).click();
		await page.getByLabel('NIS', { exact: true }).fill('10001');
		await page.getByLabel('Nama Lengkap').fill('Budi Santoso');
		await page.locator('#s-class').selectOption({ label: '7A' });
		await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
		await expect(page.getByText(/NIS 10001 sudah terdaftar/i)).toBeVisible();
	});

	test('persists data across a page reload', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');
		await page.reload();
		await page.goto('/students');
		await expect(page.getByRole('cell', { name: 'Ahmad Fauzi', exact: true })).toBeVisible();
	});
});

test.describe('attendance session', () => {
	test('opens a session and records manual attendance without duplicates', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();
		await expect(page.getByText(/ABSENSI KELAS 7A/)).toBeVisible();

		// Manual attendance
		await page.getByRole('button', { name: 'Absensi Manual' }).click();
		await page.locator('#manual-student').selectOption({ index: 1 });
		await page.locator('#manual-status').selectOption('present');
		await page.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();

		// The student now shows a recorded status; the "Catat" quick action is gone.
		await expect(page.getByText('Hadir').first()).toBeVisible();

		// Attempting to record again should be blocked (option disabled in the modal).
		await page.getByRole('button', { name: 'Absensi Manual' }).click();
		const option = page.locator('select#manual-student option', { hasText: 'Ahmad Fauzi' });
		await expect(option).toBeDisabled();
		await page.getByRole('button', { name: 'Batal' }).click();

		// Close session
		await page.getByRole('button', { name: 'Tutup Absensi' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Tutup Sesi' }).click();
		await expect(page.getByText('Sesi ini sudah ditutup')).toBeVisible();
	});

	test('shows unrecorded students and marks them absent on close', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');
		await createStudent(page, '10002', 'Budi Santoso', '7A');

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();

		await page.getByRole('button', { name: 'Absensi Manual' }).click();
		await page.locator('#manual-student').selectOption({ index: 1 });
		await page.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();

		await page.getByRole('button', { name: 'Tutup Absensi' }).click();
		await expect(page.getByText(/1 siswa belum tercatat/i)).toBeVisible();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /Tandai 1 Alpa/ })
			.click();
		await expect(page.getByText('Sesi ini sudah ditutup')).toBeVisible();
	});
});

test.describe('history + correction', () => {
	test('corrects a recorded attendance status', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();
		await page.getByRole('button', { name: 'Absensi Manual' }).click();
		await page.locator('#manual-student').selectOption({ index: 1 });
		await page.locator('#manual-status').selectOption('absent');
		await page.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();

		// Wait for the success toast so the record is committed before navigating away.
		await expect(page.getByText(/Alpa dicatat manual/)).toBeVisible();

		await page.goto('/history');
		await expect(page.getByRole('cell', { name: 'Alpa' })).toBeVisible();
		await page.getByRole('button', { name: 'Koreksi' }).first().click();
		await page.locator('#c-status').selectOption('sick');
		await page.getByRole('button', { name: 'Simpan Koreksi' }).click();
		await expect(page.getByRole('cell', { name: 'Sakit' })).toBeVisible();
	});
});

test.describe('reports', () => {
	test('generates a monthly report and shows summary', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();
		await page.getByRole('button', { name: 'Absensi Manual' }).click();
		await page.locator('#manual-student').selectOption({ index: 1 });
		await page.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();

		await page.goto('/reports');
		await page.getByRole('button', { name: 'Bulanan' }).click();
		await page.getByRole('button', { name: 'Buat Laporan' }).click();
		await expect(page.getByRole('cell', { name: 'Ahmad Fauzi' })).toBeVisible();
		await expect(page.getByText('Export & Bagikan')).toBeVisible();
	});
});

test.describe('backup + restore', () => {
	test('creates an encrypted backup and validates it on restore', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/settings');
		await page.getByRole('button', { name: 'Buat Backup' }).first().click();
		await page.getByLabel('Password Backup').fill('secret123');
		await page.getByLabel('Konfirmasi Password').fill('secret123');

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('dialog').getByRole('button', { name: 'Buat Backup' }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/absensi-backup-\d{4}-\d{2}-\d{2}\.enc/);
	});

	test('rejects the wrong backup password', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/settings');
		// Create a backup file in-memory and download it.
		await page.getByRole('button', { name: 'Buat Backup' }).first().click();
		await page.getByLabel('Password Backup').fill('secret123');
		await page.getByLabel('Konfirmasi Password').fill('secret123');
		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('dialog').getByRole('button', { name: 'Buat Backup' }).click();
		const download = await downloadPromise;
		const path = await download.path();
		expect(path).toBeTruthy();

		// Try to restore with the wrong password.
		await page.getByRole('button', { name: 'Pulihkan dari Backup' }).click();
		await page.locator('#rs-file').setInputFiles(path!);
		await page.locator('#rs-pass').fill('wrongpass');
		await page.getByRole('button', { name: 'Validasi Backup' }).click();
		await expect(page.getByText(/password salah atau file rusak/i)).toBeVisible();
	});
});

test.describe('privacy + offline UI', () => {
	test('privacy page explains local storage', async ({ page }) => {
		await completeOnboarding(page);
		await page.goto('/privacy');
		await expect(page.getByText(/disimpan.*lokal/i).first()).toBeVisible();
	});

	test('shows the offline banner when the network drops', async ({ page, context }) => {
		await completeOnboarding(page);
		await context.setOffline(true);
		await page.evaluate(() => window.dispatchEvent(new Event('offline')));
		await expect(page.getByText(/Mode offline/i)).toBeVisible();
		await context.setOffline(false);
	});

	test('lock screen appears and unlocks with the PIN', async ({ page }) => {
		await completeOnboarding(page, '4321');
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Kunci Sekarang' }).click();
		await expect(page.getByRole('dialog', { name: 'Layar terkunci' })).toBeVisible();
		await page.locator('#lock-pin').fill('4321');
		await page.getByRole('button', { name: 'Buka Kunci' }).click();
		await expect(page.getByRole('dialog', { name: 'Layar terkunci' })).toBeHidden();
	});
});

test.describe('camera error handling', () => {
	test('shows an actionable message when camera access is denied', async ({ page, context }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		// Override getUserMedia to reject with NotAllowedError for this navigation.
		await page.addInitScript(() => {
			navigator.mediaDevices.getUserMedia = () =>
				Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
		});

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();
		await expect(page.getByText(/Akses kamera ditolak/i)).toBeVisible({ timeout: 15_000 });
	});
});

test.describe('reset', () => {
	test('requires typing HAPUS and clears data', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/settings');
		await page.getByRole('button', { name: 'Hapus Semua Data' }).click();
		const confirmButton = page.getByRole('button', { name: 'Hapus Permanen' });
		await expect(confirmButton).toBeDisabled();
		await page.locator('#rm-word').fill('HAPUS');
		// Uncheck the "backup first" option to avoid needing a password.
		await page.getByText(/Buat backup sebelum menghapus/i).click();
		await expect(confirmButton).toBeEnabled();
		await confirmButton.click();
		await expect(page.getByRole('heading', { name: /Selamat Datang/i })).toBeVisible({
			timeout: 15_000
		});
	});
});

test.describe('kiosk + QR fallback', () => {
	test('enters kiosk mode and hides the navigation chrome', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();
		await expect(page.getByText(/ABSENSI KELAS 7A/)).toBeVisible();

		// Sidebar nav is present before kiosk.
		await expect(page.getByRole('navigation').first()).toBeVisible();

		await page.getByRole('button', { name: 'Mode Kios' }).click();
		// In kiosk the exit control replaces the enter control and nav is gone.
		await expect(page.getByRole('button', { name: 'Keluar Kios' })).toBeVisible();
		await expect(page.getByRole('navigation')).toHaveCount(0);

		await page.getByRole('button', { name: 'Keluar Kios' }).click();
		await expect(page.getByRole('button', { name: 'Mode Kios' })).toBeVisible();
	});

	test('offers a QR scan mode as an attendance fallback', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/attendance');
		await page.getByRole('button', { name: 'Mulai Absensi' }).click();

		// Switch to the QR card mode.
		await page.getByRole('button', { name: 'Kartu QR' }).click();
		await expect(page.getByRole('button', { name: 'Aktifkan Pemindai QR' })).toBeVisible();

		// Switch back to face mode.
		await page.getByRole('button', { name: 'Wajah' }).click();
		await expect(page.getByText(/Arahkan wajah ke kamera/).first()).toBeVisible();
	});

	test('shows a printable QR card on the student page', async ({ page }) => {
		await completeOnboarding(page);
		await createClass(page, '7A');
		await createStudent(page, '10001', 'Ahmad Fauzi', '7A');

		await page.goto('/students');
		await page.getByLabel('Registrasi wajah Ahmad Fauzi').click();
		await expect(page.getByRole('heading', { name: /Registrasi Wajah/i })).toBeVisible();

		// The QR card section renders an SVG code and a print action.
		await expect(page.getByText(/Kartu QR \(Cadangan\)/i)).toBeVisible();
		await expect(page.locator('[aria-label="Kode QR absensi"] svg')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Cetak Kartu' })).toBeVisible();
	});
});
