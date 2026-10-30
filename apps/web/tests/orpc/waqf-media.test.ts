import { afterAll, describe, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';
import { createTestCaller, signTestToken } from './test-utils';

/**
 * Banner/RAB/legalitas program wakaf: disimpan sebagai data URI base64 (ratusan
 * KB), dikirim ke klien sebagai tautan `/api/waqf-media/...` yang bisa di-cache.
 * Daftar `/wakaf` dulu membawa ±2,3 MB JSON untuk satu program.
 */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { router } = await import('../../src/lib/orpc/router');
const { handle } = await import('../../src/routes/api/waqf-media.$id.$kind');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const now = () => new Date().toISOString();

// 1x1 PNG
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const bigBlob = Buffer.alloc(600_000, 7).toString('base64');
const PNG_URI = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
const BIG_JPEG_URI = `data:image/jpeg;base64,${bigBlob}`;
const PDF_URI = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`;
const SVG_URI = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;

const userId = `wm-${runId}-user`;
const profileId = `wm-${runId}-profile`;
const live = `wm-${runId}-live`;
const draft = `wm-${runId}-draft`;
const plain = `wm-${runId}-plain`;
const svg = `wm-${runId}-svg`;

await database
  .insert(schema.users)
  .values({ id: userId, name: 'Nadzir Media', updatedAt: now() });
await database.insert(schema.nadzirProfiles).values({
  id: profileId,
  userId,
  kategori: 'ORGANISASI',
  namaLembaga: 'Badan Wakaf Media',
  updatedAt: now(),
});

const program = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  nadzirProfileId: profileId,
  judul: `Program ${id}`,
  targetDana: '1000000',
  jenisWakaf: 'PRODUKTIF_KEKAL' as const,
  status: 'LIVE' as const,
  updatedAt: now(),
  ...over,
});
await database.insert(schema.waqfPrograms).values([
  program(live, {
    bannerUrl: BIG_JPEG_URI,
    rabDocumentUrl: PDF_URI,
    dokumenLegalitasUrl: BIG_JPEG_URI,
  }),
  program(draft, { status: 'DRAFT', bannerUrl: PNG_URI }),
  program(plain, { bannerUrl: 'https://cdn.example/banner.jpg' }),
  program(svg, { bannerUrl: SVG_URI }),
]);

afterAll(async () => {
  for (const id of [live, draft, plain, svg]) {
    await database
      .delete(schema.waqfPrograms)
      .where(eq(schema.waqfPrograms.id, id));
  }
  await database
    .delete(schema.nadzirProfiles)
    .where(eq(schema.nadzirProfiles.id, profileId));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
});

const publicContext = await createTestCaller({ database, user: null });
const get = (id: string, kind: string, headers: Record<string, string> = {}) =>
  handle({
    request: new Request(`http://localhost/api/waqf-media/${id}/${kind}`, {
      headers,
    }),
    params: { id, kind },
  });

describe('waqf.list / waqf.detail no longer ship base64', () => {
  test('list replaces inline data URIs with cacheable media URLs and stays tiny', async () => {
    const result = await call(
      router.waqf.list,
      { active: true },
      { context: publicContext }
    );
    const mine = result.data.find((row) => row.id === live);

    expect(mine?.bannerUrl).toStartWith(`/api/waqf-media/${live}/banner?v=`);
    expect(mine?.rabDocumentUrl).toStartWith(`/api/waqf-media/${live}/rab?v=`);
    expect(mine?.dokumenLegalitasUrl).toStartWith(
      `/api/waqf-media/${live}/legal?v=`
    );
    // Ordinary URLs are left alone.
    expect(result.data.find((row) => row.id === plain)?.bannerUrl).toBe(
      'https://cdn.example/banner.jpg'
    );

    const json = JSON.stringify(mine);
    expect(json).not.toContain('base64');
    expect(json.length).toBeLessThan(3000);
  });

  test('detail uses the same URLs', async () => {
    const result = await call(
      router.waqf.detail,
      { id: live },
      { context: publicContext }
    );

    expect(result.data.bannerUrl).toStartWith(`/api/waqf-media/${live}/banner`);
    expect(JSON.stringify(result.data)).not.toContain('base64');
  });
});

