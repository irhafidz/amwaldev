import { getActive } from '@amwal/core/akad';
import { akadModuleSchema } from '@amwal/core/contracts/akad';
import { publicProcedure } from '../procedures';

/**
 * Public oRPC router for Akad (Sprint 11, Ticket I-6 — Zone 1).
 *
 * Mengembalikan redaksi akad aktif untuk suatu modul, atau null bila belum ada versi aktif.
 */
const active = publicProcedure
  .input(akadModuleSchema)
  .handler(async ({ input, context }) => {
    return await getActive(context.db, input.module);
  });

export const akad = { active };
