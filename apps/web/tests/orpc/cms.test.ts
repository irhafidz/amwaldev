import { describe, expect, test } from 'bun:test';
import { call, ORPCError } from '@orpc/server';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller } from './test-utils';

/**
 * Sprint 11, I-9: CMS artikel & berita (Zone 1).
 *
 * Verifikasi:
 * 1. RBAC guard: Non-admin ditolak saat memanggil `admin.cms.*` (401/403).
 * 2. Keunikan slug: Input dengan slug duplikat ditolak dengan 409 (CONFLICT).
 * 3. Siklus draft -> terbit: Konten DRAFT tidak muncul di `cms.list` dan ditolak di `cms.bySlug`.
 * 4. Konten PUBLISHED dapat diakses via `cms.list`, `cms.bySlug`, dan `cms.byId`.
 * 5. Update & Delete pada admin router berfungsi dengan benar.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const { router } = await import('../../src/lib/orpc/router');

const database: Database = createDatabase(connectionUrl);

describe('oRPC CMS (Sprint 11, I-9)', () => {
  test('admin.cms.* rejects unauthenticated callers and non-ADMIN roles', async () => {
    const unauthenticatedContext = await createTestCaller({
      database,
      user: null,
    });

    try {
      await call(
        router.admin.cms.list,
        {},
        { context: unauthenticatedContext }
      );
      throw new Error('expected call to reject with 401');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(401);
    }

    const wakifContext = await createTestCaller({
      database,
      user: { userId: `cms-wakif-${ulid()}`, role: 'WAKIF' },
    });

    try {
      await call(router.admin.cms.list, {}, { context: wakifContext });
      throw new Error('expected call to reject with 403');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(403);
    }
  });

  test('admin.cms.create creates draft and published articles with unique slug validation', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: `cms-admin-${ulid()}`, role: 'ADMIN' },
    });

    const runId = ulid().toLowerCase();
    const slug1 = `artikel-uji-${runId}`;

    // Create DRAFT article
    const createdDraft = await call(
      router.admin.cms.create,
      {
        judul: 'Artikel Uji DRAFT',
        slug: slug1,
        tipe: 'ARTIKEL',
        kategori: 'berita',
        body: '# Konten Uji DRAFT\n\nIni adalah draf pengujian.',
        status: 'DRAFT',
      },
      { context: adminContext }
    );

    expect(createdDraft.id).toBeDefined();
    expect(createdDraft.judul).toBe('Artikel Uji DRAFT');
    expect(createdDraft.slug).toBe(slug1);
    expect(createdDraft.status).toBe('DRAFT');
    expect(createdDraft.publishedAt).toBeNull();

    // Duplicate slug must throw CONFLICT (409)
    try {
      await call(
        router.admin.cms.create,
        {
          judul: 'Artikel Duplikat Slug',
          slug: slug1,
          tipe: 'ARTIKEL',
          kategori: 'edukasi',
          status: 'DRAFT',
        },
        { context: adminContext }
      );
      throw new Error('expected duplicate slug to throw CONFLICT');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(409);
    }

    // Create PUBLISHED article
    const slug2 = `artikel-terbit-${runId}`;
    const createdPublished = await call(
      router.admin.cms.create,
      {
        judul: 'Artikel Uji Terbit',
        slug: slug2,
        tipe: 'ARTIKEL',
        kategori: 'kegiatan',
        body: 'Konten terbit untuk publik.',
        status: 'PUBLISHED',
      },
      { context: adminContext }
    );

    expect(createdPublished.status).toBe('PUBLISHED');
    expect(createdPublished.publishedAt).not.toBeNull();
  });

  test('public cms.list and cms.bySlug only return PUBLISHED content', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: `cms-admin-${ulid()}`, role: 'ADMIN' },
    });

    const publicContext = await createTestCaller({
      database,
      user: null,
    });

    const runId = ulid().toLowerCase();
    const draftSlug = `draft-only-${runId}`;
    const publishedSlug = `published-public-${runId}`;

    const draftItem = await call(
      router.admin.cms.create,
      {
        judul: `Judul Draft ${runId}`,
        slug: draftSlug,
        tipe: 'ARTIKEL',
        kategori: 'uji-kategori',
        body: 'Konten draft rahasia.',
        status: 'DRAFT',
      },
      { context: adminContext }
    );

    const publishedItem = await call(
      router.admin.cms.create,
      {
        judul: `Judul Published ${runId}`,
        slug: publishedSlug,
        tipe: 'ARTIKEL',
        kategori: 'uji-kategori',
        body: 'Konten terbit publik.',
        status: 'PUBLISHED',
      },
      { context: adminContext }
    );

    // 1. Public list should return published item, NOT draft item
    const publicList = await call(
      router.cms.list,
      { kategori: 'uji-kategori' },
      { context: publicContext }
    );

    const foundDraft = publicList.items.find((i) => i.id === draftItem.id);
    const foundPublished = publicList.items.find(
      (i) => i.id === publishedItem.id
    );

    expect(foundDraft).toBeUndefined();
    expect(foundPublished).toBeDefined();
    expect(foundPublished?.judul).toBe(`Judul Published ${runId}`);

    // 2. Public bySlug for published item works
    const itemBySlug = await call(
      router.cms.bySlug,
      { slug: publishedSlug },
      { context: publicContext }
    );
    expect(itemBySlug.id).toBe(publishedItem.id);

    // 3. Public bySlug for draft item throws NOT_FOUND (404)
    try {
      await call(
        router.cms.bySlug,
        { slug: draftSlug },
        { context: publicContext }
      );
      throw new Error('expected bySlug on draft to return NOT_FOUND');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(404);
    }

    // 4. Public byId for draft item throws NOT_FOUND (404)
    try {
      await call(
        router.cms.byId,
        { id: draftItem.id },
        { context: publicContext }
      );
      throw new Error('expected byId on draft to return NOT_FOUND');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(404);
    }
  });

  test('admin.cms lifecycle: update, publish, archive, delete', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: `cms-admin-${ulid()}`, role: 'ADMIN' },
    });

    const publicContext = await createTestCaller({
      database,
      user: null,
    });

    const runId = ulid().toLowerCase();
    const slug = `lifecycle-${runId}`;

    // Create DRAFT
    const item = await call(
      router.admin.cms.create,
      {
        judul: 'Lifecycle Awal',
        slug,
        tipe: 'ARTIKEL',
        status: 'DRAFT',
      },
      { context: adminContext }
    );

    // Update title and body
    const updated = await call(
      router.admin.cms.update,
      {
        id: item.id,
        judul: 'Lifecycle Diperbarui',
        body: 'Konten baru setelah diedit.',
      },
      { context: adminContext }
    );
    expect(updated.judul).toBe('Lifecycle Diperbarui');
    expect(updated.status).toBe('DRAFT');

    // Publish
    const published = await call(
      router.admin.cms.publish,
      { id: item.id },
      { context: adminContext }
    );
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();

    // Verify it is now visible publicly
    const publicItem = await call(
      router.cms.bySlug,
      { slug },
      { context: publicContext }
    );
    expect(publicItem.judul).toBe('Lifecycle Diperbarui');

    // Archive
    const archived = await call(
      router.admin.cms.archive,
      { id: item.id },
      { context: adminContext }
    );
    expect(archived.status).toBe('ARCHIVED');

    // Verify it is no longer visible publicly
    try {
      await call(router.cms.bySlug, { slug }, { context: publicContext });
      throw new Error('expected archived item to throw NOT_FOUND');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(404);
    }

    // Delete
    const deleteRes = await call(
      router.admin.cms.delete,
      { id: item.id },
      { context: adminContext }
    );
    expect(deleteRes.success).toBe(true);

    // Admin byId now throws NOT_FOUND
    try {
      await call(
        router.admin.cms.byId,
        { id: item.id },
        { context: adminContext }
      );
      throw new Error('expected deleted item to throw NOT_FOUND');
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      expect((error as ORPCError<string, unknown>).status).toBe(404);
    }
  });
});
