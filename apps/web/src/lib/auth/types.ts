import type {
  Role as CoreRole,
  SessionUser as CoreSessionUser,
} from '@amwal/core/auth/types';

/**
 * Re-exports the canonical identity contract from `@amwal/core/auth/types`
 * (Putaran 17, Batch 2) — the exact shape both apps' JWTs encode — and
 * extends it with the optional profile fields this app's UI reads today.
 * They mirror the legacy `SessionUser` and fall back to Hi-Fi defaults until
 * the auth/profile endpoints expose them for real (S10-N-02…05).
 */
export type Role = CoreRole;

export interface SessionUser extends CoreSessionUser {
  name?: string;
  email?: string | null;
  phone?: string | null;
  xp?: number;
  level?: string;
  totalWakaf?: number;
  proyekDidanai?: number;
  sertifikatTerbit?: number;
  totalZakat?: number;
}
