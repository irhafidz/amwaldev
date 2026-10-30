/**
 * Session cookie names (Putaran 17, Batch 2) — the wire contract both
 * `apps/server` (Hono `setCookie`) and `apps/web` (oRPC `setCookie` helper)
 * read and write. A single source so the two transports can never drift to
 * different cookie names.
 */
export const ACCESS_COOKIE = 'amwal_token';
export const REFRESH_COOKIE = 'amwal_refresh';
