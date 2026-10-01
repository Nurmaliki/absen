import { getDb } from './database';
import type { AppSettings } from '$lib/types';
import { nowIso } from '$lib/utils/time';
import { writeAudit } from './audit';
import { broadcastSync } from './sync';

/** Conservative default recognition threshold — see docs/SECURITY.md & settings page help text. */
export const DEFAULT_RECOGNITION_THRESHOLD = 0.5;
export const DEFAULT_RECOGNITION_MARGIN = 0.08;

export const DEFAULT_SETTINGS: Omit<AppSettings, 'createdAt' | 'updatedAt'> = {
	id: 'app',
	schoolName: '',
	academicYear: '',
	semester: 'Ganjil',
	defaultEntryTime: '06:30',
	lateThreshold: '07:00',
	recognitionThreshold: DEFAULT_RECOGNITION_THRESHOLD,
	recognitionMargin: DEFAULT_RECOGNITION_MARGIN,
	livenessEnabled: true,
	cameraDeviceId: undefined,
	autoLockMinutes: 15,
	backupReminderDays: 7,
	faceEngineMode: 'auto',
	onboardingComplete: false
};

export async function getSettings(): Promise<AppSettings> {
	const existing = await getDb().settings.get('app');
	if (existing) return existing;
	const timestamp = nowIso();
	const fresh: AppSettings = { ...DEFAULT_SETTINGS, createdAt: timestamp, updatedAt: timestamp };
	await getDb().settings.put(fresh);
	return fresh;
}

export async function saveSettings(
	patch: Partial<Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<AppSettings> {
	const current = await getSettings();
	const next: AppSettings = { ...current, ...patch, id: 'app', updatedAt: nowIso() };
	await getDb().settings.put(next);
	await writeAudit({
		action: 'settings_update',
		entityType: 'settings',
		entityId: 'app',
		description: `Memperbarui pengaturan: ${Object.keys(patch).join(', ') || '-'}`
	});
	broadcastSync({ kind: 'settings:changed' });
	return next;
}

export async function completeOnboarding(
	values: Pick<
		AppSettings,
		'schoolName' | 'academicYear' | 'semester' | 'defaultEntryTime' | 'lateThreshold'
	>
): Promise<AppSettings> {
	return saveSettings({ ...values, onboardingComplete: true });
}

/** Recognition threshold safety band. Values above this are considered overly permissive. */
export const PERMISSIVE_THRESHOLD = 0.62;
export const STRICT_THRESHOLD = 0.42;

export function thresholdAssessment(threshold: number): {
	level: 'strict' | 'balanced' | 'permissive';
	message: string;
} {
	if (threshold <= STRICT_THRESHOLD) {
		return {
			level: 'strict',
			message:
				'Ambang batas ketat. Lebih aman terhadap false match, tetapi wajah valid mungkin sering ditolak dan perlu absensi manual.'
		};
	}
	if (threshold >= PERMISSIVE_THRESHOLD) {
		return {
			level: 'permissive',
			message:
				'Ambang batas terlalu permisif. Risiko salah mengenali siswa lain lebih tinggi. Disarankan 0,45–0,55.'
		};
	}
	return {
		level: 'balanced',
		message: 'Ambang batas seimbang. Cocok untuk sebagian besar kondisi kelas.'
	};
}
