import { afterAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** QA-12: tabel donatur infaq publik — hanya LUNAS, tanpa data kontak. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const ids = ['settled', 'anon', 'pending'].map((k) => `p5-${runId}-${k}`);

afterAll(async () => {
  await database
    .delete(schema.infaqOrders)
    .where(inArray(schema.infaqOrders.id, ids));
});

async function insert(id: string, name: string, status: 'SETTLED' | 'PENDING') {
  await database.insert(schema.infaqOrders).values({
    id,
    orderId: `INF-${id}`,
    namaPenginfaq: name,
    teleponPenginfaq: '081234567890',
    emailPenginfaq: 'rahasia@example.com',
    doa: 'doa pribadi',
    nominal: '75000.00',
    jenis: 'INFAQ_UMUM',
    status,
  });
}

describe('infaq.donatur (public)', () => {
  test('lists only settled donations, keeps anonymity, never leaks contact or doa', async () => {
    await insert(ids[0] as string, 'Budi Santoso', 'SETTLED');
    await insert(ids[1] as string, 'Hamba Allah', 'SETTLED');
    await insert(ids[2] as string, 'Belum Bayar', 'PENDING');

    const context = await createTestCaller({ database, user: null });
    const { data } = await call(router.infaq.donatur, undefined, { context });
    const mine = data.filter((row) => ids.includes(row.id));

    expect(mine.map((row) => row.donorName).sort()).toEqual([
      'Budi Santoso',
      'Hamba Allah',
    ]);
    expect(JSON.stringify(data)).not.toContain('rahasia@example.com');
    expect(JSON.stringify(data)).not.toContain('081234567890');
    expect(JSON.stringify(data)).not.toContain('doa pribadi');
    expect(data.length).toBeLessThanOrEqual(50);
  });
});
