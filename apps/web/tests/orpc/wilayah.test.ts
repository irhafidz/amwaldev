import { describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { like } from 'drizzle-orm';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * `router.wilayah.*` — cascading Provinsi/Kab-Kota/Kecamatan/Kelurahan
 * lookups over the Kepmendagri `wilayah` table (`db/seeds/wilayah.sql`).
 * Uses a synthetic "99.*" code prefix so the test never depends on the
 * ~91k-row real dataset being seeded into `TEST_DATABASE_URL`.
 */

const connectionUrl = assertTestDatabase();
const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const context = await createTestCaller({ database, user: null });

describe('oRPC wilayah cascade', () => {
  test('filters each jenjang by kode length + prefix', async () => {
    const rows = [
      { kode: '99', nama: 'Provinsi Uji' },
      { kode: '99.01', nama: 'Kabupaten Uji' },
      { kode: '99.01.01', nama: 'Kecamatan Uji' },
      { kode: '99.01.01.2001', nama: 'Kelurahan Uji' },
    ];

    try {
      await database.insert(schema.wilayah).values(rows);

      const provinces = await call(
        router.wilayah.getProvinces,
        {},
        { context }
      );
      expect(
        provinces.data.some((p) => p.kode === '99' && p.nama === 'Provinsi Uji')
      ).toBe(true);

      const regencies = await call(
        router.wilayah.getRegencies,
        { provinceCode: '99' },
        { context }
      );
      expect(regencies.data).toEqual([
        { kode: '99.01', nama: 'Kabupaten Uji' },
      ]);

      const districts = await call(
        router.wilayah.getDistricts,
        { regencyCode: '99.01' },
        { context }
      );
      expect(districts.data).toEqual([
        { kode: '99.01.01', nama: 'Kecamatan Uji' },
      ]);

      const villages = await call(
        router.wilayah.getVillages,
        { districtCode: '99.01.01' },
        { context }
      );
      expect(villages.data).toEqual([
        { kode: '99.01.01.2001', nama: 'Kelurahan Uji' },
      ]);
    } finally {
      await database
        .delete(schema.wilayah)
        .where(like(schema.wilayah.kode, '99%'));
    }
  });
});
