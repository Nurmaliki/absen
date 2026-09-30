/**
 * Local credential + encryption primitives built on the Web Crypto API.
 *
 * Threat model (see docs/SECURITY.md): this protects against *casual* local access
 * (someone picking up an unlocked device / opening devtools and reading the PIN).
 * It does NOT turn browser storage into a secure enclave. Anyone with the device and
 * enough determination (or a browser extension, or OS-level access) can read the
 * IndexedDB data, and the PIN/backup password can be brute-forced offline.
 */

/** Web Crypto is required for all credential/backup operations. */
export function cryptoAvailable(): boolean {
	return typeof globalThis.crypto?.subtle !== 'undefined';
}

export const KDF_ITERATIONS = 210_000; // PBKDF2-SHA256, tuned for classroom laptops/phones.

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

export function randomSalt(): string {
	return toBase64(randomBytes(16));
}

/** Derive a verification hash from a PIN + salt. Never store the PIN itself. */
export async function deriveCredential(
	pin: string,
	salt: string,
	iterations = KDF_ITERATIONS
): Promise<string> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
		keyMaterial,
		256
	);
	return toBase64(new Uint8Array(bits));
}

/** Constant-time-ish comparison for base64 credential strings. */
export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function verifyCredential(
	pin: string,
	salt: string,
	hash: string,
	iterations = KDF_ITERATIONS
): Promise<boolean> {
	const candidate = await deriveCredential(pin, salt, iterations);
	return constantTimeEqual(candidate, hash);
}

/** Derive an AES-GCM key from a passphrase for backup encryption. */
export async function deriveEncryptionKey(
	password: string,
	salt: Uint8Array,
	iterations = KDF_ITERATIONS
): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
		'deriveKey'
	]);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptBytes(
	key: CryptoKey,
	data: Uint8Array,
	iv: Uint8Array
): Promise<Uint8Array> {
	const cipher = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: iv as BufferSource },
		key,
		data as BufferSource
	);
	return new Uint8Array(cipher);
}

export async function decryptBytes(
	key: CryptoKey,
	data: Uint8Array,
	iv: Uint8Array
): Promise<Uint8Array> {
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: iv as BufferSource },
		key,
		data as BufferSource
	);
	return new Uint8Array(plain);
}

/** SHA-256 hex digest, used for backup integrity/checksum fields. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const base64 = { encode: toBase64, decode: fromBase64 };