describe('/api/waqf-media/<id>/<kind>', () => {
  test('serves the decoded image with a one-year immutable cache and an ETag', async () => {
    const response = await get(live, 'banner');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    );
    expect((await response.arrayBuffer()).byteLength).toBe(600_000);
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{40}"$/);
  });

  test('answers 304 when the ETag still matches', async () => {
    const first = await get(live, 'banner');
    const etag = first.headers.get('etag') ?? '';

    const second = await get(live, 'banner', { 'if-none-match': etag });

    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  test('serves PDFs, redirects plain URLs, and never serves DRAFT programs', async () => {
    const pdf = await get(live, 'rab');
    expect(pdf.headers.get('content-type')).toBe('application/pdf');

    const redirect = await get(plain, 'banner');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(
      'https://cdn.example/banner.jpg'
    );

    expect((await get(draft, 'banner')).status).toBe(404);
  });

  test('refuses SVG (script vector), unknown kinds, unknown programs and empty columns', async () => {
    expect((await get(svg, 'banner')).status).toBe(404);
    expect((await get(live, 'passwords')).status).toBe(404);
    expect((await get('does-not-exist', 'banner')).status).toBe(404);
    expect((await get(plain, 'rab')).status).toBe(404);
  });
});

describe('admin & nadzir lists (QA-14)', () => {
  test('admin.waqf.programsList ships media URLs, never base64, drafts included', async () => {
    const adminContext = await createTestCaller({
      database,
      user: { userId: `wm-${runId}-admin`, role: 'ADMIN' },
    });
    const result = await call(router.admin.waqf.programsList, undefined, {
      context: adminContext,
    });
    const mine = result.data.filter((row) => row.id.startsWith(`wm-${runId}`));

    expect(mine.find((row) => row.id === live)?.bannerUrl).toStartWith(
      `/api/waqf-media/${live}/banner?v=`
    );
    expect(mine.find((row) => row.id === draft)?.bannerUrl).toStartWith(
      `/api/waqf-media/${draft}/banner?v=`
    );
    expect(JSON.stringify(mine)).not.toContain('base64');
  });

  test('nadzir.programs ships media URLs too', async () => {
    const nadzirContext = await createTestCaller({
      database,
      user: { userId, role: 'NADZIR' },
    });
    const result = await call(router.nadzir.programs, undefined, {
      context: nadzirContext,
    });
    const mine = result.data.find((row) => row.id === live);

    expect(mine?.bannerUrl).toStartWith(`/api/waqf-media/${live}/banner?v=`);
    expect(JSON.stringify(result.data)).not.toContain('base64');
  });
});

describe('DRAFT media is private to admin and its own Nadzir', () => {
  const asUser = async (user: {
    userId: string;
    role: 'ADMIN' | 'NADZIR' | 'WAKIF';
  }) => ({
    authorization: `Bearer ${await signTestToken(user)}`,
  });

  test('anonymous and unrelated users still get 404', async () => {
    expect((await get(draft, 'banner')).status).toBe(404);
    const stranger = await asUser({
      userId: `wm-${runId}-stranger`,
      role: 'WAKIF',
    });
    expect((await get(draft, 'banner', stranger)).status).toBe(404);
  });

  test('admin and the owning Nadzir get it, never cached publicly', async () => {
    for (const user of [
      { userId: `wm-${runId}-admin`, role: 'ADMIN' as const },
      { userId, role: 'NADZIR' as const },
    ]) {
      const response = await get(draft, 'banner', await asUser(user));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });
});

describe('admin.waqf.updateProgram keeps stored media (QA-14)', () => {
  test('sending back /api/waqf-media URLs leaves the data URIs untouched; new data replaces them', async () => {
    const edit = `wm-${runId}-edit`;
    await database
      .insert(schema.waqfPrograms)
      .values(program(edit, { bannerUrl: PNG_URI, rabDocumentUrl: PDF_URI }));
    const adminContext = await createTestCaller({
      database,
      user: { userId: `wm-${runId}-admin`, role: 'ADMIN' },
    });
    try {
      await call(
        router.admin.waqf.updateProgram,
        {
          id: edit,
          judul: 'Judul Baru Program',
          bannerUrl: `/api/waqf-media/${edit}/banner?v=2026-01-01`,
          rabDocumentUrl: `/api/waqf-media/${edit}/rab?v=2026-01-01`,
        },
        { context: adminContext }
      );
      const [kept] = await database
        .select()
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, edit));
      expect(kept?.judul).toBe('Judul Baru Program');
      expect(kept?.bannerUrl).toBe(PNG_URI);
      expect(kept?.rabDocumentUrl).toBe(PDF_URI);

      await call(
        router.admin.waqf.updateProgram,
        { id: edit, bannerUrl: BIG_JPEG_URI },
        { context: adminContext }
      );
      const [replaced] = await database
        .select({ bannerUrl: schema.waqfPrograms.bannerUrl })
        .from(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, edit));
      expect(replaced?.bannerUrl).toBe(BIG_JPEG_URI);
    } finally {
      await database
        .delete(schema.waqfPrograms)
        .where(eq(schema.waqfPrograms.id, edit));
    }
  });
});
