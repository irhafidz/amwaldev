import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Putaran 17, Batch 4 — the oRPC-side twin of
 * `apps/server/tests/waqf/admin-waqf.test.ts`. Same RBAC guard, same
 * program-verification/yield/withdrawal-review cases, exercised through
 * `router.admin.waqf.*` via `call()`. The over-draw case is the Zone 0
 * fiqh-invariant proof: `ORPCError('UNPROCESSABLE_CONTENT')` maps to
 * HTTP 422, same as the original REST route. Uses `createTestCaller`
 * (Batch 5) for context/JWT setup.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

async function createProgramFixture(): Promise<{
  programId: string;
  nadzirProfileId: string;
  nadzirUserId: string;
}> {
  const runId = ulid().toLowerCase();
  const nadzirUserId = `p17b4-${runId}-nadzir-user`;
  const nadzirProfileId = `p17b4-${runId}-nadzir-profile`;
  const programId = `p17b4-${runId}-program`;
  const now = new Date().toISOString();

  await database.insert(schema.users).values({
    id: nadzirUserId,
    name: 'Nadzir P17-B4',
    updatedAt: now,
  });
  await database.insert(schema.nadzirProfiles).values({
    id: nadzirProfileId,
    userId: nadzirUserId,
    kategori: 'ORGANISASI',
    updatedAt: now,
  });
  await database.insert(schema.waqfPrograms).values({
    id: programId,
    nadzirProfileId,
    judul: `Program Admin ${runId}`,
    targetDana: '100000000',
    jenisWakaf: 'PRODUKTIF_KEKAL',
    status: 'DRAFT',
    updatedAt: now,
  });

  return { programId, nadzirProfileId, nadzirUserId };
}

async function createAdminUser(): Promise<string> {
  const adminId = `p17b4-${ulid().toLowerCase()}-admin`;
  await database.insert(schema.users).values({
    id: adminId,
    name: 'Admin P17-B4',
    role: 'ADMIN',
    updatedAt: new Date().toISOString(),
  });
  return adminId;
}

async function cleanupFixture(fixture: {
  programId: string;
  nadzirProfileId: string;
  nadzirUserId: string;
  adminUserId?: string;
  requesterUserId?: string;
}): Promise<void> {
  await database
    .delete(schema.waqfYieldEntries)
    .where(eq(schema.waqfYieldEntries.waqfProgramId, fixture.programId));
  await database
    .delete(schema.waqfPrincipalLedgers)
    .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, fixture.programId));
  await database
    .delete(schema.fundWithdrawalRequests)
    .where(eq(schema.fundWithdrawalRequests.waqfProgramId, fixture.programId));
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, fixture.programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));

  const userIds = [
    fixture.nadzirUserId,
    fixture.adminUserId,
    fixture.requesterUserId,
  ].filter((id): id is string => Boolean(id));

  for (const userId of userIds) {
    await database.delete(schema.users).where(eq(schema.users.id, userId));
  }
}

async function seedLedger(
  programId: string,
  values: {
    pokokDanaTerkumpul: string;
    totalHasilAvailable: string;
    hasilInvestasiTersalurkan?: string;
  }
): Promise<void> {
  await database.insert(schema.waqfPrincipalLedgers).values({
    id: `p17b4-${ulid().toLowerCase()}-ledger`,
    waqfProgramId: programId,
    pokokDanaTerkumpul: values.pokokDanaTerkumpul,
    totalHasilAvailable: values.totalHasilAvailable,
    hasilInvestasiTersalurkan: values.hasilInvestasiTersalurkan ?? '0',
    updatedAt: new Date().toISOString(),
  });
}

async function seedWithdrawal(
  programId: string,
  requesterUserId: string,
  amount: string
): Promise<string> {
  const id = `p17b4-${ulid().toLowerCase()}-wr`;
  await database.insert(schema.fundWithdrawalRequests).values({
    id,
    waqfProgramId: programId,
    amount,
    requestedById: requesterUserId,
    status: 'PENDING',
  });
  return id;
}

