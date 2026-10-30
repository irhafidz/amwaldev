import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test';
import { sha256Body } from '@amwal/core/akad';
import { call, ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import {
  akadAcceptances,
  akadTemplates,
  nadzirProfiles,
  transactions,
  users,
  waqfOrders,
  waqfPrincipalLedgers,
  waqfPrograms,
} from '../../src/lib/db/schema';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

/** Rows inserted directly by individual tests, removed once in `afterAll`. */
const createdUserIds: string[] = [];
const createdTransactionIds: string[] = [];

async function cleanAkadData() {
  await database.delete(akadAcceptances);
  await database.delete(akadTemplates);
}

/**
 * `waqf.createOrder` writes a real order, a PENDING transaction (with a
 * gateway ref) and a program ledger. Leaving them behind piled up stale
 * PENDING rows that `reconcilePendingTransactions` then scanned in other
 * tests, so everything a program fixture created is removed here.
 */
async function deleteProgramFixture(fixture: {
  programId: string;
  nadzirProfileId: string;
  nadzirUserId: string;
}) {
  const orders = await database
    .select({
      id: waqfOrders.id,
      transactionId: waqfOrders.transactionId,
    })
    .from(waqfOrders)
    .where(eq(waqfOrders.waqfProgramId, fixture.programId));
  const transactionIds = orders.flatMap((order) =>
    order.transactionId ? [order.transactionId] : []
  );

  if (transactionIds.length > 0) {
    await database
      .delete(akadAcceptances)
      .where(inArray(akadAcceptances.transactionId, transactionIds));
  }
  await database
    .delete(waqfOrders)
    .where(eq(waqfOrders.waqfProgramId, fixture.programId));
  if (transactionIds.length > 0) {
    await database
      .delete(transactions)
      .where(inArray(transactions.id, transactionIds));
  }
  await database
    .delete(waqfPrincipalLedgers)
    .where(eq(waqfPrincipalLedgers.waqfProgramId, fixture.programId));
  await database
    .delete(waqfPrograms)
    .where(eq(waqfPrograms.id, fixture.programId));
  await database
    .delete(nadzirProfiles)
    .where(eq(nadzirProfiles.id, fixture.nadzirProfileId));
  await database.delete(users).where(eq(users.id, fixture.nadzirUserId));
}

async function seedAdminUser(userId: string) {
  createdUserIds.push(userId);
  const now = new Date().toISOString();
  await database.insert(users).values({
    id: userId,
    email: `${userId}@test.com`,
    name: 'Admin Test User',
    role: 'ADMIN',
    updatedAt: now,
  });
}

describe('oRPC Akad & Dynamic Templates (Sprint 11, I-6)', () => {
  beforeAll(async () => {
    await cleanAkadData();
  });

  afterEach(async () => {
    await cleanAkadData();
  });

  afterAll(async () => {
    await cleanAkadData();
    if (createdTransactionIds.length > 0) {
      await database
        .delete(transactions)
        .where(inArray(transactions.id, createdTransactionIds));
    }
    if (createdUserIds.length > 0) {
      await database.delete(users).where(inArray(users.id, createdUserIds));
    }
  });
  test('admin.akad.* rejects unauthenticated callers and non-ADMIN roles', async () => {
    const unauthenticatedContext = await createTestCaller({
      database,
      user: null,
    });

    try {
      await call(
        router.admin.akad.list,
        { module: 'WAKAF' },
        { context: unauthenticatedContext }
      );
      throw new Error('expected call to reject with 401');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }

    const wakifUserId = `akad-wakif-${ulid()}`;
    const wakifContext = await createTestCaller({
      database,
      user: { userId: wakifUserId, role: 'WAKIF' },
    });

    try {
      await call(
        router.admin.akad.list,
        { module: 'WAKAF' },
        { context: wakifContext }
      );
      throw new Error('expected call to reject with 403');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }
  });

  test('publishes, lists, and activates akad versions per module', async () => {
    const adminUserId = `admin-${ulid()}`;
    await seedAdminUser(adminUserId);
    const adminUser = { userId: adminUserId, role: 'ADMIN' as const };
    const adminContext = await createTestCaller({
      database,
      user: adminUser,
    });
    const publicContext = await createTestCaller({
      database,
      user: null,
    });

    const testModule = 'SEDEKAH' as const;

    // 1. Admin publishes version 1
    const v1 = await call(
      router.admin.akad.publishVersion,
      {
        module: testModule,
        title: 'Akad Sedekah V1',
        body: 'Saya berniat menyedekahkan harta ini karena Allah Taala.',
      },
      { context: adminContext }
    );

    expect(v1.module).toBe(testModule);
    expect(v1.version).toBeGreaterThanOrEqual(1);
    expect(v1.isActive).toBe(false);

    // 3. Admin publishes version 2
    const v2 = await call(
      router.admin.akad.publishVersion,
      {
        module: testModule,
        title: 'Akad Sedekah V2',
        body: 'Saya berniat menyedekahkan dana ini secara ikhlas.',
      },
      { context: adminContext }
    );

    expect(v2.version).toBe(v1.version + 1);
    expect(v2.isActive).toBe(false);

    // 4. List versions
    const versions = await call(
      router.admin.akad.list,
      { module: testModule },
      { context: adminContext }
    );
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions[0]?.version).toBe(v2.version);

    // 5. Activate V1
    const activatedV1 = await call(
      router.admin.akad.activate,
      { module: testModule, version: v1.version },
      { context: adminContext }
    );
    expect(activatedV1.isActive).toBe(true);

    const activeCheckV1 = await call(
      router.akad.active,
      { module: testModule },
      { context: publicContext }
    );
    expect(activeCheckV1?.id).toBe(v1.id);
    expect(activeCheckV1?.version).toBe(v1.version);

    // 6. Switch active to V2
    const activatedV2 = await call(
      router.admin.akad.activate,
      { module: testModule, version: v2.version },
      { context: adminContext }
    );
    expect(activatedV2.isActive).toBe(true);

    const activeCheckV2 = await call(
      router.akad.active,
      { module: testModule },
      { context: publicContext }
    );
    expect(activeCheckV2?.id).toBe(v2.id);
    expect(activeCheckV2?.version).toBe(v2.version);
  });

  test('invariant: activating a new version does not alter previously recorded acceptances', async () => {
    const adminUserId = `admin-${ulid()}`;
    await seedAdminUser(adminUserId);
    const adminUser = { userId: adminUserId, role: 'ADMIN' as const };
    const adminContext = await createTestCaller({
      database,
      user: adminUser,
    });

    const testModule = 'INFAQ' as const;

    const v1 = await call(
      router.admin.akad.publishVersion,
      {
        module: testModule,
        title: 'Akad Infaq V1',
        body: 'Teks akad persetujuan infaq versi pertama.',
      },
      { context: adminContext }
    );

    await call(
      router.admin.akad.activate,
      { module: testModule, version: v1.version },
      { context: adminContext }
    );

    const v1Hash = await sha256Body(v1.body);
    const fakeTxId = `TXN-AUDIT-${ulid()}`;
    const fakeUserId = `user-${ulid()}`;
    const now = new Date().toISOString();
    createdUserIds.push(fakeUserId);
    createdTransactionIds.push(fakeTxId);
    await database.insert(users).values({
      id: fakeUserId,
      email: `${fakeUserId}@test.com`,
      name: 'Test User',
      role: 'WAKIF',
      updatedAt: now,
    });

    await database.insert(transactions).values({
      id: fakeTxId,
      wakifId: fakeUserId,
      jenisTransaksi: 'INFAQ',
      amount: '50000',
      paymentMethod: 'qris',
      statusPembayaran: 'LUNAS',
      disbursementDestination: 'INFAQ_UMUM',
    });

    // Record an acceptance for V1
    await database.insert(akadAcceptances).values({
      transactionId: fakeTxId,
      akadTemplateId: v1.id,
      version: v1.version,
      bodySha256: v1Hash,
    });

    // Now publish and activate V2
    const v2 = await call(
      router.admin.akad.publishVersion,
      {
        module: testModule,
        title: 'Akad Infaq V2',
        body: 'Teks akad persetujuan infaq versi kedua yang telah diperbarui.',
      },
      { context: adminContext }
    );

    await call(
      router.admin.akad.activate,
      { module: testModule, version: v2.version },
      { context: adminContext }
    );

    // Verify historical acceptance record is unchanged
    const [auditRow] = await database
      .select()
      .from(akadAcceptances)
      .where(eq(akadAcceptances.transactionId, fakeTxId));

    expect(auditRow).toBeDefined();
    expect(auditRow?.akadTemplateId).toBe(v1.id);
    expect(auditRow?.version).toBe(v1.version);
    expect(auditRow?.bodySha256).toBe(v1Hash);
  });

  test('order creation detects stale akad version or hash mismatch with 409 CONFLICT', async () => {
    const adminUserId = `admin-${ulid()}`;
    await seedAdminUser(adminUserId);
    const adminUser = { userId: adminUserId, role: 'ADMIN' as const };
    const adminContext = await createTestCaller({
      database,
      user: adminUser,
    });
    const publicContext = await createTestCaller({
      database,
      user: null,
    });

    // Ensure an active template for WAKAF exists
    const v1 = await call(
      router.admin.akad.publishVersion,
      {
        module: 'WAKAF',
        title: 'Akad Wakaf Uang Resmi',
        body: 'Saya berniat berwakaf uang tunai untuk kemaslahatan umat.',
      },
      { context: adminContext }
    );
    await call(
      router.admin.akad.activate,
      { module: 'WAKAF', version: v1.version },
      { context: adminContext }
    );

    // Create a program with nadzir profile
    const nadzirUserId = `nadzir-${ulid()}`;
    const now = new Date().toISOString();
    await database.insert(users).values({
      id: nadzirUserId,
      email: `${nadzirUserId}@test.com`,
      name: 'Nadzir User',
      role: 'NADZIR',
      updatedAt: now,
    });
    const nadzirProfileId = `nadzir-prof-${ulid()}`;
    await database.insert(nadzirProfiles).values({
      id: nadzirProfileId,
      userId: nadzirUserId,
      namaLembaga: 'Yayasan Wakaf Test',
      kategori: 'ORGANISASI',
      statusVerifikasi: 'VERIFIED',
      updatedAt: now,
    });

    const programId = `prog-${ulid()}`;
    await database.insert(waqfPrograms).values({
      id: programId,
      nadzirProfileId,
      judul: 'Program Wakaf Sumur Uji',
      kategori: 'SUMUR_AIR',
      deskripsi: 'Deskripsi program',
      targetDana: '10000000',
      durasiHari: 30,
      jenisWakaf: 'PRODUKTIF_KEKAL',
      status: 'LIVE',
      updatedAt: now,
    });

    try {
      // 1. Missing akadAcceptance -> 400
      try {
        await call(
          router.waqf.createOrder,
          {
            programId,
            amount: 50_000,
            paymentType: 'qris',
            donorName: 'Ahmad Donatur',
            isAnonymous: false,
          },
          { context: publicContext }
        );
        throw new Error('expected 400 BAD_REQUEST');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(400);
      }

      // 2. Stale version -> 409
      try {
        await call(
          router.waqf.createOrder,
          {
            programId,
            amount: 50_000,
            paymentType: 'qris',
            donorName: 'Ahmad Donatur',
            isAnonymous: false,
            akadAcceptance: {
              templateId: v1.id,
              version: v1.version + 999,
              bodySha256: await sha256Body(v1.body),
            },
          },
          { context: publicContext }
        );
        throw new Error('expected 409 CONFLICT');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(409);
      }

      // 3. Tampered body hash -> 409
      try {
        await call(
          router.waqf.createOrder,
          {
            programId,
            amount: 50_000,
            paymentType: 'qris',
            donorName: 'Ahmad Donatur',
            isAnonymous: false,
            akadAcceptance: {
              templateId: v1.id,
              version: v1.version,
              bodySha256: '0'.repeat(64),
            },
          },
          { context: publicContext }
        );
        throw new Error('expected 409 CONFLICT');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(409);
      }

      // 4. Valid acceptance -> succeeds and records audit acceptance
      const result = await call(
        router.waqf.createOrder,
        {
          programId,
          amount: 50_000,
          paymentType: 'qris',
          donorName: 'Ahmad Donatur',
          isAnonymous: false,
          akadAcceptance: {
            templateId: v1.id,
            version: v1.version,
            bodySha256: await sha256Body(v1.body),
          },
        },
        { context: publicContext }
      );

      expect(result.orderId).toBeDefined();
      expect(result.transactionId).toBeDefined();

      const [recordedAcceptance] = await database
        .select()
        .from(akadAcceptances)
        .where(eq(akadAcceptances.transactionId, result.transactionId));

      expect(recordedAcceptance).toBeDefined();
      expect(recordedAcceptance?.akadTemplateId).toBe(v1.id);
      expect(recordedAcceptance?.version).toBe(v1.version);
      expect(recordedAcceptance?.bodySha256).toBe(await sha256Body(v1.body));
    } finally {
      await deleteProgramFixture({ programId, nadzirProfileId, nadzirUserId });
    }
  });
});
