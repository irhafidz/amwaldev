import { ORPCError } from '@orpc/client';
import type { ApiResponse } from '@/lib/api/client';
import { invalidateSessionUserCache } from '@/lib/auth/session-cache';
import { orpc } from '@/lib/orpc/client';

export interface AuthUser {
  userId: string;
  role: string;
  name?: string;
  email?: string;
}

export interface LoginResponse {
  user?: AuthUser;
  message?: string;
}

export interface RegisterPayload {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}

const GENERIC_ERROR = 'Terjadi kendala koneksi ke server. Silakan coba lagi.';

/**
 * UI-side auth contract (Putaran 17, Batch 2 built `router.auth.*`; wired
 * here in the post-Batch-6 proxy cleanup — this file was still calling
 * `fetch('/api/auth/*')` against a `:3001` dev proxy target that no longer
 * exists once `apps/server` was decommissioned).
 *
 * Every method keeps the exact `ApiResponse<T>` shape (`{ok, data, status}`
 * / `{ok, error, status}`) the REST-era version returned — `login-view.tsx`
 * /`register-view.tsx` and every `signOut()` call-site need zero changes.
 * `orpc.auth.*` already sets the httpOnly session cookies server-side via
 * `ResponseHeadersPlugin` (Batch 2) — this file still never stores a token.
 */
async function callAuth<T>(run: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    const data = await run();
    return { ok: true, status: 200, data };
  } catch (error) {
    if (error instanceof ORPCError) {
      return {
        ok: false,
        status: error.status,
        error: error.message || GENERIC_ERROR,
      };
    }
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error && error.message ? error.message : GENERIC_ERROR,
    };
  }
}

export const authClient = {
  login(identifier: string, password: string) {
    return callAuth<LoginResponse>(() =>
      orpc.auth.login({ identifier, password })
    ).finally(invalidateSessionUserCache);
  },

  register(payload: RegisterPayload) {
    return callAuth<{ message?: string }>(() =>
      orpc.auth.register(payload)
    ).finally(invalidateSessionUserCache);
  },

  signOut() {
    return callAuth<{ message?: string }>(() => orpc.auth.logout()).finally(
      invalidateSessionUserCache
    );
  },

  refresh() {
    return callAuth<LoginResponse>(() => orpc.auth.refresh());
  },
};

export default authClient;