function readLedger(programId: string) {
  return database
    .select()
    .from(schema.waqfPrincipalLedgers)
    .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId))
    .limit(1)
    .then((rows) => rows[0]);
}

describe('oRPC admin waqf dashboard', () => {
  test('auth guard rejects guests and non-admin roles', async () => {
    const { programId, ...fixture } = await createProgramFixture();

    try {
      const guestContext = await createTestCaller({ database, user: null });
      try {
        await call(
          router.admin.waqf.verifyProgram,
          { id: programId, status: 'VERIFIED' },
          { context: guestContext }
        );
        throw new Error('expected call to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(401);
      }

      const wakifContext = await createTestCaller({
        database,
        user: { userId: 'p17b4-wakif-user', role: 'WAKIF' },
      });
      try {
        await call(
          router.admin.waqf.verifyProgram,
          { id: programId, status: 'VERIFIED' },
          { context: wakifContext }
        );
        throw new Error('expected call to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(403);
      }
    } finally {
      await cleanupFixture({ programId, ...fixture });
    }
  });

  test('createProgram inserts a LIVE program row and a zero-balance ledger', async () => {
    const nadzirUserId = `p17b4-${ulid().toLowerCase()}-nadzir-user`;
    const nadzirProfileId = `p17b4-${ulid().toLowerCase()}-nadzir-profile`;
    const now = new Date().toISOString();
    await database.insert(schema.users).values({
      id: nadzirUserId,
      name: 'Nadzir Create-Program',
      updatedAt: now,
    });
    await database.insert(schema.nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      kategori: 'ORGANISASI',
      updatedAt: now,
    });

    const adminUserId = await createAdminUser();
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    let programId: string | undefined;
    try {
      const result = await call(
        router.admin.waqf.createProgram,
        {
          nadzirProfileId,
          judul: 'Program Wakaf Modal Refactor Test',
          deskripsi: 'Dibuat oleh test createProgram',
          kategori: 'Infrastruktur & Sosial',
          targetDana: 250_000_000,
          durasiHari: 90,
          jenisWakaf: 'PRODUKTIF_KEKAL',
        },
        { context: adminContext }
      );

      programId = result.data.id;
      expect(result.data.judul).toBe('Program Wakaf Modal Refactor Test');
      expect(result.data.targetDana).toBe('250000000.00');
      expect(result.data.kodeProgram).toMatch(/^60\d{6}$/);

      const [row] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      expect(row?.status).toBe('LIVE');
      expect(row?.durasiHari).toBe(90);
      expect(row?.kodeProgram).toBe(result.data.kodeProgram);

      const ledger = await readLedger(programId);
      expect(ledger?.pokokDanaTerkumpul).toBe('0.00');
    } finally {
      if (programId) {
        await database
          .delete(schema.waqfPrincipalLedgers)
          .where(eq(schema.waqfPrincipalLedgers.waqfProgramId, programId));
        await database
          .delete(schema.waqfPrograms)
          .where(eq(schema.waqfPrograms.id, programId));
      }
      await database
        .delete(schema.nadzirProfiles)
        .where(eq(schema.nadzirProfiles.id, nadzirProfileId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, nadzirUserId));
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, adminUserId));
    }
  });

  test('updateProgram persists wilayah/dokumen edits and never touches Nadzir/akad', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    try {
      const updated = await call(
        router.admin.waqf.updateProgram,
        {
          id: programId,
          judul: 'Program Wakaf (Direvisi)',
          targetDana: 300_000_000,
          provinsi: 'Jawa Timur',
          kabupatenKota: 'Kabupaten Bojonegoro',
          kecamatan: 'Kecamatan Dander',
          kelurahanDesa: 'Desa Ngablak',
          kodeWilayah: '35.22.05.2001',
          rabDocumentUrl: 'https://example.com/rab.pdf',
          dokumenLegalitasUrl: 'https://example.com/aiw.pdf',
        },
        { context: adminContext }
      );
      expect(updated.data.judul).toBe('Program Wakaf (Direvisi)');
      expect(updated.data.targetDana).toBe('300000000.00');
      expect(updated.data.provinsi).toBe('Jawa Timur');
      expect(updated.data.kodeWilayah).toBe('35.22.05.2001');
      expect(updated.data.rabDocumentUrl).toBe('https://example.com/rab.pdf');

      // Refetch (simulates a page refresh) — the edit must have survived.
      const [row] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      expect(row?.judul).toBe('Program Wakaf (Direvisi)');
      expect(row?.provinsi).toBe('Jawa Timur');
      expect(row?.kecamatan).toBe('Kecamatan Dander');
      expect(row?.dokumenLegalitasUrl).toBe('https://example.com/aiw.pdf');
      // Nadzir/akad untouched by this procedure.
      expect(row?.nadzirProfileId).toBe(fixture.nadzirProfileId);
      expect(row?.jenisWakaf).toBe('PRODUKTIF_KEKAL');

      // A follow-up edit that omits wilayah must NOT wipe it back to null.
      await call(
        router.admin.waqf.updateProgram,
        { id: programId, judul: 'Program Wakaf (Revisi Kedua)' },
        { context: adminContext }
      );
      const [rowAfter] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      expect(rowAfter?.judul).toBe('Program Wakaf (Revisi Kedua)');
      expect(rowAfter?.provinsi).toBe('Jawa Timur');
    } finally {
      await cleanupFixture({ programId, ...fixture, adminUserId });
    }
  });

  test('deleteProgram removes a donation-free program but is rejected once an order exists', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });
    const wakifUserId = `p17b4-${ulid().toLowerCase()}-wakif`;
    let orderId: string | undefined;

    try {
      await seedLedger(programId, {
        pokokDanaTerkumpul: '0',
        totalHasilAvailable: '0',
      });

      await database.insert(schema.users).values({
        id: wakifUserId,
        name: 'Wakif P17-B4',
        updatedAt: new Date().toISOString(),
      });
      orderId = `p17b4-${ulid().toLowerCase()}-order`;
      await database.insert(schema.waqfOrders).values({
        id: orderId,
        waqfProgramId: programId,
        wakifId: wakifUserId,
        namaWakif: 'Wakif P17-B4',
        nomorKwitansi: `KWT-${ulid().toLowerCase()}`,
        nominal: '1000000',
        bentukWakaf: 'UANG',
      });

      await expect(
        call(
          router.admin.waqf.deleteProgram,
          { id: programId },
          { context: adminContext }
        )
      ).rejects.toThrow(ORPCError);

      await database
        .delete(schema.waqfOrders)
        .where(eq(schema.waqfOrders.id, orderId));
      orderId = undefined;

      const deleted = await call(
        router.admin.waqf.deleteProgram,
        { id: programId },
        { context: adminContext }
      );
      expect(deleted.success).toBe(true);

      const [row] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      expect(row).toBeUndefined();
      const ledgerAfter = await readLedger(programId);
      expect(ledgerAfter).toBeUndefined();
    } finally {
      if (orderId) {
        await database
          .delete(schema.waqfOrders)
          .where(eq(schema.waqfOrders.id, orderId));
      }
      // Idempotent even though deleteProgram already removed the program +
      // ledger row on the success path above.
      await cleanupFixture({ programId, ...fixture, adminUserId });
      await database
        .delete(schema.users)
        .where(eq(schema.users.id, wakifUserId));
    }
  });

  test('program verification requires admin notes on rejection', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    try {
      const verified = await call(
        router.admin.waqf.verifyProgram,
        { id: programId, status: 'VERIFIED' },
        { context: adminContext }
      );
      expect(verified.success).toBe(true);

      const [verifiedProgram] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      expect(verifiedProgram?.verificationStatus).toBe('VERIFIED');
      expect(verifiedProgram?.verifiedById).toBe(adminUserId);

      try {
        await call(
          router.admin.waqf.verifyProgram,
          { id: programId, status: 'REJECTED' },
          { context: adminContext }
        );
        throw new Error('expected call to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
      }

      const rejectedWithNotes = await call(
        router.admin.waqf.verifyProgram,
        {
          id: programId,
          status: 'REJECTED',
          adminNotes: 'Dokumen legalitas belum lengkap',
        },
        { context: adminContext }
      );
      expect(rejectedWithNotes.success).toBe(true);

      const [rejectedProgram] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, programId));
      expect(rejectedProgram?.verificationStatus).toBe('REJECTED');
      expect(rejectedProgram?.adminNotes).toBe(
        'Dokumen legalitas belum lengkap'
      );
    } finally {
      await cleanupFixture({ programId, ...fixture, adminUserId });
    }
  });

  test('yield entry inserts record, increments available yield, and never touches principal (Zone 0)', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });
    // Seed a non-zero principal first — a meaningless "unchanged" assertion
    // otherwise, since a fresh program has no ledger row at all.
    await seedLedger(programId, {
      pokokDanaTerkumpul: '900000000',
      totalHasilAvailable: '0',
    });

    try {
      const result = await call(
        router.admin.waqf.recordYield,
        {
          id: programId,
          nominal: 125_000,
          periodDate: '2026-09-10T00:00:00.000Z',
          description: 'Hasil investasi bulan September',
        },
        { context: adminContext }
      );
      expect(result.success).toBe(true);

      const [entry] = await database
        .select()
        .from(schema.waqfYieldEntries)
        .where(eq(schema.waqfYieldEntries.waqfProgramId, programId));
      expect(entry?.amount).toBe('125000.00');
      expect(entry?.recordedByAdminId).toBe(adminUserId);

      const ledger = await readLedger(programId);
      expect(Number(ledger?.totalHasilAvailable ?? 0)).toBe(125_000);
      // Zone 0: recording investment yield must never move the principal.
      expect(ledger?.pokokDanaTerkumpul).toBe('900000000.00');
    } finally {
      await cleanupFixture({ programId, ...fixture, adminUserId });
    }
  });

  test('withdrawal review approves and rejects with required notes', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const requesterUserId = `p17b4-${ulid().toLowerCase()}-requester`;
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });
    const now = new Date().toISOString();

    await database.insert(schema.users).values({
      id: requesterUserId,
      name: 'Requester P17-B4',
      updatedAt: now,
    });
    // The PRODUKTIF_KEKAL program needs a ledger with enough available yield
    // for the approval to satisfy the fiqh invariant.
    await seedLedger(programId, {
      pokokDanaTerkumpul: '1000000',
      totalHasilAvailable: '200000',
    });
    const trancheId = await seedWithdrawal(programId, requesterUserId, '50000');

    try {
      const approved = await call(
        router.admin.waqf.reviewWithdrawal,
        { id: trancheId, action: 'APPROVE' },
        { context: adminContext }
      );
      expect(approved.success).toBe(true);

      const [approvedTranche] = await database
        .select()
        .from(schema.fundWithdrawalRequests)
        .where(eq(schema.fundWithdrawalRequests.id, trancheId));
      expect(approvedTranche?.status).toBe('APPROVED');
      expect(approvedTranche?.approvedById).toBe(adminUserId);

      const secondWr = await seedWithdrawal(
        programId,
        requesterUserId,
        '10000'
      );
      try {
        await call(
          router.admin.waqf.reviewWithdrawal,
          { id: secondWr, action: 'REJECT' },
          { context: adminContext }
        );
        throw new Error('expected call to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
      } finally {
        await database
          .delete(schema.fundWithdrawalRequests)
          .where(eq(schema.fundWithdrawalRequests.id, secondWr));
      }
    } finally {
      await cleanupFixture({
        programId,
        ...fixture,
        adminUserId,
        requesterUserId,
      });
    }
  });
});

