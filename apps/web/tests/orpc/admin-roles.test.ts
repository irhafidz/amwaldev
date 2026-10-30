import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { defaultMatrix } from '@amwal/core/auth/permissions';
import { call } from '@orpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import type { ORPCContext } from '../../src/lib/orpc/context';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/** admin.roles.* — persisted feature-permission matrix. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const adminId = `admrole-${ulid().toLowerCase()}-admin`;
let admin: ORPCContext;

beforeAll(async () => {
  await database.insert(schema.users).values({
    id: adminId,
    name: 'Admin Role Uji',
    role: 'ADMIN',
    updatedAt: new Date().toISOString(),
  });
  admin = await createTestCaller({
    database,
    user: { userId: adminId, role: 'ADMIN' },
  });
});

afterAll(async () => {
  await database.delete(schema.users).where(eq(schema.users.id, adminId));
});

async function restoreCell(
  role: 'NADZIR' | 'BENDAHARA',
  featureKey: string,
  isEnabled: boolean
) {
  await database
    .update(schema.rolePermissions)
    .set({ isEnabled })
    .where(
      and(
        eq(schema.rolePermissions.role, role),
        eq(schema.rolePermissions.featureKey, featureKey)
      )
    );
}

describe('admin.roles', () => {
  test('getMatrix returns the seeded defaults with ADMIN fully enabled', async () => {
    const { data } = await call(router.admin.roles.getMatrix, undefined, {
      context: admin,
    });
    expect(data.matrix.ADMIN.konfigurasi_role).toBe(true);
    expect(data.matrix.WAKIF.buat_program).toBe(false);
    expect(data.matrix.BENDAHARA.ledger_akuntansi).toBe(true);
    expect(Object.keys(data.matrix).sort()).toEqual(
      Object.keys(defaultMatrix()).sort()
    );
  });

  test('updateMatrix persists changes and getMatrix reads them back', async () => {
    const before = await call(router.admin.roles.getMatrix, undefined, {
      context: admin,
    });
    const nadzirHapus = before.data.matrix.NADZIR.hapus_program;
    const bendaharaVideo = before.data.matrix.BENDAHARA.unggah_video;

    try {
      const result = await call(
        router.admin.roles.updateMatrix,
        {
          changes: [
            {
              role: 'NADZIR',
              featureKey: 'hapus_program',
              isEnabled: !nadzirHapus,
            },
            // Same cell twice in one request: last write wins, no DB error.
            {
              role: 'BENDAHARA',
              featureKey: 'unggah_video',
              isEnabled: !bendaharaVideo,
            },
            {
              role: 'BENDAHARA',
              featureKey: 'unggah_video',
              isEnabled: bendaharaVideo,
            },
          ],
        },
        { context: admin }
      );
      expect(result.data.updated).toBe(2);

      const after = await call(router.admin.roles.getMatrix, undefined, {
        context: admin,
      });
      expect(after.data.matrix.NADZIR.hapus_program).toBe(!nadzirHapus);
      expect(after.data.matrix.BENDAHARA.unggah_video).toBe(bendaharaVideo);
    } finally {
      await restoreCell('NADZIR', 'hapus_program', nadzirHapus);
      await restoreCell('BENDAHARA', 'unggah_video', bendaharaVideo);
    }
  });

  test('the ADMIN master row and unknown features cannot be written', async () => {
    const adminRow = {
      changes: [
        { role: 'ADMIN', featureKey: 'konfigurasi_role', isEnabled: false },
      ],
    };
    const unknownFeature = {
      changes: [{ role: 'NADZIR', featureKey: 'nope', isEnabled: true }],
    };
    for (const invalid of [adminRow, unknownFeature]) {
      await expect(
        call(router.admin.roles.updateMatrix, invalid as never, {
          context: admin,
        })
      ).rejects.toMatchObject({ status: 400 });
    }

    const rows = await database
      .select({ isEnabled: schema.rolePermissions.isEnabled })
      .from(schema.rolePermissions)
      .where(
        and(
          eq(schema.rolePermissions.role, 'ADMIN'),
          inArray(schema.rolePermissions.featureKey, ['konfigurasi_role'])
        )
      );
    expect(rows.every((r) => r.isEnabled)).toBe(true);
  });
});
