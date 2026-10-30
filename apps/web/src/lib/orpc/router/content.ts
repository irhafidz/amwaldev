import { parseInstant } from '@amwal/core/time/wib';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { educationContents } from '@/lib/db/schema';
import { makeExcerpt } from '@/lib/text/excerpt';
import { publicProcedure } from '../procedures';

/**
 * Public content feed for the donor dashboard. `education_contents` is the
 * store behind the admin "Manajemen Berita" screen (the donor-facing
 * `/edukasi` catalog reads separate `education_articles` / `education_videos`
 * tables), so a published ARTIKEL here is a news article. Drafts and archived
 * rows never leave this procedure.
 */

const getLatestNews = publicProcedure
  .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }))
  .handler(async ({ input, context }) => {
    const rows = await context.db
      .select({
        id: educationContents.id,
        title: educationContents.judul,
        body: educationContents.body,
        thumbnailUrl: educationContents.coverUrl,
        slug: educationContents.slug,
        kategori: educationContents.kategori,
        publishedAt: educationContents.publishedAt,
        createdAt: educationContents.createdAt,
      })
      .from(educationContents)
      .where(
        and(
          eq(educationContents.status, 'PUBLISHED'),
          eq(educationContents.tipe, 'ARTIKEL')
        )
      )
      .orderBy(
        sql`${educationContents.publishedAt} desc nulls last`,
        desc(educationContents.createdAt),
        educationContents.id
      )
      .limit(input.limit);

    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: makeExcerpt(row.body),
        thumbnailUrl: row.thumbnailUrl,
        slug: row.slug,
        kategori: row.kategori,
        publishedAt: parseInstant(
          row.publishedAt ?? row.createdAt
        ).toISOString(),
      })),
    };
  });

export const content = { getLatestNews };
