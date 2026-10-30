import { describe, expect, test } from 'bun:test';
import { decryptSecret, encryptSecret } from '../src/crypto';

const KEY = 'test-encryption-key-at-least-32-characters-long';

describe('crypto (AES-256-GCM)', () => {
  test('roundtrips a secret', () => {
    const plain = '3273012345678901';
    const cipher = encryptSecret(plain, KEY);

    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher, KEY)).toBe(plain);
  });

  test('produces distinct ciphertext per encryption (random IV)', () => {
    const a = encryptSecret('same-value', KEY);
    const b = encryptSecret('same-value', KEY);

    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe(decryptSecret(b, KEY));
  });

  test('rejects tampered ciphertext', () => {
    const cipher = encryptSecret('secret', KEY);
    const parts = cipher.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');

    expect(() => decryptSecret(parts.join('.'), KEY)).toThrow();
  });

  test('rejects malformed input', () => {
    expect(() => decryptSecret('not-a-valid-secret', KEY)).toThrow();
  });

  test('fails decryption with a different key', () => {
    const cipher = encryptSecret('secret', KEY);
    expect(() =>
      decryptSecret(cipher, 'a-different-encryption-key-of-32+chars')
    ).toThrow();
  });
});
