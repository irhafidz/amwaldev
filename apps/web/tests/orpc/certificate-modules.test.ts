import { afterAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { signTestToken } from './test-utils';

/**
 * QA-11: sertifikat zakat, infaq, dan qurban memakai nama donatur dari
 * pesanan modulnya sendiri. Dulu hanya `waqf_orders` yang dibaca, jadi semua
 * sertifikat non-wakaf tercetak atas nama "Wakif Dermawan".
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { assembleCertificateData } = await import(
  '@amwal/core/certificate/service'
);
const { handle } = await import('../../src/routes/api/certificates.$id');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const userId = `p4-${runId}-donor`;
const created = {
  transactions: [] as string[],
  zakat: [] as string[],
  infaq: [] as string[],
  qurban: [] as string[],
};

await database.insert(schema.users).values({
  id: userId,
  name: 'Akun Donatur',
  updatedAt: new Date().toISOString(),
});

afterAll(async () => {
  await database
    .delete(schema.certificates)
    .where(inArray(schema.certificates.transactionId, created.transactions));
  if (created.zakat.length > 0) {
    await database
      .delete(schema.zakatOrders)
      .where(inArray(schema.zakatOrders.id, created.zakat));
  }
  if (created.infaq.length > 0) {
    await database
      .delete(schema.infaqOrders)
      .where(inArray(schema.infaqOrders.id, created.infaq));
  }
  if (created.qurban.length > 0) {
    await database
      .delete(schema.qurbanOrders)
      .where(inArray(schema.qurbanOrders.id, created.qurban));
  }
  await database
    .delete(schema.transactions)
    .where(inArray(schema.transactions.id, created.transactions));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
});

async function assemble(transactionId: string) {
  const [transaction] = await database
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, transactionId));
  if (!transaction) {
    throw new Error('transaction fixture missing');
  }
  return await assembleCertificateData(
    database,
    transaction,
    undefined,
    'https://amwal.id'
  );
}

describe('certificate donor name per module (QA-11)', () => {
  test('zakat: the muzakki name, masked only when anonymous', async () => {
    for (const [isAnonymous, suffix] of [
      [false, 'a'],
      [true, 'b'],
    ] as const) {
      const transactionId = `p4-${runId}-zakat-txn-${suffix}`;
      await database.insert(schema.transactions).values({
        id: transactionId,
        wakifId: userId,
        jenisTransaksi: 'ZAKAT',
        amount: '150000.00',
        statusPembayaran: 'LUNAS',
        disbursementDestination: 'Lembaga Uji',
      });
      created.transactions.push(transactionId);
      const orderId = `p4-${runId}-zakat-${suffix}`;
      await database.insert(schema.zakatOrders).values({
        id: orderId,
        nomorKwitansi: `KW-${orderId}`,
        muzakkiId: userId,
        namaMuzakki: 'Budi Santoso',
        isAnonymous,
        jenisZakat: 'MAAL_PENGHASILAN',
        metodePembayaran: 'TRANSFER',
        nominal: '150000.00',
        transactionId,
      });
      created.zakat.push(orderId);

      const { certData } = await assemble(transactionId);
      expect(certData.namaDonatur).toBe('Budi Santoso');
      expect(certData.isAnonymous).toBe(isAnonymous);
      expect(certData.jenisTransaksi).toBe('ZAKAT');
      expect(certData.nomorKwitansi).toBe(`KW-${orderId}`);
    }
  });

  test('infaq: the stored donor name (already "Hamba Allah" when anonymous)', async () => {
    const transactionId = `p4-${runId}-infaq-direct`;
    await database.insert(schema.transactions).values({
      id: transactionId,
      wakifId: userId,
      jenisTransaksi: 'INFAQ',
      amount: '150000.00',
      statusPembayaran: 'LUNAS',
      disbursementDestination: 'Lembaga Uji',
    });
    created.transactions.push(transactionId);
    const orderId = `p4-${runId}-infaq`;
    await database.insert(schema.infaqOrders).values({
      id: orderId,
      orderId: `INF-${runId}`,
      namaPenginfaq: 'Dewi Lestari',
      nominal: '150000.00',
      jenis: 'INFAQ_UMUM',
      transactionId,
    });
    created.infaq.push(orderId);

    const { certData } = await assemble(transactionId);
    expect(certData.namaDonatur).toBe('Dewi Lestari');
    expect(certData.jenisTransaksi).toBe('INFAQ');
  });

  test('qurban: the pengqurban name', async () => {
    const transactionId = `p4-${runId}-qurban-direct`;
    await database.insert(schema.transactions).values({
      id: transactionId,
      wakifId: userId,
      jenisTransaksi: 'QURBAN',
      amount: '150000.00',
      statusPembayaran: 'LUNAS',
      disbursementDestination: 'Lembaga Uji',
    });
    created.transactions.push(transactionId);
    const orderId = `p4-${runId}-qurban`;
    await database.insert(schema.qurbanOrders).values({
      id: orderId,
      namaPengqurban: 'Siti Aminah',
      jenisHewan: 'KAMBING',
      tipeKepemilikan: 'INDIVIDU',
      metodePembayaran: 'TRANSFER',
      totalHarga: '150000.00',
      transactionId,
    });
    created.qurban.push(orderId);

    const { certData } = await assemble(transactionId);
    expect(certData.namaDonatur).toBe('Siti Aminah');
    expect(certData.jenisTransaksi).toBe('QURBAN');
  });

  test('a settled non-waqf transaction downloads as a real PDF through the route', async () => {
    const transactionId = created.transactions.find((id) =>
      id.endsWith('qurban-direct')
    );
    if (!transactionId) {
      throw new Error('qurban fixture missing');
    }
    const token = await signTestToken({ userId, role: 'WAKIF' });
    const response = await handle({
      request: new Request(
        `http://localhost/api/certificates/${transactionId}`,
        {
          headers: { authorization: `Bearer ${token}` },
        }
      ),
      params: { id: transactionId },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeLessThan(300_000);
  });
});
