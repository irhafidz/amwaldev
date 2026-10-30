import {
  activate,
  getVersions,
  publishVersion as publishServiceVersion,
} from '@amwal/core/akad';
import {
  activateAkadSchema,
  akadModuleSchema,
  publishAkadSchema,
} from '@amwal/core/contracts/akad';
import { ORPCError } from '@orpc/server';
import { adminProcedure } from '../../procedures';

/**
 * Admin Akad oRPC router (Sprint 11, Ticket I-6 — Zone 1).
 *
 * Seluruh endpoint dilindungi `adminProcedure` (RBAC ADMIN).
 * Templat bersifat append-only: tidak pernah meng-UPDATE isi baris lama.
 */

const list = adminProcedure
  .input(akadModuleSchema)
  .handler(async ({ input, context }) => {
    return await getVersions(context.db, input.module);
  });

const publishVersion = adminProcedure
  .input(publishAkadSchema)
  .handler(async ({ input, context }) => {
    try {
      return await publishServiceVersion(context.db, {
        module: input.module,
        title: input.title,
        body: input.body,
        createdById: context.user?.userId ?? null,
      });
    } catch (error) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message:
          error instanceof Error
            ? error.message
            : 'Gagal menerbitkan versi akad baru',
      });
    }
  });

const activateVersion = adminProcedure
  .input(activateAkadSchema)
  .handler(async ({ input, context }) => {
    try {
      return await activate(context.db, {
        module: input.module,
        version: input.version,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'AKAD_TEMPLATE_NOT_FOUND'
      ) {
        throw new ORPCError('NOT_FOUND', {
          message: `Templat akad modul ${input.module} versi ${input.version} tidak ditemukan`,
        });
      }
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message:
          error instanceof Error
            ? error.message
            : 'Gagal mengaktifkan versi akad',
      });
    }
  });

export const akadAdmin = {
  list,
  publishVersion,
  activate: activateVersion,
};
