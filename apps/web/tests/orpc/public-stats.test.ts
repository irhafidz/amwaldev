import { afterAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** QA-15: statistik agregat publik untuk beranda tamu. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { resetPublicStatsCache } = await import(
  '../../src/lib/orpc/router/stats'
);

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const userId = `p5-${runId}-donor`;
const txIds = ['paid-a', 'paid-b', 'pending'].map((k) => `p5-${runId}-${k}`);
const programId = `p5-${runId}-program`;
const nadzirUserId = `p5-${runId}-nadzir-user`;
const nadzirProfileId = `p5-${runId}-nadzir-profile`;

afterAll(async () => {
  await database
    .delete(schema.transactions)
    .where(inArray(schema.transactions.id, txIds));
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
  await database
    .delete(schema.users)
    .where(inArray(schema.users.id, [userId, nadzirUserId]));
});

async function read() {
  resetPublicStatsCache();
  const context = await createTestCaller({ database, user: null });
  return (await call(router.stats.public, undefined, { context })).data;
}

describe('stats.public', () => {
  test('counts only settled money, distinct donors and live programs; exposes only aggregates', async () => {
    const before = await read();

    await database.insert(schema.users).values({
      id: userId,
      name: 'Donor Statistik',
      updatedAt: new Date().toISOString(),
    });
    const tx = (id: string, amount: string, status: 'LUNAS' | 'PENDING') => ({
      id,
      wakifId: userId,
      jenisTransaksi: 'INFAQ' as const,
      amount,
      statusPembayaran: status,
      disbursementDestination: 'Lembaga Uji',
    });
    await database
      .insert(schema.transactions)
      .values([
        tx(txIds[0] as string, '100000.00', 'LUNAS'),
        tx(txIds[1] as string, '250000.00', 'LUNAS'),
        tx(txIds[2] as string, '999000.00', 'PENDING'),
      ]);
    await database.insert(schema.users).values({
      id: nadzirUserId,
      name: 'Nadzir Statistik',
      updatedAt: new Date().toISOString(),
    });
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      kategori: 'ORGANISASI',
      namaLembaga: 'Badan Wakaf Uji Statistik',
      updatedAt: new Date().toISOString(),
    });
    await database.insert(schema.waqfPrograms).values({
      id: programId,
      nadzirProfileId,
      judul: 'Program Statistik',
      targetDana: '100000000',
      jenisWakaf: 'PRODUKTIF_KEKAL',
      status: 'LIVE',
      updatedAt: new Date().toISOString(),
    });

    const after = await read();
    expect(after.totalRaised - before.totalRaised).toBe(350_000);
    // Dua transaksi lunas dari satu donor = satu donatur.
    expect(after.donorCount - before.donorCount).toBe(1);
    expect(after.activePrograms - before.activePrograms).toBe(1);
    expect(Object.keys(after).sort()).toEqual([
      'activePrograms',
      'donorCount',
      'totalRaised',
    ]);
  });
});
