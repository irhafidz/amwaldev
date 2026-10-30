import type { PaymentProvider } from '@amwal/core/payment/types';
import type { SessionUser } from '@/lib/auth/types';
import { type Database, db as defaultDb } from '@/lib/db';
import { getPaymentProvider } from '@/lib/payment';

/**
 * Request-scoped oRPC context (Putaran 17, Batch 0; `paymentProvider` added
 * Batch 3).
 *
 * `db` and `paymentProvider` default to the process singletons but can be
 * overridden per-request — this is the same dependency-injection shape
 * `apps/server` used for its 68 tests (`createXxxRoutes({ database,
 * paymentProvider })`), so the oRPC test harness can point at a fixture
 * database / deterministic mock provider without touching module-level
 * state.
 *
 * `user` starts `null` and is populated by `protectedProcedure` /
 * `adminProcedure` / `anyRoleProcedure` — never by `createContext` itself, so
 * a public procedure never accidentally trusts an unverified caller.
 */
export interface ORPCContext {
  request: Request;
  db: Database;
  paymentProvider: PaymentProvider;
  user: SessionUser | null;
  /**
   * Injected by `ResponseHeadersPlugin` (Putaran 17, Batch 2) — a procedure
   * writes `Set-Cookie` (or any other response header) here via
   * `@orpc/server/helpers`'s `setCookie`/`deleteCookie`, and the plugin
   * merges it into the actual HTTP response after the handler returns.
   * Optional because a direct `call()` in tests doesn't go through the
   * fetch-adapter pipeline that injects it — callers there supply their own.
   */
  resHeaders?: Headers;
}

export interface CreateContextOptions {
  request: Request;
  database?: Database;
  paymentProvider?: PaymentProvider;
  /** Test-only convenience — the fetch adapter's `ResponseHeadersPlugin` supplies its own for real requests. */
  resHeaders?: Headers;
}

export function createContext({
  request,
  database,
  paymentProvider,
  resHeaders,
}: CreateContextOptions): ORPCContext {
  return {
    request,
    db: database ?? defaultDb,
    paymentProvider: paymentProvider ?? getPaymentProvider(),
    user: null,
    resHeaders,
  };
}
