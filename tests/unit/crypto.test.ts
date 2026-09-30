import { describe, expect, it } from 'vitest';
import {
	base64,
	decryptBytes,
	deriveCredential,
	deriveEncryptionKey,
	encryptBytes,
	constantTimeEqual,
	randomBytes,
	sha256Hex,
	verifyCredential
} from '$lib/security/crypto';

describe('credential derivation', () => {
	it('is deterministic for the same pin + salt', async () => {
		const salt = base64.encode(randomBytes(16));
		const a = await deriveCredential('1234', salt);
		const b = await deriveCredential('1234', salt);
		expect(a).toBe(b);
	});

	it('differs for a different salt', async () => {
		const a = await deriveCredential('1234', base64.encode(randomBytes(16)));
		const b = await deriveCredential('1234', base64.encode(randomBytes(16)));
		expect(a).not.toBe(b);
	});

	it('verifies the correct pin and rejects the wrong one', async () => {
		const salt = base64.encode(randomBytes(16));
		const hash = await deriveCredential('9876', salt);
		expect(await verifyCredential('9876', salt, hash)).toBe(true);
		expect(await verifyCredential('0000', salt, hash)).toBe(false);
	});

	it('never stores the pin in the hash output', async () => {
		const salt = base64.encode(randomBytes(16));
		const hash = await deriveCredential('secretpin', salt);
		expect(hash).not.toContain('secretpin');
	});
});

describe('constantTimeEqual', () => {
	it('compares equal strings as equal', () => {
		expect(constantTimeEqual('abc', 'abc')).toBe(true);
	});
	it('rejects different lengths and contents', () => {
		expect(constantTimeEqual('abc', 'abcd')).toBe(false);
		expect(constantTimeEqual('abc', 'abd')).toBe(false);
	});
});

describe('backup encryption primitives', () => {
	it('round-trips bytes through AES-GCM', async () => {
		const salt = randomBytes(16);
		const iv = randomBytes(12);
		const key = await deriveEncryptionKey('password', salt, 1000);
		const plaintext = new TextEncoder().encode('rahasia absensi');
		const cipher = await encryptBytes(key, plaintext, iv);
		const decrypted = await decryptBytes(key, cipher, iv);
		expect(new TextDecoder().decode(decrypted)).toBe('rahasia absensi');
	});

	it('fails to decrypt with the wrong key', async () => {
		const iv = randomBytes(12);
		const key1 = await deriveEncryptionKey('right', randomBytes(16), 1000);
		const key2 = await deriveEncryptionKey('wrong', randomBytes(16), 1000);
		const cipher = await encryptBytes(key1, new TextEncoder().encode('x'), iv);
		await expect(decryptBytes(key2, cipher, iv)).rejects.toBeTruthy();
	});
});

describe('sha256Hex', () => {
	it('produces a stable 64-char hex digest', async () => {
		const digest = await sha256Hex(new TextEncoder().encode('abc'));
		expect(digest).toHaveLength(64);
		expect(digest).toBe(await sha256Hex(new TextEncoder().encode('abc')));
	});
});
