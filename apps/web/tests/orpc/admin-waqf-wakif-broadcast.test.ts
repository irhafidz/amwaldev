import { describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * `admin.waqf.wakifList` (real donor register, unmasked for admin/legal
 * use), `admin.waqf.broadcastProgress` (best-effort WA dispatch, never
 * throws even with no Baileys service configured), and `receipts.waqf.update`
 * (title/vendor/nominal edit that never touches the physical file).
 */

const connectionUrl = assertTestDatabase();
const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

async function createProgramWithWakif(): Promise<{
  programId: string;
  nadzirProfileId: string;
  nadzirUserId: string;
  orderId: string;
}> {
  const runId = ulid().toLowerCase();
  const nadzirUserId = `p17wf-${runId}-nadzir-user`;
  const nadzirProfileId = `p17wf-${runId}-nadzir-profile`;
  const programId = `p17wf-${runId}-program`;
  const orderId = `p17wf-${runId}-order`;
  const now = new Date().toISOString();

  await database.insert(schema.users).values({
    id: nadzirUserId,
    name: 'Nadzir Wakif Test',
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
    judul: `Program Wakif Test ${runId}`,
    targetDana: '100000000',
    jenisWakaf: 'HABIS_PAKAI',
    status: 'LIVE',
    updatedAt: now,
  });
  await database.insert(schema.waqfOrders).values({
    id: orderId,
    nomorKwitansi: `KW-${runId}`,
    waqfProgramId: programId,
    namaWakif: 'H. Bara Ardiwinata',
    noTelepon: '081234567890',
    bentukWakaf: 'UANG',
    nominal: '5000000',
    metodePembayaran: 'QRIS',
    status: 'TERVERIFIKASI',
  });

  return { programId, nadzirProfileId, nadzirUserId, orderId };
}

async function createAdminUser(): Promise<string> {
  const adminId = `p17wf-${ulid().toLowerCase()}-admin`;
  await database.insert(schema.users).values({
    id: adminId,
    name: 'Admin Wakif Test',
    role: 'ADMIN',
    updatedAt: new Date().toISOString(),
  });
  return adminId;
}

async function cleanup(fixture: {
  programId: string;
  nadzirProfileId: string;
  nadzirUserId: string;
  orderId: string;
  adminUserId: string;
}): Promise<void> {
  await database
    .delete(schema.waqfOrders)
    .where(eq(schema.waqfOrders.id, fixture.orderId));
  await database
    .delete(schema.waqfPrograms)
    .where(eq(schema.waqfPrograms.id, fixture.programId));
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, fixture.nadzirProfileId));
  await database
    .delete(schema.users)
    .where(eq(schema.users.id, fixture.nadzirUserId));
  await database
    .delete(schema.users)
    .where(eq(schema.users.id, fixture.adminUserId));
}

describe('admin.waqf.wakifList & broadcastProgress', () => {
  test('wakifList returns the real unmasked donor with phone, and broadcastProgress never throws with no Baileys configured', async () => {
    const fixture = await createProgramWithWakif();
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    try {
      const list = await call(
        router.admin.waqf.wakifList,
        { id: fixture.programId },
        { context }
      );
      expect(list.data).toHaveLength(1);
      expect(list.data[0]?.namaWakif).toBe('H. Bara Ardiwinata');
      expect(list.data[0]?.noTelepon).toBe('081234567890');
      expect(list.data[0]?.nominal).toBe('5000000.00');

      const result = await call(
        router.admin.waqf.broadcastProgress,
        {
          id: fixture.programId,
          message: 'Update progres pembangunan mencapai 50%, alhamdulillah.',
        },
        { context }
      );
      expect(result.data.totalRecipients).toBe(1);
      // No BAILEYS_SERVICE_URL in the test env — sendWhatsAppNotification
      // returns false immediately rather than throwing, per its own
      // fail-open-but-never-throw contract (a failed WA send must never
      // break the request).
      expect(result.data.sent).toBe(0);
    } finally {
      await cleanup({ ...fixture, adminUserId });
    }
  });
});

describe('receipts.waqf.update', () => {
  test('updates title/vendor/nominal without touching the file', async () => {
    const fixture = await createProgramWithWakif();
    const adminUserId = await createAdminUser();
    const context = await createTestCaller({
      database,
      user: { userId: adminUserId, role: 'ADMIN' },
    });

    const attachmentId = `PRA-${ulid().toLowerCase()}`;
    await database.insert(schema.programReceiptAttachments).values({
      id: attachmentId,
      waqfProgramId: fixture.programId,
      objectKey: `amwal-receipts/${fixture.programId}/${ulid().toLowerCase()}.jpg`,
      fileName: 'original-file-name.jpg',
      title: 'Judul Lama',
      vendorName: 'Vendor Lama',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      nominal: '100000',
      isPhotoEvidence: true,
      uploadedById: adminUserId,
    });

    try {
      const updated = await call(
        router.receipts.waqf.update,
        {
          id: attachmentId,
          title: 'Semen Holcim 50 Sak',
          vendorName: 'Toko Bangunan Berkah',
          nominal: 500_000,
        },
        { context }
      );

      expect(updated.data.title).toBe('Semen Holcim 50 Sak');
      expect(updated.data.vendorName).toBe('Toko Bangunan Berkah');
      expect(updated.data.nominal).toBe('500000.00');
      expect(updated.data.fileName).toBe('original-file-name.jpg');
    } finally {
      await database
        .delete(schema.programReceiptAttachments)
        .where(eq(schema.programReceiptAttachments.id, attachmentId));
      await cleanup({ ...fixture, adminUserId });
    }
  });
});
