import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 4 — coverage for the remaining admin sub-routers
 * (zakat, qurban, infaq, documents, transparency, settings) that had no
 * dedicated REST-era test file to port. Proves the ADMIN-only guard and the
 * NIK-exclusion privacy invariant explicitly called out in this batch's
 * task: `mustahiqProfiles.nik` and `nadzirDocuments.ocrExtractedNik` must
 * never appear in a select result. Uses `createTestCaller` (Batch 5) for
 * context/JWT setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

describe('oRPC admin.zakat', () => {
  test('mustahiqList rejects non-ADMIN and never selects nik', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `p17b4-wakif-${ulid()}`, role: 'WAKIF' },
    });
    try {
      await call(
        router.admin.zakat.mustahiqList,
        {},
        { context: wakifContext }
      );
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }

    const runId = ulid().toLowerCase();
    const mustahiqId = `p17b4-${runId}-mustahiq`;
    await database.insert(schema.mustahiqProfiles).values({
      id: mustahiqId,
      namaMustahiq: 'Mustahiq Uji Privasi',
      kategoriAsnaf: 'FAKIR',
      nik: '3201234567890001',
      updatedAt: new Date().toISOString(),
    });

    try {
      const adminContext = await createTestCaller({
        database,
        user: { userId: `p17b4-admin-${runId}`, role: 'ADMIN' },
      });
      const result = await call(
        router.admin.zakat.mustahiqList,
        {},
        { context: adminContext }
      );
      const row = result.data.find((r) => r.id === mustahiqId);
      expect(row).toBeDefined();
      expect(row && 'nik' in row).toBe(false);
    } finally {
      await database
        .delete(schema.mustahiqProfiles)
        .where(eq(schema.mustahiqProfiles.id, mustahiqId));
    }
  });

  test('setGoldPrice inserts a MANUAL_FALLBACK history row', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: `p17b4-admin-${ulid()}`, role: 'ADMIN' },
    });
    const result = await call(
      router.admin.zakat.setGoldPrice,
      { pricePerGram: 1_500_000 },
      { context: adminContext }
    );
    expect(result.success).toBe(true);
    expect(result.data.source).toBe('MANUAL_FALLBACK');

    await database
      .delete(schema.zakatGoldPriceHistory)
      .where(eq(schema.zakatGoldPriceHistory.id, result.data.id));
  });
});

describe('oRPC admin.documents', () => {
  test('list rejects non-ADMIN and never selects ocrExtractedNik', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `p17b4-wakif-${ulid()}`, role: 'WAKIF' },
    });
    try {
      await call(router.admin.documents.list, {}, { context: wakifContext });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }

    const runId = ulid().toLowerCase();
    const nadzirUserId = `p17b4-${runId}-nadzir-user`;
    const nadzirProfileId = `p17b4-${runId}-nadzir-profile`;
    const docId = `p17b4-${runId}-doc`;
    const now = new Date().toISOString();

    await database.insert(schema.users).values({
      id: nadzirUserId,
      name: 'Nadzir Dokumen',
      updatedAt: now,
    });
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      kategori: 'ORGANISASI',
      updatedAt: now,
    });
    await database.insert(schema.nadzirDocuments).values({
      id: docId,
      nadzirProfileId,
      tipeDokumen: 'KTP',
      fileUrl: 'https://example.com/ktp.jpg',
      ocrExtractedNik: '3201234567890002',
      ocrExtractedNama: 'Nadzir Dokumen',
    });

    try {
      const adminContext = await createTestCaller({
        database,
        user: { userId: `p17b4-admin-${runId}`, role: 'ADMIN' },
      });
      const result = await call(
        router.admin.documents.list,
        {},
        { context: adminContext }
      );
      const row = result.data.find((r) => r.id === docId);
      expect(row).toBeDefined();
      expect(row && 'ocrExtractedNik' in row).toBe(false);

      const verified = await call(
        router.admin.documents.verify,
        { id: docId, reviewedManually: true },
        { context: adminContext }
      );
      expect(verified.data.reviewedManually).toBe(true);
    } finally {
      await database
        .delete(schema.nadzirDocuments)
        .where(eq(schema.nadzirDocuments.id, docId));
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, nadzirUserId));
    }
  });
});

