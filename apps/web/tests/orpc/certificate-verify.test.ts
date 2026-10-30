import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * `I-5` — public verification procedure (`router.certificate.verify`).
 *
 * This is the only certificate surface without an auth guard, so the test
 * doubles as the minimisation proof: whatever the query happens to select,
 * the public response may only carry the fields the contract names. A future
 * column added to the join must break this test, not leak.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const now = () => new Date().toISOString();

const PUBLIC_FIELDS = [
  'jenis',
  'namaDonatur',
  'nomor',
  'programTitle',
  'tanggalTransaksi',
  'tanggalTransaksiLabel',
  'valid',
];

interface Fixture {
  transactionId: string;
  nomorInternalAmwal: string;
  userId: string;
  nadzirUserId: string;
  nadzirProfileId: string;
  programId: string;
  waqfOrderId: string;
}

async function createFixture(options: {
  status: 'LUNAS' | 'PENDING';
  isAnonymous?: boolean;
  namaWakif?: string;
  /** Naive UTC wall time, exactly how Postgres stores it. */
  createdAt?: string;
}): Promise<Fixture> {
  const runId = ulid().toLowerCase();
  const ids: Fixture = {
    userId: `s11-cv-${runId}-user`,
    nadzirUserId: `s11-cv-${runId}-nadzir-user`,
    nadzirProfileId: `s11-cv-${runId}-nadzir-profile`,
    programId: `s11-cv-${runId}-program`,
    waqfOrderId: `s11-cv-${runId}-order`,
    transactionId: `s11-cv-${runId}-txn`,
    // Full ULID, not a prefix: ULIDs generated in the same millisecond share
    // their leading characters, which collided on `certificates.nomor_internal_amwal`.
    nomorInternalAmwal: `CERT-AMW-2026-${runId.toUpperCase()}`,
  };

  await database.insert(schema.users).values([
    { id: ids.userId, name: 'Wakif Verifikasi', updatedAt: now() },
    { id: ids.nadzirUserId, name: 'Nadzir Verifikasi', updatedAt: now() },
  ]);
  await database.insert(schema.nadzirProfiles).values({
    id: ids.nadzirProfileId,
    userId: ids.nadzirUserId,
    kategori: 'ORGANISASI',
    updatedAt: now(),
  });
  await database.insert(schema.waqfPrograms).values({
    id: ids.programId,
    nadzirProfileId: ids.nadzirProfileId,
    judul: `Program Verifikasi ${runId}`,
    targetDana: '100000000',
    jenisWakaf: 'PRODUKTIF_KEKAL',
    status: 'LIVE',
    updatedAt: now(),
  });
  await database.insert(schema.transactions).values({
    id: ids.transactionId,
    wakifId: ids.userId,
    jenisTransaksi: 'WAKAF',
    amount: '250000.00',
    statusPembayaran: options.status,
    disbursementDestination: 'Badan Pengelola Wakaf',
    ...(options.createdAt ? { createdAt: options.createdAt } : {}),
  });
  await database.insert(schema.waqfOrders).values({
    id: ids.waqfOrderId,
    nomorKwitansi: `KW-CV-${runId}`,
    waqfProgramId: ids.programId,
    wakifId: ids.userId,
    namaWakif: options.namaWakif ?? 'Wakif Verifikasi',
    isAnonymous: options.isAnonymous ?? false,
    bentukWakaf: 'UANG',
    status:
      options.status === 'LUNAS' ? 'TERVERIFIKASI' : 'MENUNGGU_VERIFIKASI',
    transactionId: ids.transactionId,
  });
  await database.insert(schema.certificates).values({
    id: `CERT-${runId}`,
    transactionId: ids.transactionId,
    jenisSertifikat: 'WAKAF',
    nomorInternalAmwal: ids.nomorInternalAmwal,
    issuedAt: now(),
  });

  return ids;
}

async function cleanupFixture(ids: Fixture): Promise<void> {
  if (!ids) {
    return;
  }

  await database
    .delete(schema.certificates)
    .where(eq(schema.certificates.transactionId, ids.transactionId));
  await database
    .delete(schema.waqfOrders)
    .where(eq(schema.waqfOrders.id, ids.waqfOrderId));
  await database
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, ids.transactionId));
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, ids.programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, ids.nadzirProfileId));
  for (const userId of [ids.userId, ids.nadzirUserId]) {
    await database.delete(schema.users).where(eq(schema.users.id, userId));
  }
}

async function verify(nomor: string) {
  return call(
    router.certificate.verify,
    { nomor },
    { context: await createTestCaller({ database }) }
  );
}

describe('certificate.verify (public)', () => {
  let settled: Fixture;
  let anonymous: Fixture;
  let pending: Fixture;

  beforeAll(async () => {
    settled = await createFixture({ status: 'LUNAS' });
    anonymous = await createFixture({
      status: 'LUNAS',
      isAnonymous: true,
      namaWakif: 'Rahasia Sekali',
    });
    pending = await createFixture({ status: 'PENDING' });
  });

  afterAll(async () => {
    for (const fixture of [settled, anonymous, pending]) {
      await cleanupFixture(fixture);
    }
  });

  test('reports a settled donation as valid, without an auth session', async () => {
    const result = await verify(settled.nomorInternalAmwal);

    expect(result.valid).toBe(true);
    expect(result.nomor).toBe(settled.nomorInternalAmwal);
    expect(result.jenis).toBe('WAKAF');
    expect(result.programTitle).toBeString();
    // Sequential certificate numbers make this page enumerable: a named donor
    // appears as initials only, never as a full name.
    expect(result.namaDonatur).toBe('W. V.');
  });

  test('exposes exactly the contract fields — never the nominal or ids', async () => {
    const result = await verify(settled.nomorInternalAmwal);

    expect(Object.keys(result).sort()).toEqual(PUBLIC_FIELDS);
    expect(JSON.stringify(result)).not.toContain('250000');
    expect(JSON.stringify(result)).not.toContain(settled.transactionId);
    expect(JSON.stringify(result)).not.toContain(settled.userId);
    expect(JSON.stringify(result)).not.toContain('Wakif Verifikasi');
  });

  test('masks the donor name for an anonymous donation', async () => {
    const result = await verify(anonymous.nomorInternalAmwal);

    expect(result.namaDonatur).toBe('Hamba Allah (Anonim)');
    expect(JSON.stringify(result)).not.toContain('Rahasia Sekali');
  });

  test('a certificate whose transaction is not settled is reported invalid', async () => {
    const result = await verify(pending.nomorInternalAmwal);

    expect(result.valid).toBe(false);
  });

  test('unknown certificate numbers raise NOT_FOUND, not an empty object', async () => {
    await expect(verify('CERT-AMW-2026-9999-NOPE')).rejects.toThrow(ORPCError);
  });
});

describe('certificate.verify — WIB date-time (I-5 end-to-end)', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    // 2026-09-30 17:30 UTC is 1 October 2026, 00:30 WIB. The old
    // `toLocaleDateString()` printed 30 September — the D4 defect.
    fixture = await createFixture({
      status: 'LUNAS',
      createdAt: '2026-09-30 17:30:00.000',
    });
  });

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  test('renders the WIB date-time with seconds, read as UTC from Postgres', async () => {
    const result = await verify(fixture.nomorInternalAmwal);

    expect(result.tanggalTransaksiLabel).toBe('01 Oktober 2026, 00:30:00 WIB');
    expect(result.tanggalTransaksi).toBe('2026-09-30T17:30:00.000Z');
  });
});
