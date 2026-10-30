import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { createServerFileRoute } from '@tanstack/react-start/server';
import { createContext } from '@/lib/orpc/context';
import { router } from '@/lib/orpc/router';

/**
 * Mounts the oRPC router at `/rpc/*` (Putaran 17, Batch 0; `auth.*` cookie
 * support added Batch 2).
 *
 * Same prefix `apps/server/src/index.ts` already serves — Vite's dev proxy
 * and the production Caddyfile both route `/rpc/*` to a backend, and until
 * Batch 6 that backend is still `apps/server`. This canary is reached by
 * calling it directly in tests/dev, not yet by real traffic through Caddy.
 *
 * `ResponseHeadersPlugin` injects a mutable `context.resHeaders` and merges
 * it into the final Response — this is how `auth.login`/`register`/`refresh`/
 * `logout` set the httpOnly `amwal_token` / `amwal_refresh` cookies without a
 * separate raw server route.
 */
const rpcHandler = new RPCHandler(router, {
  plugins: [new ResponseHeadersPlugin()],
});

async function handle({ request }: { request: Request }): Promise<Response> {
  const { response } = await rpcHandler.handle(request, {
    prefix: '/rpc',
    context: createContext({ request }),
  });
  return response ?? new Response('Not Found', { status: 404 });
}

export const ServerRoute = createServerFileRoute('/rpc/$').methods({
  GET: handle,
  POST: handle,
  PUT: handle,
  PATCH: handle,
  DELETE: handle,
});
