import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { db } from '../../src/lib/db';
import { users } from '../../src/lib/db/schema';
import { user } from '../../src/lib/orpc/router/user';
import { createTestCaller } from './test-utils';

const now = () => new Date().toISOString();

async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const userId = `s-user-${ulid().toLowerCase()}`;
  await db.insert(users).values({
    id: userId,
    name: 'Donor Uji Profil',
    updatedAt: now(),
    ...overrides,
  });
  return userId;
}

async function cleanupUser(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}

describe('User Router — user.getProfile', () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createUser({ name: 'Bara Ardiwinata' });
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  test('returns user profile data, stats, and gamification level', async () => {
    const context = await createTestCaller({
      database: db,
      user: { userId, role: 'WAKIF' },
    });

    const result = await call(user.getProfile, undefined, { context });

    expect(result.user).toBeDefined();
    expect(result.user.id).toBe(userId);
    expect(result.user.name).toBe('Bara Ardiwinata');
    expect(result.stats).toEqual({
      totalWakaf: 0,
      proyekDidanai: 0,
      sertifikatTerbit: 0,
      totalZakat: 0,
    });
    expect(result.gamification).toEqual({
      level: 'LEVEL 1 • MUBTADI',
      xp: 0,
    });
    expect(result.documents).toEqual([]);
  });

  test('rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
    const context = await createTestCaller({
      database: db,
      user: null,
    });

    expect(call(user.getProfile, undefined, { context })).rejects.toThrow(
      ORPCError
    );
  });
});

describe('User Router — user.updateProfile', () => {
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    userId = await createUser({ name: 'Bara Ardiwinata' });
    otherUserId = await createUser({
      name: 'Pemilik Nomor Lain',
      phone: '081234567890',
    });
  });

  afterAll(async () => {
    await cleanupUser(userId);
    await cleanupUser(otherUserId);
  });

  test('successfully updates and normalizes birthDate, gender, and phone number', async () => {
    const context = await createTestCaller({
      database: db,
      user: { userId, role: 'WAKIF' },
    });

    const result = await call(
      user.updateProfile,
      {
        name: 'Bara Ardiwinata',
        phone: '0812-3317-7952',
        gender: 'male',
        birthDate: '23/08/2003',
        address: 'Jl. Teknik Kimia ITS Surabaya',
      },
      { context }
    );

    expect(result.message).toBe('Profil berhasil diperbarui');
    expect(result.data.name).toBe('Bara Ardiwinata');
    expect(result.data.phone).toBe('081233177952');
    expect(result.data.gender).toBe('Laki-laki');
    expect(result.data.birthDate).toBe('2003-08-23');
    expect(result.data.address).toBe('Jl. Teknik Kimia ITS Surabaya');
  });

  test('rejects duplicate phone number claimed by another user with 409 CONFLICT', async () => {
    const context = await createTestCaller({
      database: db,
      user: { userId, role: 'WAKIF' },
    });

    try {
      await call(
        user.updateProfile,
        {
          name: 'Bara Ardiwinata',
          phone: '081234567890',
        },
        { context }
      );
      expect.unreachable('Should have thrown CONFLICT error');
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      const orpcErr = err as { code: string; message: string };
      expect(orpcErr.code).toBe('CONFLICT');
      expect(orpcErr.message).toContain('Nomor telepon sudah digunakan');
    }
  });

  test('rejects unauthenticated update attempt with 401 UNAUTHORIZED', async () => {
    const context = await createTestCaller({
      database: db,
      user: null,
    });

    expect(
      call(
        user.updateProfile,
        {
          name: 'Bara Ardiwinata',
        },
        { context }
      )
    ).rejects.toThrow(ORPCError);
  });
});

describe('User Router — user.updatePreferences', () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createUser();
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  test('successfully updates user notification preferences', async () => {
    const context = await createTestCaller({
      database: db,
      user: { userId, role: 'WAKIF' },
    });

    const result = await call(
      user.updatePreferences,
      {
        notifikasi: true,
        newsletter: false,
      },
      { context }
    );

    expect(result.message).toBe('Preferensi berhasil diperbarui');
    expect(result.preferences.notifikasi).toBe(true);
    expect(result.preferences.newsletter).toBe(false);
  });
});
