import { createServerFileRoute } from '@tanstack/react-start/server';

/**
 * Mirrors `apps/server`'s `GET /health` (Putaran 17, Batch 0) — same shape,
 * so Caddy's healthcheck and Docker's `wget --spider` keep working unchanged
 * once `web` takes over this path in Batch 6.
 */
export const ServerRoute = createServerFileRoute('/health').methods({
  GET: () => Response.json({ ok: true }),
});
