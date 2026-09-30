import { getDb } from '$lib/db/database';
import type {
	AppSettings,
	AttendanceRecord,
	AttendanceSession,
	AuditLog,
	BackupData,
	BackupEnvelope,
	BackupPreview,
	FaceTemplate,
	SchoolClass,
	Student
} from '$lib/types';
import {
	base64,
	deriveEncryptionKey,
	decryptBytes,
	encryptBytes,
	KDF_ITERATIONS,
	randomBytes,
	sha256Hex
} from '$lib/security/crypto';
import { writeAudit } from '$lib/db/audit';

export const BACKUP_VERSION = 1;
export const APP_VERSION = '1.0.0';

/** Optional integrity metadata carried alongside the ciphertext (not secret). */
export interface BackupFileV1 {
	backupVersion: number;
	appVersion: string;
	createdAt: string;
	/** SHA-256 of the plaintext JSON, to detect tampering/corruption before import. */
	plaintextChecksum: string;
	encryption: BackupEnvelope['encryption'];
	ciphertext: string;
}

export class BackupError extends Error {
	constructor(
		message: string,
		public readonly code: BackupErrorCode
	) {
		super(message);
		this.name = 'BackupError';
	}
}

export type BackupErrorCode =
	| 'invalid_format'
	| 'unsupported_version'
	| 'decrypt_failed'
	| 'checksum_mismatch'
	| 'schema_invalid'
	| 'empty';

function assertArray<T>(value: unknown, name: string): T[] {
	if (!Array.isArray(value)) {
		throw new BackupError(
			`Bagian "${name}" pada backup tidak valid (bukan array).`,
			'schema_invalid'
		);
	}
	return value as T[];
}

/** Collect all tables into a plain serializable object. */
export async function collectBackupData(): Promise<BackupData> {
	const db = getDb();
	const [
		classes,
		students,
		faceTemplates,
		attendanceSessions,
		attendanceRecords,
		settings,
		auditLogs
	] = await Promise.all([
		db.classes.toArray(),
		db.students.toArray(),
		db.faceTemplates.toArray(),
		db.attendanceSessions.toArray(),
		db.attendanceRecords.toArray(),
		db.settings.toArray(),
		db.auditLogs.toArray()
	]);
	return {
		classes: classes as SchoolClass[],
		students: students as Student[],
		faceTemplates: faceTemplates as FaceTemplate[],
		attendanceSessions: attendanceSessions as AttendanceSession[],
		attendanceRecords: attendanceRecords as AttendanceRecord[],
		settings: settings as AppSettings[],
		auditLogs: auditLogs as AuditLog[]
	};
}

/**
 * Build an encrypted backup file.
 * `password` is used to derive an AES-GCM key (PBKDF2-SHA256, 210k iterations) and is
 * never stored inside the file.
 */
export async function createBackup(password: string): Promise<{ file: BackupFileV1; blob: Blob }> {
	if (!password || password.length < 6) {
		throw new BackupError('Password backup minimal 6 karakter.', 'invalid_format');
	}
	const data = await collectBackupData();
	const payload = {
		backupVersion: BACKUP_VERSION,
		appVersion: APP_VERSION,
		createdAt: new Date().toISOString(),
		data
	};
	const plaintext = new TextEncoder().encode(JSON.stringify(payload));
	const checksum = await sha256Hex(plaintext);

	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = await deriveEncryptionKey(password, salt, KDF_ITERATIONS);
	const cipher = await encryptBytes(key, plaintext, iv);

	const file: BackupFileV1 = {
		backupVersion: BACKUP_VERSION,
		appVersion: APP_VERSION,
		createdAt: payload.createdAt,
		plaintextChecksum: checksum,
		encryption: {
			algorithm: 'AES-GCM',
			kdf: 'PBKDF2-SHA256',
			iterations: KDF_ITERATIONS,
			salt: base64.encode(salt),
			iv: base64.encode(iv)
		},
		ciphertext: base64.encode(cipher)
	};

	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	await writeAudit({
		action: 'backup',
		entityType: 'database',
		description: `Membuat backup terenkripsi (${data.students.length} siswa, ${data.attendanceRecords.length} absensi)`
	});
	return { file, blob };
}

