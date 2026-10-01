/**
 * Core domain types for the local-first face attendance system.
 *
 * All timestamps are stored as ISO-8601 strings in UTC (e.g. `2026-09-30T07:02:13.000Z`).
 * The session `date` is stored separately as a plain local calendar date (`YYYY-MM-DD`)
 * so that attendance day boundaries never depend on parsing an ambiguous timestamp.
 */

export interface SchoolClass {
	id: string;
	name: string;
	grade: string;
	academicYear: string;
	semester: string;
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface Student {
	id: string;
	nis: string;
	nisn?: string;
	name: string;
	classId: string;
	gender?: string;
	active: boolean;
	faceRegistered: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface FaceTemplate {
	id: string;
	studentId: string;
	/** Face descriptor vector produced by the active face engine. */
	descriptor: number[];
	/** Distance metric the descriptor was generated with (used for compatibility checks). */
	metric: 'cosine' | 'euclidean';
	modelVersion: string;
	qualityScore?: number;
	createdAt: string;
	updatedAt: string;
}

export type AttendanceStatus = 'present' | 'late' | 'permission' | 'sick' | 'absent';

export interface AttendanceSession {
	id: string;
	classId: string;
	/** Local calendar date of the session, e.g. `2026-09-30`. */
	date: string;
	/** Local wall-clock start time `HH:mm`. */
	startTime: string;
	/** Local cutoff time `HH:mm`; scans after this become `late`. */
	lateAfter?: string;
	status: 'open' | 'closed';
	createdAt: string;
	closedAt?: string;
}

export interface AttendanceRecord {
	id: string;
	sessionId: string;
	studentId: string;
	status: AttendanceStatus;
	/** ISO timestamp of when attendance was recorded. */
	attendanceTime?: string;
	/** Raw engine confidence — NOT normalized to a fake percentage. */
	recognitionScore?: number;
	/** Engine distance/similarity that produced the match. */
	recognitionDistance?: number;
	method: 'face' | 'manual';
	notes?: string;
	createdAt: string;
	updatedAt: string;
}

export interface AuditLog {
	id: string;
	action: string;
	entityType: string;
	entityId?: string;
	description: string;
	createdAt: string;
}

export interface Teacher {
	id: string;
	name: string;
	role: 'admin' | 'operator';
	credentialSalt: string;
	credentialHash: string;
	iterationCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface AppSettings {
	id: 'app';
	schoolName: string;
	academicYear: string;
	semester: string;
	defaultEntryTime: string;
	lateThreshold: string;
	recognitionThreshold: number;
	recognitionMargin: number;
	livenessEnabled: boolean;
	/** Enable blink/head-turn challenge in addition to passive antispoof. */
	livenessChallengeEnabled?: boolean;
	cameraDeviceId?: string;
	autoLockMinutes: number;
	backupReminderDays: number;
	/** ISO timestamp of the last successful backup download, used for reminders. */
	lastBackupAt?: string;
	/** Keep the screen awake while a scanning view is open (best-effort). */
	keepAwakeWhileScanning?: boolean;
	/**
	 * Which face-engine path to use. `auto` prefers the Web Worker (off the UI thread) and
	 * falls back to the main thread; `worker`/`main` force a specific path for troubleshooting.
	 */
	faceEngineMode?: 'auto' | 'worker' | 'main';
	onboardingComplete: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface AttendanceStatusCounts {
	present: number;
	late: number;
	permission: number;
	sick: number;
	absent: number;
	unrecorded: number;
	total: number;
}

export type BackupData = {
	classes: SchoolClass[];
	students: Student[];
	faceTemplates: FaceTemplate[];
	attendanceSessions: AttendanceSession[];
	attendanceRecords: AttendanceRecord[];
	settings: AppSettings[];
	auditLogs: AuditLog[];
};

export interface BackupEnvelope {
	backupVersion: number;
	appVersion: string;
	createdAt: string;
	encryption: {
		algorithm: 'AES-GCM';
		kdf: 'PBKDF2-SHA256';
		iterations: number;
		salt: string;
		iv: string;
	};
	ciphertext: string;
}

export interface BackupPreview {
	backupVersion: number;
	appVersion: string;
	createdAt: string;
	counts: Record<string, number>;
}
