import { getDb } from '$lib/db/database';
import type { Teacher } from '$lib/types';
import {
	deriveCredential,
	KDF_ITERATIONS,
	randomSalt,
	verifyCredential,
	cryptoAvailable
} from '$lib/security/crypto';
import { uuid } from '$lib/utils/id';
import { nowIso } from '$lib/utils/time';
import { writeAudit } from '$lib/db/audit';

/**
 * Local admin credential store.
 * The PIN is never persisted in plaintext — only a PBKDF2 hash + random salt.
 */

export const ADMIN_ID = 'admin';

export async function hasAdmin(): Promise<boolean> {
	return (await getDb().teachers.get(ADMIN_ID)) !== undefined;
}

export async function createAdminPin(pin: string): Promise<Teacher> {
	if (!cryptoAvailable()) {
		// PBKDF2 requires Web Crypto (only available on secure contexts: https / localhost).
		throw new Error(
			'Web Crypto tidak tersedia. Buka aplikasi melalui HTTPS atau localhost untuk membuat PIN.'
		);
	}
	if (pin.length < 4) throw new Error('PIN minimal 4 digit.');
	const salt = randomSalt();
	const hash = await deriveCredential(pin, salt, KDF_ITERATIONS);
	const timestamp = nowIso();
	const teacher: Teacher = {
		id: ADMIN_ID,
		name: 'Administrator',
		role: 'admin',
		credentialSalt: salt,
		credentialHash: hash,
		iterationCount: KDF_ITERATIONS,
		createdAt: timestamp,
		updatedAt: timestamp
	};
	await getDb().teachers.put(teacher);
	await writeAudit({
		action: 'admin_pin_change',
		entityType: 'teacher',
		entityId: ADMIN_ID,
		description: 'Membuat PIN administrator lokal'
	});
	return teacher;
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
	const teacher = await getDb().teachers.get(ADMIN_ID);
	if (!teacher) return false;
	return verifyCredential(
		pin,
		teacher.credentialSalt,
		teacher.credentialHash,
		teacher.iterationCount
	);
}

export async function changeAdminPin(currentPin: string, newPin: string): Promise<void> {
	const ok = await verifyAdminPin(currentPin);
	if (!ok) throw new Error('PIN lama salah.');
	await createAdminPin(newPin);
}