/** Parse + structurally validate a backup file before any decryption is attempted. */
export function parseBackupFile(text: string): BackupFileV1 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new BackupError(
			'File backup tidak dapat dibaca (bukan JSON yang valid).',
			'invalid_format'
		);
	}
	if (!parsed || typeof parsed !== 'object') {
		throw new BackupError('Struktur file backup tidak dikenali.', 'invalid_format');
	}
	const file = parsed as Partial<BackupFileV1>;
	if (typeof file.backupVersion !== 'number') {
		throw new BackupError('Versi backup tidak ditemukan.', 'invalid_format');
	}
	if (file.backupVersion > BACKUP_VERSION) {
		throw new BackupError(
			`Versi backup (${file.backupVersion}) lebih baru daripada aplikasi ini (${BACKUP_VERSION}). Perbarui aplikasi terlebih dahulu.`,
			'unsupported_version'
		);
	}
	if (!file.encryption || !file.ciphertext || !file.plaintextChecksum) {
		throw new BackupError('File backup tidak lengkap atau rusak.', 'invalid_format');
	}
	return file as BackupFileV1;
}

export interface DecryptResult {
	data: BackupData;
	preview: BackupPreview;
}

/**
 * Decrypt + validate a backup. Runs the full integrity chain:
 * decrypt -> checksum verify -> schema validate -> version check -> preview.
 * No database mutation happens here (restore is a separate, confirmed step).
 */
export async function decryptAndValidateBackup(
	file: BackupFileV1,
	password: string
): Promise<DecryptResult> {
	const salt = base64.decode(file.encryption.salt);
	const iv = base64.decode(file.encryption.iv);
	const key = await deriveEncryptionKey(
		password,
		salt,
		file.encryption.iterations || KDF_ITERATIONS
	);

	let plaintext: Uint8Array;
	try {
		plaintext = await decryptBytes(key, base64.decode(file.ciphertext), iv);
	} catch {
		throw new BackupError(
			'Gagal mendekripsi backup. Password salah atau file rusak.',
			'decrypt_failed'
		);
	}

	const checksum = await sha256Hex(plaintext);
	if (checksum !== file.plaintextChecksum) {
		throw new BackupError(
			'Integritas backup tidak valid (checksum tidak cocok). File mungkin rusak atau dimodifikasi.',
			'checksum_mismatch'
		);
	}

	let payload: { backupVersion?: number; data?: Partial<BackupData> };
	try {
		payload = JSON.parse(new TextDecoder().decode(plaintext));
	} catch {
		throw new BackupError('Isi backup rusak.', 'schema_invalid');
	}

	return validateBackupPayload(payload);
}

/** Validate the decrypted payload schema and produce a preview. */
export function validateBackupPayload(payload: {
	backupVersion?: number;
	data?: Partial<BackupData>;
}): DecryptResult {
	const data = payload.data;
	if (!data || typeof data !== 'object') {
		throw new BackupError('Backup tidak berisi data.', 'schema_invalid');
	}

	const validated: BackupData = {
		classes: assertArray<SchoolClass>(data.classes ?? [], 'classes'),
		students: assertArray<Student>(data.students ?? [], 'students'),
		faceTemplates: assertArray<FaceTemplate>(data.faceTemplates ?? [], 'faceTemplates'),
		attendanceSessions: assertArray<AttendanceSession>(
			data.attendanceSessions ?? [],
			'attendanceSessions'
		),
		attendanceRecords: assertArray<AttendanceRecord>(
			data.attendanceRecords ?? [],
			'attendanceRecords'
		),
		settings: assertArray<AppSettings>(data.settings ?? [], 'settings'),
		auditLogs: assertArray<AuditLog>(data.auditLogs ?? [], 'auditLogs')
	};

	// Sanity: every student's class should exist, every record's session should exist.
	const classIds = new Set(validated.classes.map((c) => c.id));
	const orphanStudents = validated.students.filter((s) => !classIds.has(s.classId)).length;
	const sessionIds = new Set(validated.attendanceSessions.map((s) => s.id));
	const orphanRecords = validated.attendanceRecords.filter(
		(r) => !sessionIds.has(r.sessionId)
	).length;

	const preview: BackupPreview = {
		backupVersion: payload.backupVersion ?? BACKUP_VERSION,
		appVersion: APP_VERSION,
		createdAt: new Date().toISOString(),
		counts: {
			classes: validated.classes.length,
			students: validated.students.length,
			faceTemplates: validated.faceTemplates.length,
			attendanceSessions: validated.attendanceSessions.length,
			attendanceRecords: validated.attendanceRecords.length,
			auditLogs: validated.auditLogs.length,
			orphanStudents,
			orphanRecords
		}
	};

	if (validated.students.length === 0 && validated.classes.length === 0) {
		throw new BackupError('Backup kosong (tidak ada kelas maupun siswa).', 'empty');
	}

	return { data: validated, preview };
}

/** Generate a backup filename: absensi-backup-YYYY-MM-DD.enc */
export function backupFilename(date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `absensi-backup-${y}-${m}-${d}.enc`;
}
