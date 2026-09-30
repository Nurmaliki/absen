import { getDb } from './database';
import type { AuditLog } from '$lib/types';
import { uuid } from '$lib/utils/id';
import { nowIso } from '$lib/utils/time';

/**
 * Central audit-trail writer. Every meaningful mutation funnels through here so the
 * audit log stays complete without scattering `db.auditLogs.add` calls everywhere.
 * Writes are best-effort: an audit failure must never break the primary operation.
 */
const SENSITIVE_ACTIONS = new Set([
	'delete_data',
	'restore',
	'backup',
	'settings_update',
	'admin_pin_change'
]);

export async function writeAudit(entry: {
	action: string;
	entityType: string;
	entityId?: string;
	description: string;
}): Promise<void> {
	try {
		const record: AuditLog = {
			id: uuid(),
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			description: entry.description,
			createdAt: nowIso()
		};
		await getDb().auditLogs.add(record);
	} catch (error) {
		console.warn('[audit] gagal menulis log audit', SENSITIVE_ACTIONS.has(entry.action), error);
	}
}

export async function listAuditLogs(limit = 100): Promise<AuditLog[]> {
	const logs = await getDb().auditLogs.orderBy('createdAt').reverse().limit(limit).toArray();
	return logs;
}

export async function clearAuditLogs(): Promise<void> {
	await getDb().auditLogs.clear();
}
