import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { issueRefreshToken, rotateRefreshToken } from '@amwal/core/auth/tokens';
import { call } from '@orpc/server';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import type { ORPCContext } from '../../src/lib/orpc/context';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * admin.users.* and the login/refresh lockout it relies on. Fixtures carry a
 * per-run id so searches are unambiguous on a shared test database.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
const adminId = `admusr-${runId}-admin`;
const nadzirId = `admusr-${runId}-nadzir`;
const createdIds: string[] = [];
let admin: ORPCContext;
let nadzirCaller: ORPCContext;

const staff = (suffix: string) => ({
  fullName: `Staf Uji ${runId} ${suffix}`,
  email: `staf-${runId}-${suffix}@example.com`,
  phone: `08${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
  role: 'BENDAHARA' as const,
  institution: 'Yayasan Uji Amwal',
});

beforeAll(async () => {
  const now = new Date().toISOString();
  await database.insert(schema.users).values([
    { id: adminId, name: `Admin Uji ${runId}`, role: 'ADMIN', updatedAt: now },
    {
      id: nadzirId,
      name: `Nadzir Uji ${runId}`,
      role: 'NADZIR',
      updatedAt: now,
    },
  ]);
  admin = await createTestCaller({
    database,
    user: { userId: adminId, role: 'ADMIN' },
  });
  nadzirCaller = await createTestCaller({
    database,
    user: { userId: nadzirId, role: 'NADZIR' },
  });
});

afterAll(async () => {
  const ids = [adminId, nadzirId, ...createdIds];
  await database
    .delete(schema.refreshTokens)
    .where(inArray(schema.refreshTokens.userId, ids));
  await database.delete(schema.users).where(inArray(schema.users.id, ids));
});

describe('admin.users: guards', () => {
  test('rejects guests (401) and non-admin roles (403)', async () => {
    const guest = await createTestCaller({ database, user: null });
    await expect(
      call(router.admin.users.list, {}, { context: guest })
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      call(router.admin.users.list, {}, { context: nadzirCaller })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      call(router.admin.roles.getMatrix, undefined, { context: nadzirCaller })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('admin.users: createStaff + list', () => {
  test('creates a BENDAHARA with a hashed, generated password shown once', async () => {
    const input = staff('a');
    const { data } = await call(router.admin.users.createStaff, input, {
      context: admin,
    });
    createdIds.push(data.id);

    expect(data.role).toBe('BENDAHARA');
    expect(data.temporaryPassword).toHaveLength(12);

    const [row] = await database
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data.id));
    expect(row?.role).toBe('BENDAHARA');
    expect(row?.institution).toBe('Yayasan Uji Amwal');
    expect(row?.isActive).toBe(true);
    expect(row?.passwordHash).not.toContain(data.temporaryPassword ?? 'x');
    expect(
      await Bun.password.verify(
        data.temporaryPassword ?? '',
        row?.passwordHash ?? ''
      )
    ).toBe(true);
  });

  test('an admin-supplied password is never echoed; duplicates and ADMIN role are rejected', async () => {
    const input = { ...staff('b'), temporaryPassword: 'Sup3rSecret-pass' };
    const { data } = await call(router.admin.users.createStaff, input, {
      context: admin,
    });
    createdIds.push(data.id);
    expect(data.temporaryPassword).toBeUndefined();

    await expect(
      call(router.admin.users.createStaff, input, { context: admin })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      call(
        router.admin.users.createStaff,
        // @ts-expect-error ADMIN is not a creatable staff role
        { ...staff('c'), role: 'ADMIN' },
        { context: admin }
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  test('list filters by search/role/status, paginates, and hides the system user', async () => {
    const all = await call(
      router.admin.users.list,
      { search: runId, limit: 100 },
      { context: admin }
    );
    expect(all.data.total).toBeGreaterThanOrEqual(4);
    expect(all.data.items.some((u) => u.email?.includes(runId))).toBe(true);
    expect(all.data.stats.total).toBeGreaterThanOrEqual(all.data.total);

    const nadzirOnly = await call(
      router.admin.users.list,
      { search: runId, role: 'NADZIR' },
      { context: admin }
    );
    expect(nadzirOnly.data.items.map((u) => u.id)).toEqual([nadzirId]);

    const paged = await call(
      router.admin.users.list,
      { search: runId, page: 2, limit: 1 },
      { context: admin }
    );
    expect(paged.data.items).toHaveLength(1);

    const system = await call(
      router.admin.users.list,
      { search: 'Hamba Allah (Sistem)' },
      { context: admin }
    );
    expect(system.data.items).toHaveLength(0);

    // `%` must be matched literally, not as a wildcard.
    const wildcard = await call(
      router.admin.users.list,
      { search: '%' },
      { context: admin }
    );
    expect(
      wildcard.data.items.every((u) =>
        /%/.test(`${u.name}${u.email}${u.phone}`)
      )
    ).toBe(true);
  });
});

describe('admin.users: updateRole + toggleStatus', () => {
  test('changes a role, but never your own', async () => {
    const { data } = await call(
      router.admin.users.updateRole,
      { userId: nadzirId, newRole: 'PETUGAS_LAPANGAN' },
      { context: admin }
    );
    expect(data?.role).toBe('PETUGAS_LAPANGAN');

    await expect(
      call(
        router.admin.users.updateRole,
        { userId: adminId, newRole: 'WAKIF' },
        { context: admin }
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      call(
        router.admin.users.toggleStatus,
        { userId: adminId, isActive: false },
        { context: admin }
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  test('a deactivated account cannot log in or refresh; reactivating restores both', async () => {
    const input = { ...staff('d'), temporaryPassword: 'Sup3rSecret-pass' };
    const { data } = await call(router.admin.users.createStaff, input, {
      context: admin,
    });
    createdIds.push(data.id);
    const loginWith = async () =>
      call(
        router.auth.login,
        {
          identifier: input.email.toLowerCase(),
          password: input.temporaryPassword,
        },
        {
          context: await createTestCaller({
            database,
            user: null,
            resHeaders: new Headers(),
          }),
        }
      );

    expect((await loginWith()).user.role).toBe('BENDAHARA');

    const refreshToken = await issueRefreshToken(data.id, database);
    await call(
      router.admin.users.toggleStatus,
      { userId: data.id, isActive: false },
      { context: admin }
    );

    await expect(loginWith()).rejects.toMatchObject({ status: 403 });
    expect(
      await rotateRefreshToken(refreshToken, database, jwtSecret)
    ).toBeNull();

    await call(
      router.admin.users.toggleStatus,
      { userId: data.id, isActive: true },
      { context: admin }
    );
    expect((await loginWith()).user.role).toBe('BENDAHARA');
  });

  test('the last active Super Admin can be neither demoted nor deactivated', async () => {
    const targetId = `admusr-${runId}-lastadmin`;
    await database.insert(schema.users).values({
      id: targetId,
      name: 'Super Admin Terakhir',
      role: 'ADMIN',
      updatedAt: new Date().toISOString(),
    });
    createdIds.push(targetId);

    // Make `targetId` the only active ADMIN (the caller's JWT stays valid
    // because guards are stateless), then restore everything.
    const others = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.role, 'ADMIN'),
          eq(schema.users.isActive, true),
          ne(schema.users.id, targetId)
        )
      );
    const otherIds = others.map((u) => u.id);
    try {
      if (otherIds.length > 0) {
        await database
          .update(schema.users)
          .set({ isActive: false })
          .where(inArray(schema.users.id, otherIds));
      }

      await expect(
        call(
          router.admin.users.updateRole,
          { userId: targetId, newRole: 'NADZIR' },
          { context: admin }
        )
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        call(
          router.admin.users.toggleStatus,
          { userId: targetId, isActive: false },
          { context: admin }
        )
      ).rejects.toMatchObject({ status: 400 });

      const [still] = await database
        .select({ role: schema.users.role, isActive: schema.users.isActive })
        .from(schema.users)
        .where(eq(schema.users.id, targetId));
      expect(still).toEqual({ role: 'ADMIN', isActive: true });
    } finally {
      if (otherIds.length > 0) {
        await database
          .update(schema.users)
          .set({ isActive: true })
          .where(inArray(schema.users.id, otherIds));
      }
    }
  });
});
