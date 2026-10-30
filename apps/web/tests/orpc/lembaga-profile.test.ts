import { afterAll, describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * D6: profil publik lembaga nazhir (`waqf.lembaga`) — hanya yang terverifikasi,
 * hanya program LIVE, tanpa kontak pengurus atau data bank; nomor BWI diinput
 * admin saat verifikasi.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const userIds = [`p6-${runId}-u1`, `p6-${runId}-u2`, `p6-${runId}-admin`];
const profileIds = [`p6-${runId}-pf1`, `p6-${runId}-pf2`];
const programIds = ['live', 'draft'].map((k) => `p6-${runId}-${k}`);
const now = () => new Date().toISOString();
const phones = userIds.map(
  () =>
    `0812${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
);

afterAll(async () => {
  await database
    .delete(schema.waqfPrograms)
    .where(inArray(schema.waqfPrograms.id, programIds));
  await database
    .delete(schema.nadzirProfiles)
    .where(inArray(schema.nadzirProfiles.id, profileIds));
  await database.delete(schema.users).where(inArray(schema.users.id, userIds));
});

async function setup() {
  for (const [index, id] of userIds.entries()) {
    await database.insert(schema.users).values({
      id,
      name: `Pengurus ${index}`,
      email: `${id}@example.com`,
      phone: phones[index],
      updatedAt: now(),
    });
  }
  await database.insert(schema.nadzirProfiles).values([
    {
      id: profileIds[0] as string,
      userId: userIds[0] as string,
      kategori: 'BADAN_HUKUM',
      namaLembaga: 'Yayasan Uji Profil',
      namaBank: 'Bank Rahasia',
      nomorRekeningBank: '1234567890',
      statusVerifikasi: 'VERIFIED',
      nomorRegistrasiBwi: '3.3.00192/BWI/2026',
      updatedAt: now(),
    },
    {
      id: profileIds[1] as string,
      userId: userIds[1] as string,
      kategori: 'ORGANISASI',
      namaLembaga: 'Lembaga Belum Verifikasi',
      statusVerifikasi: 'PENDING',
      updatedAt: now(),
    },
  ]);
  const program = (
    id: string | undefined,
    status: 'LIVE' | 'DRAFT'
  ): typeof schema.waqfPrograms.$inferInsert => ({
    id: id as string,
    nadzirProfileId: profileIds[0] as string,
    judul: `Program ${status}`,
    targetDana: '100000000',
    jenisWakaf: 'PRODUKTIF_KEKAL',
    status,
    provinsi: 'Jawa Timur',
    kabupatenKota: 'Surabaya',
    updatedAt: now(),
  });
  await database
    .insert(schema.waqfPrograms)
    .values([program(programIds[0], 'LIVE'), program(programIds[1], 'DRAFT')]);
}

const guest = () => createTestCaller({ database, user: null });

describe('waqf.lembaga (public)', () => {
  test('shows a verified lembaga with its BWI number, wilayah and only LIVE programs', async () => {
    await setup();
    const { data } = await call(
      router.waqf.lembaga,
      { id: profileIds[0] as string },
      { context: await guest() }
    );
    expect(data.namaLembaga).toBe('Yayasan Uji Profil');
    expect(data.kategori).toBe('BADAN_HUKUM');
    expect(data.nomorRegistrasiBwi).toBe('3.3.00192/BWI/2026');
    expect(data.wilayah).toEqual(['Surabaya, Jawa Timur']);
    expect(data.programs.map((p) => p.id)).toEqual([programIds[0] as string]);

    const json = JSON.stringify(data);
    expect(json).not.toContain('Bank Rahasia');
    expect(json).not.toContain('1234567890');
    expect(json).not.toContain('@example.com');
    expect(json).not.toContain(phones[0] as string);
  });

  test('a pending or unknown lembaga is a 404', async () => {
    for (const id of [profileIds[1] as string, 'tidak-ada']) {
      try {
        await call(router.waqf.lembaga, { id }, { context: await guest() });
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(ORPCError);
        expect((error as ORPCError<string, unknown>).status).toBe(404);
      }
    }
  });
});

describe('admin.waqf.verifyNadzir stores the BWI number', () => {
  test('saved on VERIFIED, ignored on REJECTED', async () => {
    const admin = await createTestCaller({
      database,
      user: { userId: userIds[2] as string, role: 'ADMIN' },
    });
    await call(
      router.admin.waqf.verifyNadzir,
      {
        id: profileIds[1] as string,
        status: 'REJECTED',
        adminNotes: 'Dokumen belum lengkap',
        nomorRegistrasiBwi: 'SEHARUSNYA-TIDAK-TERSIMPAN',
      },
      { context: admin }
    );
    let [row] = await database
      .select({ bwi: schema.nadzirProfiles.nomorRegistrasiBwi })
      .from(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.id, profileIds[1] as string));
    expect(row?.bwi).toBeNull();

    await call(
      router.admin.waqf.verifyNadzir,
      {
        id: profileIds[1] as string,
        status: 'VERIFIED',
        nomorRegistrasiBwi: '  3.3.00555/BWI/2026 ',
      },
      { context: admin }
    );
    [row] = await database
      .select({ bwi: schema.nadzirProfiles.nomorRegistrasiBwi })
      .from(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.id, profileIds[1] as string));
    expect(row?.bwi).toBe('3.3.00555/BWI/2026');
  });
});

describe('kontak publik lembaga (D6)', () => {
  const adminContext = () =>
    createTestCaller({
      database,
      user: { userId: userIds[2] as string, role: 'ADMIN' },
    });
  const publicView = async () =>
    (
      await call(
        router.waqf.lembaga,
        { id: profileIds[0] as string },
        { context: await guest() }
      )
    ).data;

  test('an admin sets it, the public page shows it, clearing hides it again', async () => {
    expect((await publicView()).kontakPublik).toBeNull();

    await call(
      router.admin.waqf.updateNadzirPublicProfile,
      {
        id: profileIds[0] as string,
        kontakPublik: '  info@yayasan-uji.or.id · 0812-0000-1111 ',
      },
      { context: await adminContext() }
    );
    const shown = await publicView();
    expect(shown.kontakPublik).toBe('info@yayasan-uji.or.id · 0812-0000-1111');
    // Mengubah kontak tidak menyentuh nomor BWI yang tidak dikirim.
    expect(shown.nomorRegistrasiBwi).toBe('3.3.00192/BWI/2026');

    await call(
      router.admin.waqf.updateNadzirPublicProfile,
      { id: profileIds[0] as string, kontakPublik: '' },
      { context: await adminContext() }
    );
    expect((await publicView()).kontakPublik).toBeNull();
  });

  test('it is saved while verifying, and only admins can edit it', async () => {
    await call(
      router.admin.waqf.verifyNadzir,
      {
        id: profileIds[1] as string,
        status: 'VERIFIED',
        kontakPublik: 'humas@lembaga-uji.id',
      },
      { context: await adminContext() }
    );
    const [row] = await database
      .select({ kontak: schema.nadzirProfiles.kontakPublik })
      .from(schema.nadzirProfiles)
      .where(eq(schema.nadzirProfiles.id, profileIds[1] as string));
    expect(row?.kontak).toBe('humas@lembaga-uji.id');

    const donor = await createTestCaller({
      database,
      user: { userId: userIds[0] as string, role: 'WAKIF' },
    });
    await expect(
      call(
        router.admin.waqf.updateNadzirPublicProfile,
        { id: profileIds[0] as string, kontakPublik: 'x@y.id' },
        { context: donor }
      )
    ).rejects.toMatchObject({ status: 403 });
  });
});