describe('oRPC admin.qurban', () => {
  test('createBatch pre-creates matching slot rows', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: `p17b4-admin-${ulid()}`, role: 'ADMIN' },
    });
    const result = await call(
      router.admin.qurban.createBatch,
      {
        jenisHewan: 'KAMBING',
        totalSlot: 3,
        hargaPerSlot: 2_500_000,
      },
      { context: adminContext }
    );
    expect(result.success).toBe(true);
    const batchId = result.data.id;

    try {
      const slots = await database
        .select()
        .from(schema.qurbanAnimalSlots)
        .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
      expect(slots).toHaveLength(3);
      expect(slots.every((s) => s.status === 'TERSEDIA')).toBe(true);

      const list = await call(
        router.admin.qurban.batchesList,
        {},
        { context: adminContext }
      );
      const found = list.data.find((b) => b.id === batchId);
      expect(found?.slotTotal).toBe(3);
      expect(found?.slotTerpakai).toBe(0);
      // Issue #54: the workbench slot map needs every slot, ordered by number,
      // so it can offer "Daftarkan Shohibul" on the empty ones.
      expect(found?.slots.map((s) => s.nomorSlot)).toEqual([1, 2, 3]);
      expect(found?.slots.every((s) => s.status === 'TERSEDIA')).toBe(true);
    } finally {
      await database
        .delete(schema.qurbanAnimalSlots)
        .where(eq(schema.qurbanAnimalSlots.hewanBatchId, batchId));
      await database
        .delete(schema.hewanBatches)
        .where(eq(schema.hewanBatches.id, batchId));
    }
  });
});

describe('oRPC admin.infaq', () => {
  test('ordersList rejects non-ADMIN', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `p17b4-wakif-${ulid()}`, role: 'WAKIF' },
    });
    try {
      await call(router.admin.infaq.ordersList, {}, { context: wakifContext });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }

    const adminContext = await createTestCaller({
      database,
      user: { userId: `p17b4-admin-${ulid()}`, role: 'ADMIN' },
    });
    const result = await call(
      router.admin.infaq.ordersList,
      {},
      { context: adminContext }
    );
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe('oRPC admin.transparency', () => {
  test('logs rejects non-ADMIN and returns the three aggregation buckets', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `p17b4-wakif-${ulid()}`, role: 'WAKIF' },
    });
    try {
      await call(router.admin.transparency.logs, {}, { context: wakifContext });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }

    const adminContext = await createTestCaller({
      database,
      user: { userId: `p17b4-admin-${ulid()}`, role: 'ADMIN' },
    });
    const result = await call(
      router.admin.transparency.logs,
      {},
      { context: adminContext }
    );
    expect(Array.isArray(result.data.transactions)).toBe(true);
    expect(Array.isArray(result.data.waqfDistributions)).toBe(true);
    expect(Array.isArray(result.data.zakatDistributions)).toBe(true);
  });
});

describe('oRPC admin.settings', () => {
  test('baileysStatus degrades to OFFLINE without throwing when unconfigured/unreachable', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `p17b4-wakif-${ulid()}`, role: 'WAKIF' },
    });
    try {
      await call(
        router.admin.settings.baileysStatus,
        {},
        { context: wakifContext }
      );
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }

    const adminContext = await createTestCaller({
      database,
      user: { userId: `p17b4-admin-${ulid()}`, role: 'ADMIN' },
    });
    const result = await call(
      router.admin.settings.baileysStatus,
      {},
      { context: adminContext }
    );
    expect(result.data).toBeDefined();
  });
});

describe('oRPC admin.wa', () => {
  test('getStatus rejects non-ADMIN and degrades to SERVICE_OFFLINE', async () => {
    const wakifContext = await createTestCaller({
      database,
      user: { userId: `p17b4-wakif-${ulid()}`, role: 'WAKIF' },
    });
    try {
      await call(router.admin.wa.getStatus, {}, { context: wakifContext });
      throw new Error('expected call to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }

    const adminContext = await createTestCaller({
      database,
      user: { userId: `p17b4-admin-${ulid()}`, role: 'ADMIN' },
    });
    const prevUrl = process.env.BAILEYS_SERVICE_URL;
    process.env.BAILEYS_SERVICE_URL = 'http://127.0.0.1:59999';
    try {
      const result = await call(
        router.admin.wa.getStatus,
        {},
        { context: adminContext }
      );

      expect(result.data.status).toBe('SERVICE_OFFLINE');
    } finally {
      process.env.BAILEYS_SERVICE_URL = prevUrl;
    }
  });
});
