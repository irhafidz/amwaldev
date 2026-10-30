import { createNotification } from '@amwal/core/notification';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  petugasLapanganProfiles,
  setoranPetugasLapangan,
} from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Admin review of field-officer deposits (Putaran 17, feature replay N-13) —
 * a 1:1 port of `apps/server/src/routes/admin/amil.ts`. Verifies a setoran and
 * fires a DEPOSIT_VERIFIED notification to the field officer.
 */

const verifySetoran = adminProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    const admin = context.user;
    if (!admin) {
      throw new ORPCError('UNAUTHORIZED');
    }

    const [setoran] = await context.db
      .select({
        id: setoranPetugasLapangan.id,
        petugasId: setoranPetugasLapangan.petugasId,
        verifiedAt: setoranPetugasLapangan.verifiedAt,
      })
      .from(setoranPetugasLapangan)
      .where(eq(setoranPetugasLapangan.id, input.id));

    if (!setoran) {
      throw new ORPCError('NOT_FOUND', { message: 'Setoran tidak ditemukan' });
    }

    if (setoran.verifiedAt) {
      throw new ORPCError('CONFLICT', {
        message: 'Setoran sudah diverifikasi',
      });
    }

    await context.db
      .update(setoranPetugasLapangan)
      .set({
        verifiedByAdminId: admin.userId,
        verifiedAt: new Date().toISOString(),
      })
      .where(eq(setoranPetugasLapangan.id, input.id));

    try {
      const [profile] = await context.db
        .select({ userId: petugasLapanganProfiles.userId })
        .from(petugasLapanganProfiles)
        .where(eq(petugasLapanganProfiles.id, setoran.petugasId));

      if (profile?.userId) {
        await createNotification(context.db, {
          userId: profile.userId,
          type: 'DEPOSIT_VERIFIED',
          title: 'Setoran diverifikasi',
          body: `Setoran ${input.id} telah diverifikasi oleh admin.`,
          relatedEntityId: input.id,
        });
      }
    } catch {
      // Best-effort; a notification failure must not fail the verification.
    }

    return { data: { id: input.id } };
  });

export const amil = { verifySetoran };
