import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { AppRouter } from './router';

/**
 * Browser-side oRPC client (Putaran 17, Batch 0; rewired through Batch 4 and
 * the post-Batch-6 proxy cleanup). Now the single transport for the whole UI:
 * `lib/auth/auth-client.ts` and `lib/amwal-api/*` are thin adapters over the
 * procedures below, so components keep their existing call signatures while
 * every request travels in-process oRPC instead of the REST client that used
 * to reach `apps/server`.
 *
 * Relative `/rpc` URL (not an absolute host) so the request stays same-origin
 * in every environment — `apps/web` serves `/rpc/*` itself on :3000 in dev
 * (no Vite proxy: `apps/server` is gone), Caddy fronts the same origin in
 * staging/prod — and the httpOnly `amwal_token` cookie rides along without
 * CORS.
 */
const rpcUrl = () => `${window.location.origin}/rpc`;

const plainFetch = (request: Request, init?: RequestInit) =>
  globalThis.fetch(request, { ...init, credentials: 'include' });

/** Plain client (no retry) used only to rotate the session cookies. */
const refreshClient: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({ url: rpcUrl, fetch: plainFetch })
);

/** A 401 here means bad credentials / no session, not an expired token. */
const NO_REFRESH_PATHS = new Set([
  '/rpc/auth/login',
  '/rpc/auth/register',
  '/rpc/auth/refresh',
]);

let inflightRefresh: Promise<boolean> | null = null;

/** Single-flight: concurrent 401s share one rotation of the refresh token. */
function refreshSession(): Promise<boolean> {
  inflightRefresh ??= refreshClient.auth
    .refresh()
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

/**
 * The access token lives 3 hours (`ACCESS_TOKEN_TTL_SECONDS`) and nothing
 * refreshed it, so a long admin session ended in "Unauthorized" on the next
 * save/delete (UAT admin 2026-10-02). On a 401 from a non-auth procedure,
 * rotate the cookies once and replay the request.
 */
const link = new RPCLink({
  url: rpcUrl,
  fetch: async (request, init) => {
    const replay = request.clone();
    const response = await plainFetch(request, init);
    if (response.status !== 401) {
      return response;
    }
    if (NO_REFRESH_PATHS.has(new URL(request.url).pathname)) {
      return response;
    }
    if (!(await refreshSession())) {
      return response;
    }
    return plainFetch(replay, init);
  },
});

export const orpc: RouterClient<AppRouter> = createORPCClient(link);
