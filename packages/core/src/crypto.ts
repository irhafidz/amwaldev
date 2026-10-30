import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * Derives a 32-byte AES-256 key from the app's ENCRYPTION_KEY. Env-free: the
 * key is an explicit parameter so a shared kernel package never assumes an
 * app's environment (Putaran 17, Batch 1 rule).
 */
function deriveKey(encryptionKey: string): Buffer {
  return createHash('sha256').update(encryptionKey).digest();
}

/**
 * Encrypts a secret (e.g. NIK) with AES-256-GCM. Returns a version-prefixed
 * `v1.<iv>.<authTag>.<ciphertext>` string (all base64), safe for a text column.
 */
export function encryptSecret(plain: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(encryptionKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

/**
 * Decrypts a value produced by {@link encryptSecret}. Throws on tampered data
 * (GCM auth) or an unknown version prefix.
 */
export function decryptSecret(
  cipherText: string,
  encryptionKey: string
): string {
  const [version, ivB64, authTagB64, dataB64] = cipherText.split('.');

  if (version !== VERSION || !ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(encryptionKey),
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
