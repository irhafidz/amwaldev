/**
 * Canonical session identity (Putaran 17, Batch 2). Both apps' JWTs encode
 * exactly this shape — extracted so `apps/server`'s Hono guard and
 * `apps/web`'s oRPC guard verify the exact same contract instead of two
 * hand-copied `Role`/`SessionUser` declarations drifting apart.
 */
export type Role =
  | 'WAKIF'
  | 'NADZIR'
  | 'ADMIN'
  | 'PETUGAS_LAPANGAN'
  | 'BENDAHARA';

export interface SessionUser {
  userId: string;
  role: Role;
}
