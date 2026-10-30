import { rbacMatrix } from '@amwal/core/auth/rbac.matrix';
import { ORPCError } from '@orpc/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  nadzirProfiles,
  waqfPrincipalLedgers,
  waqfPrograms,
} from '@/lib/db/schema';
import { publicMediaColumns, withMediaUrls } from '@/lib/waqf-media';
import { anyRoleProcedure } from '../procedures';

/**
 * oRPC nadzir router (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/routes/nadzir.ts`. Guarded by NADZIR or ADMIN, matching
 * `app.use('*', requireAnyRole(['NADZIR', 'ADMIN']))` in the original REST
 * route.
 */

const guarded = anyRoleProcedure(rbacMatrix.nadzir);

/**
 * Live read of the LIVE waqf programs visible to this session. A NADZIR sees
 * only the programs of the lembaga tied to their own user id; an ADMIN sees
 * every LIVE program. Each row carries its principal-ledger summary so the
 * dashboard can aggregate real pokok / hasil figures — no fabricated data.
 */
const programs = guarded.handler(async ({ context }) => {
  const user = context.user;
  if (!user) {
    // guarded procedure guarantees this is unreachable — narrows the type.
    throw new ORPCError('UNAUTHORIZED');
  }

  const scope =
    user.role === 'ADMIN'
      ? eq(waqfPrograms.status, 'LIVE')
      : and(
          eq(waqfPrograms.status, 'LIVE'),
          eq(nadzirProfiles.userId, user.userId)
        );

  const rows = await context.db
    .select({
      id: waqfPrograms.id,
      judul: waqfPrograms.judul,
      kategori: waqfPrograms.kategori,
      jenisWakaf: waqfPrograms.jenisWakaf,
      status: waqfPrograms.status,
      targetDana: waqfPrograms.targetDana,
      ...publicMediaColumns,
      createdAt: waqfPrograms.createdAt,
      updatedAt: waqfPrograms.updatedAt,
      namaLembaga: nadzirProfiles.namaLembaga,
      pokokDanaTerkumpul: waqfPrincipalLedgers.pokokDanaTerkumpul,
      totalHasilAvailable: waqfPrincipalLedgers.totalHasilAvailable,
      hasilInvestasiTersalurkan: waqfPrincipalLedgers.hasilInvestasiTersalurkan,
    })
    .from(waqfPrograms)
    .leftJoin(
      nadzirProfiles,
      eq(nadzirProfiles.id, waqfPrograms.nadzirProfileId)
    )
    .leftJoin(
      waqfPrincipalLedgers,
      eq(waqfPrincipalLedgers.waqfProgramId, waqfPrograms.id)
    )
    .where(scope)
    .orderBy(desc(waqfPrograms.createdAt));

  return { data: rows.map(withMediaUrls) };
});

/**
 * Tier C stub. The staged-withdrawal + receipt-upload portal has no backend
 * yet; this returns an honest 501 to a NADZIR/ADMIN session so the frontend
 * can render its PRATINJAU state instead of inventing data (AMW-10/AMW-11).
 */
const dashboard = guarded.handler(() => {
  throw new ORPCError('NOT_IMPLEMENTED', {
    message: 'Not implemented',
    data: { tier: 'C' },
  });
});

export const nadzir = {
  programs,
  dashboard,
};
