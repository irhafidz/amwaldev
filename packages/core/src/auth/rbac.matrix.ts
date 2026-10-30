import type { Role } from './types';

/**
 * Single source of truth for role-per-namespace access (SECURITY.md §3).
 * The oRPC guards in `apps/web/src/lib/orpc/procedures.ts` and the per-domain
 * routers reference this instead of hardcoding role lists, so the mapping
 * cannot drift out of sync with the routes it protects (the AMW-03 failure
 * mode).
 *
 * `PETUGAS_LAPANGAN` has its own `amil` namespace and must never appear in
 * `admin` (AMW-07 — a field officer once overwrote the gold price that sets
 * everyone's nisab).
 */
export const rbacMatrix = {
  admin: ['ADMIN'],
  amil: ['ADMIN', 'PETUGAS_LAPANGAN'],
  nadzir: ['NADZIR', 'ADMIN'],
  wakif: ['WAKIF'],
} as const satisfies Record<string, readonly Role[]>;
