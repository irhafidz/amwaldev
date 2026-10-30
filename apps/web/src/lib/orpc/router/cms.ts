import {
  type CmsStatus,
  getCmsByIdSchema,
  getCmsBySlugSchema,
  listCmsSchema,
} from '@amwal/core/contracts/cms';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { educationContents } from '@/lib/db/schema';
import { publicProcedure } from '../procedures';

/**
 * Public CMS oRPC router (Sprint 11, I-9 — Zone 1).
 *
 * Hanya mengembalikan artikel/konten yang berstatus 'PUBLISHED'.
 * Konten 'DRAFT' dan 'ARCHIVED' tidak pernah bocor ke publik.
 */

const list = publicProcedure
  .input(listCmsSchema)
  .handler(async ({ input, context }) => {
    const conditions: SQL[] = [eq(educationContents.status, 'PUBLISHED')];

    if (input.type) {
      conditions.push(eq(educationContents.tipe, input.type));
    }
    if (input.kategori) {
      conditions.push(eq(educationContents.kategori, input.kategori));
    }
    if (input.search) {
      const searchPattern = `%${input.search}%`;
      const searchFilter = or(
        ilike(educationContents.judul, searchPattern),
        ilike(educationContents.body, searchPattern),
        ilike(educationContents.kategori, searchPattern)
      );
      if (searchFilter) {
        conditions.push(searchFilter);
      }
    }

    const items = await context.db
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
        status: sql<CmsStatus>`${educationContents.status}`,
        createdAt: educationContents.createdAt,
      })
      .from(educationContents)
      .where(and(...conditions))
      .orderBy(
        desc(educationContents.publishedAt),
        desc(educationContents.createdAt)
      )
      .limit(input.limit);

    return {
      items,
      count: items.length,
    };
  });

const bySlug = publicProcedure
  .input(getCmsBySlugSchema)
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
        status: sql<CmsStatus>`${educationContents.status}`,
        createdAt: educationContents.createdAt,
      })
      .from(educationContents)
      .where(
        and(
          eq(educationContents.slug, input.slug),
          eq(educationContents.status, 'PUBLISHED')
        )
      )
      .limit(1);

    if (!item) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan slug '${input.slug}' tidak ditemukan atau belum terbit`,
      });
    }

    return item;
  });

const byId = publicProcedure
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
        status: sql<CmsStatus>`${educationContents.status}`,
        createdAt: educationContents.createdAt,
      })
      .from(educationContents)
      .where(
        and(
          eq(educationContents.id, input.id),
          eq(educationContents.status, 'PUBLISHED')
        )
      )
      .limit(1);

    if (!item) {
      throw new ORPCError('NOT_FOUND', {
        message: `Konten dengan ID '${input.id}' tidak ditemukan atau belum terbit`,
      });
    }

    return item;
  });

export const cms = {
  list,
  bySlug,
  byId,
};
