import {
  adminListCmsSchema,
  archiveCmsArticleSchema,
  createCmsArticleSchema,
  deleteCmsArticleSchema,
  getCmsByIdSchema,
  publishCmsArticleSchema,
  updateCmsArticleSchema,
} from '@amwal/core/contracts/cms';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, ilike, ne, or, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '@/lib/db';
import { educationContents, users } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Admin CMS oRPC router (Sprint 11, I-9 — Zone 1).
 *
 * Seluruh endpoint dilindungi `adminProcedure` (RBAC ADMIN).
 * Mendukung manajemen siklus artikel (DRAFT → PUBLISHED → ARCHIVED),
 * penegakan keunikan slug, serta CRUD konten edukasi dan berita.
 */

const list = adminProcedure
  .input(adminListCmsSchema)
  .handler(async ({ input, context }) => {
    const conditions: SQL[] = [];

    if (input.type) {
      conditions.push(eq(educationContents.tipe, input.type));
    }
    if (input.status) {
      conditions.push(eq(educationContents.status, input.status));
    }
    if (input.kategori) {
      conditions.push(eq(educationContents.kategori, input.kategori));
    }
    if (input.search) {
      const searchPattern = `%${input.search}%`;
      const searchFilter = or(
        ilike(educationContents.judul, searchPattern),
        ilike(educationContents.body, searchPattern),
        ilike(educationContents.slug, searchPattern),
        ilike(educationContents.kategori, searchPattern)
      );
      if (searchFilter) {
        conditions.push(searchFilter);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ total }]] = await Promise.all([
      context.db
        .select({
          id: educationContents.id,
          judul: educationContents.judul,
          tipe: educationContents.tipe,
          kontenUrl: educationContents.kontenUrl,
          kategori: educationContents.kategori,
          slug: educationContents.slug,
          body: educationContents.body,
          coverUrl: educationContents.coverUrl,
          publishedAt: educationContents.publishedAt,
          authorId: educationContents.authorId,
          status: educationContents.status,
          createdAt: educationContents.createdAt,
        })
        .from(educationContents)
        .where(whereClause)
        .orderBy(desc(educationContents.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      context.db
        .select({ total: sql<number>`count(*)::int` })
        .from(educationContents)
        .where(whereClause),
    ]);

    return {
      items,
      total,
      limit: input.limit,
      offset: input.offset,
    };
  });

async function ensureUniqueSlug(
  db: Database,
  slug: string,
  excludeId?: string
) {
  const conditions = [eq(educationContents.slug, slug)];
  if (excludeId) {
    conditions.push(ne(educationContents.id, excludeId));
  }
  const [existing] = await db
    .select({ id: educationContents.id })
    .from(educationContents)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new ORPCError('CONFLICT', {
      message: `Slug '${slug}' sudah digunakan oleh artikel lain`,
    });
  }
}

