import { hasRole } from '@amwal/core/auth/guard';
import { rbacMatrix } from '@amwal/core/auth/rbac.matrix';
import type { Role } from '@amwal/core/auth/types';
import { ORPCError, os } from '@orpc/server';
import { resolveRequestUser } from '@/lib/auth/core';
import type { ORPCContext } from './context';

/**
 * Procedure guards (Putaran 17, Batch 2) — now call the exact same decision
 * logic `apps/server/src/middleware/require-role.ts` calls
 * (`@amwal/core/auth/guard`), instead of a hand-copied JWT check. Same token
 * sources (Authorization header, then `amwal_token` cookie), same two-step
 * failure (401 missing/invalid token, 403 wrong role), same messages.
 */

async function resolveUser(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) {
    throw new ORPCError('UNAUTHORIZED');
  }
  return user;
}

export const o = os.$context<ORPCContext>();

/** No auth required. */
export const publicProcedure = o;

/** Any authenticated user, regardless of role. */
/**
 * Publik, tetapi membaca sesi bila ada: `context.user` terisi untuk donatur
 * yang login dan `null` untuk tamu (token kedaluwarsa dihitung tamu). Dipakai
 * alur donasi yang terbuka untuk tamu (zakat, qurban; QA-04).
 */
export const optionalAuthProcedure = o.use(async ({ context, next }) => {
  const user = await resolveRequestUser(context.request);
  return next({ context: { ...context, user } });
});

export const protectedProcedure = o.use(async ({ context, next }) => {
  const user = await resolveUser(context.request);
  return next({ context: { ...context, user } });
});

/**
 * Exactly one role. Structural guard: attach at the router-mount level (same
 * discipline as `requireRole` in `apps/server` — AMW-03) so no sub-procedure
 * can be reached without it.
 */
export function roleProcedure(role: Role) {
  return anyRoleProcedure([role]);
}

/** Any one of several roles — mirrors `requireAnyRole`. */
export function anyRoleProcedure(allowed: readonly Role[]) {
  return o.use(async ({ context, next }) => {
    const user = await resolveUser(context.request);
    if (!hasRole(user, allowed)) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Forbidden: Insufficient privileges',
      });
    }
    return next({ context: { ...context, user } });
  });
}

/** Convenience alias — every admin backoffice procedure uses this. */
export const adminProcedure = anyRoleProcedure(rbacMatrix.admin);
