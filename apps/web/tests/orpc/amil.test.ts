import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Role } from '../../src/lib/auth/types';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 3 — new coverage for `router.amil.offlineZakat` (no
 * REST-era test existed to port; the route itself is a 1:1 port of
 * `apps/server/src/routes/amil.ts`). Proves the RBAC guard (ADMIN /
 * PETUGAS_LAPANGAN only, no separate AMIL role — AI_RULES §4) and the
 * offline-collection write path (TERVERIFIKASI immediately, transactionId
 * NULL, stamped with enteredByAmilId). Uses `createTestCaller` (Batch 5)
 * for context/JWT setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

const validInput = {
  namaMuzakki: 'Muzakki Tunai',
  isAnonymous: false,
  jenisZakat: 'MAAL_PENGHASILAN' as const,
  metodePembayaran: 'TUNAI' as const,
  nominal: 500_000,
};

async function createAmilUser(role: Role, label: string): Promise<string> {
  const id = `p17b3-amil-${label}-${ulid().toLowerCase()}`;
  await database.insert(schema.users).values({
    id,
    name: `Amil ${label}`,
    role,
    updatedAt: new Date().toISOString(),
  });
  return id;
}

describe('oRPC amil: offline zakat collection', () => {
  test('rejects an unauthenticated request with 401', async () => {
    const context = await createTestCaller({ database, user: null });
    try {
      await call(router.amil.offlineZakat, validInput, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }
  });

  test('rejects a WAKIF with 403 — no separate AMIL role', async () => {
    const context = await createTestCaller({
      database,
      user: { userId: 'p17b3-wakif', role: 'WAKIF' },
    });
    try {
      await call(router.amil.offlineZakat, validInput, { context });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }
  });

  test('ADMIN can record an offline TUNAI zakat, verified immediately', async () => {
    const adminId = await createAmilUser('ADMIN', 'admin');
    const context = await createTestCaller({
      database,
      user: { userId: adminId, role: 'ADMIN' },
    });

    try {
      const result = await call(router.amil.offlineZakat, validInput, {
        context,
      });
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('TERVERIFIKASI');
      expect(result.data.transactionId).toBeNull();
      expect(result.data.enteredByAmilId).toBe(adminId);
      expect(result.data.namaMuzakki).toBe('Muzakki Tunai');

      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, result.data.id));
    } finally {
      await database.delete(schema.users).where(eq(schema.users.id, adminId));
    }
  });

  test('PETUGAS_LAPANGAN can record an offline BERAS zakat as Hamba Allah when anonymous', async () => {
    const petugasId = await createAmilUser('PETUGAS_LAPANGAN', 'petugas');
    const context = await createTestCaller({
      database,
      user: { userId: petugasId, role: 'PETUGAS_LAPANGAN' },
    });

    try {
      const result = await call(
        router.amil.offlineZakat,
        {
          namaMuzakki: 'Muzakki Beras',
          isAnonymous: true,
          jenisZakat: 'FITRAH' as const,
          metodePembayaran: 'BERAS' as const,
          beratBerasKg: 25,
          jumlahJiwa: 10,
        },
        { context }
      );
      expect(result.success).toBe(true);
      expect(result.data.namaMuzakki).toBe('Hamba Allah');
      expect(Number(result.data.beratBerasKg)).toBe(25);

      await database
        .delete(schema.zakatOrders)
        .where(eq(schema.zakatOrders.id, result.data.id));
    } finally {
      await database.delete(schema.users).where(eq(schema.users.id, petugasId));
    }
  });
});