const byId = adminProcedure
  .input(getCmsByIdSchema)
  .handler(async ({ input, context }) => {
    const [item] = await context.db
      .select({
        id: educationContents.id,
        judul: educationContents.judul,
        tipe: educationContents.tipe,
        kontenUrl: educationContents.kontenUrl,
        kategori: educationContents.kategori,
        slug: educationContents.slug,
        body: educationContents.body,
        coverUrl: educationContents.coverUrl,
        publishedAt: educationContents.publishedAt,
        authorId: educationContents.authorId,
        status: educationContents.status,
        createdAt: educationContents.createdAt,
      })
      .from(educationContents)
      .where(eq(educationContents.id, input.id))
      .limit(1);

    if (!item) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan ID '${input.id}' tidak ditemukan`,
      });
    }

    return item;
  });

const create = adminProcedure
  .input(createCmsArticleSchema)
  .handler(async ({ input, context }) => {
    if (input.slug) {
      await ensureUniqueSlug(context.db, input.slug);
    }

    let authorId: string | null = null;
    if (context.user?.userId) {
      const [author] = await context.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, context.user.userId))
        .limit(1);
      if (author) {
        authorId = author.id;
      }
    }

    const id = ulid().toLowerCase();
    const isPublished = input.status === 'PUBLISHED';
    const now = new Date().toISOString();

    const [created] = await context.db
      .insert(educationContents)
      .values({
        id,
        judul: input.judul,
        tipe: input.tipe,
        kontenUrl: input.kontenUrl || null,
        kategori: input.kategori || null,
        slug: input.slug || null,
        body: input.body || null,
        coverUrl: input.coverUrl || null,
        status: input.status,
        publishedAt: isPublished ? now : null,
        authorId,
      })
      .returning();

    return created;
  });

function buildUpdatePayload(
  input: {
    judul?: string;
    tipe?: 'ARTIKEL' | 'VIDEO';
    kontenUrl?: string | null;
    kategori?: string | null;
    slug?: string | null;
    body?: string | null;
    coverUrl?: string | null;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  },
  existing: {
    judul: string;
    tipe: 'ARTIKEL' | 'VIDEO';
    kontenUrl: string | null;
    kategori: string | null;
    slug: string | null;
    body: string | null;
    coverUrl: string | null;
    status: string;
    publishedAt: string | null;
  }
) {
  const targetStatus = input.status ?? existing.status;
  const isNowPublished =
    targetStatus === 'PUBLISHED' && existing.status !== 'PUBLISHED';
  const publishedAt = isNowPublished
    ? new Date().toISOString()
    : existing.publishedAt;

  return {
    judul: input.judul ?? existing.judul,
    tipe: input.tipe ?? existing.tipe,
    kontenUrl:
      input.kontenUrl !== undefined
        ? input.kontenUrl || null
        : existing.kontenUrl,
    kategori:
      input.kategori !== undefined ? input.kategori || null : existing.kategori,
    slug: input.slug !== undefined ? input.slug || null : existing.slug,
    body: input.body !== undefined ? input.body || null : existing.body,
    coverUrl:
      input.coverUrl !== undefined ? input.coverUrl || null : existing.coverUrl,
    status: targetStatus,
    publishedAt,
  };
}

const update = adminProcedure
  .input(updateCmsArticleSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(educationContents)
      .where(eq(educationContents.id, input.id))
      .limit(1);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan ID '${input.id}' tidak ditemukan`,
      });
    }

    if (input.slug && input.slug !== existing.slug) {
      await ensureUniqueSlug(context.db, input.slug, input.id);
    }

    const payload = buildUpdatePayload(input, existing);

    const [updated] = await context.db
      .update(educationContents)
      .set(payload)
      .where(eq(educationContents.id, input.id))
      .returning();

    return updated;
  });

const publish = adminProcedure
  .input(publishCmsArticleSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select()
      .from(educationContents)
      .where(eq(educationContents.id, input.id))
      .limit(1);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan ID '${input.id}' tidak ditemukan`,
      });
    }

    const now = new Date().toISOString();
    const [updated] = await context.db
      .update(educationContents)
      .set({
        status: 'PUBLISHED',
        publishedAt: existing.publishedAt ?? now,
      })
      .where(eq(educationContents.id, input.id))
      .returning();

    return updated;
  });

const archive = adminProcedure
  .input(archiveCmsArticleSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: educationContents.id })
      .from(educationContents)
      .where(eq(educationContents.id, input.id))
      .limit(1);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan ID '${input.id}' tidak ditemukan`,
      });
    }

    const [updated] = await context.db
      .update(educationContents)
      .set({
        status: 'ARCHIVED',
      })
      .where(eq(educationContents.id, input.id))
      .returning();

    return updated;
  });

const deleteArticle = adminProcedure
  .input(deleteCmsArticleSchema)
  .handler(async ({ input, context }) => {
    const [existing] = await context.db
      .select({ id: educationContents.id })
      .from(educationContents)
      .where(eq(educationContents.id, input.id))
      .limit(1);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan ID '${input.id}' tidak ditemukan`,
      });
    }

    await context.db
      .delete(educationContents)
      .where(eq(educationContents.id, input.id));

    return {
      success: true,
      id: input.id,
    };
  });

export const cmsAdmin = {
  list,
  byId,
  create,
  update,
  publish,
  archive,
  delete: deleteArticle,
};
