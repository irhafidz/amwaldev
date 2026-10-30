import { describe, expect, test } from 'bun:test';
import { decryptSecret } from '@amwal/core/crypto';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { env } from '@/env/server';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, feature replay N-15 — proves the NIK-at-rest invariant
 * (SECURITY.md §6): `admin.zakat.createMustahiq` encrypts the NIK, so a raw
 * `SELECT nik` returns ciphertext, never the readable value.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

describe('admin.zakat.createMustahiq NIK encryption', () => {
  test('stores NIK encrypted at rest, never returned to the caller', async () => {
    const nik = '3273012345678901';
    const context = await createTestCaller({
      database,
      user: { userId: `p17n15-${ulid().toLowerCase()}`, role: 'ADMIN' },
    });

    let id: string | undefined;

    try {
      const result = await call(
        router.admin.zakat.createMustahiq,
        { namaMustahiq: 'Mustahik Uji', nik, kategoriAsnaf: 'FAKIR' },
        { context }
      );
      id = result.data.id;

      // The returned row must not carry the encrypted (or plaintext) NIK.
      expect(result.data).not.toHaveProperty('nik');

      const [raw] = await database
        .select({ nik: schema.mustahiqProfiles.nik })
        .from(schema.mustahiqProfiles)
        .where(eq(schema.mustahiqProfiles.id, id ?? ''));

      expect(raw?.nik).not.toBe(nik);
      expect(raw?.nik).toContain('v1.');
      expect(decryptSecret(raw?.nik ?? '', env.ENCRYPTION_KEY)).toBe(nik);
    } finally {
      if (id) {
        await database
          .delete(schema.mustahiqProfiles)
          .where(eq(schema.mustahiqProfiles.id, id));
      }
    }
  });
});