describe('oRPC admin waqf withdrawal — fiqh ledger invariant', () => {
  test('PRODUKTIF_KEKAL approval draws only from available yield, principal untouched', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const requesterUserId = `p17b4-${ulid().toLowerCase()}-req`;
    await database.insert(schema.users).values({
      id: requesterUserId,
      name: 'Req',
      updatedAt: new Date().toISOString(),
    });
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    try {
      await seedLedger(programId, {
        pokokDanaTerkumpul: '500000000',
        totalHasilAvailable: '10000000',
      });
      const wrId = await seedWithdrawal(programId, requesterUserId, '4000000');

      const result = await call(
        router.admin.waqf.reviewWithdrawal,
        { id: wrId, action: 'APPROVE' },
        { context: adminContext }
      );
      expect(result.success).toBe(true);

      const ledger = await readLedger(programId);
      // principal MUST be byte-identical
      expect(ledger?.pokokDanaTerkumpul).toBe('500000000.00');
      // yield drops by exactly the disbursement
      expect(ledger?.totalHasilAvailable).toBe('6000000.00');
      // disbursed counter rises by exactly the disbursement
      expect(ledger?.hasilInvestasiTersalurkan).toBe('4000000.00');
    } finally {
      await cleanupFixture({
        programId,
        ...fixture,
        adminUserId,
        requesterUserId,
      });
    }
  });

  test('PRODUKTIF_KEKAL over-draw is rejected with 422 and no row changes', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    const adminUserId = await createAdminUser();
    const requesterUserId = `p17b4-${ulid().toLowerCase()}-req`;
    await database.insert(schema.users).values({
      id: requesterUserId,
      name: 'Req',
      updatedAt: new Date().toISOString(),
    });
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    try {
      await seedLedger(programId, {
        pokokDanaTerkumpul: '500000000',
        totalHasilAvailable: '1000000',
      });
      const wrId = await seedWithdrawal(programId, requesterUserId, '5000000');

      try {
        await call(
          router.admin.waqf.reviewWithdrawal,
          { id: wrId, action: 'APPROVE' },
          { context: adminContext }
        );
        throw new Error('expected call to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(422);
      }

      const ledger = await readLedger(programId);
      expect(ledger?.pokokDanaTerkumpul).toBe('500000000.00');
      expect(ledger?.totalHasilAvailable).toBe('1000000.00');
      const [wr] = await database
        .select()
        .from(schema.fundWithdrawalRequests)
        .where(eq(schema.fundWithdrawalRequests.id, wrId));
      expect(wr?.status).toBe('PENDING');
    } finally {
      await cleanupFixture({
        programId,
        ...fixture,
        adminUserId,
        requesterUserId,
      });
    }
  });

  test('HABIS_PAKAI approval decrements principal', async () => {
    const { programId, ...fixture } = await createProgramFixture();
    await database
      .update(schema.waqfPrograms)
      .set({ jenisWakaf: 'HABIS_PAKAI' })
      .where(eq(schema.waqfPrograms.id, programId));
    const adminUserId = await createAdminUser();
    const requesterUserId = `p17b4-${ulid().toLowerCase()}-req`;
    await database.insert(schema.users).values({
      id: requesterUserId,
      name: 'Req',
      updatedAt: new Date().toISOString(),
    });
    const adminContext = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    try {
      await seedLedger(programId, {
        pokokDanaTerkumpul: '20000000',
        totalHasilAvailable: '0',
      });
      const wrId = await seedWithdrawal(programId, requesterUserId, '7500000');

      const result = await call(
        router.admin.waqf.reviewWithdrawal,
        { id: wrId, action: 'APPROVE' },
        { context: adminContext }
      );
      expect(result.success).toBe(true);

      const ledger = await readLedger(programId);
      expect(ledger?.pokokDanaTerkumpul).toBe('12500000.00');
    } finally {
      await cleanupFixture({
        programId,
        ...fixture,
        adminUserId,
        requesterUserId,
      });
    }
  });
});
