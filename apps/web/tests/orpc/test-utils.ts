import type { PaymentProvider } from '@amwal/core/payment/types';
import { SignJWT } from 'jose';
import type { Role } from '../../src/lib/auth/types';
import type { Database } from '../../src/lib/db';
import { createContext, type ORPCContext } from '../../src/lib/orpc/context';

/**
 * Shared oRPC test-context factory (Putaran 17, Batch 5) — replaces the
 * `createToken()` + `ctx()` pair that was hand-duplicated across every
 * `tests/orpc/*.test.ts` file since Batch 0. `createTestCaller` builds the
 * exact same `ORPCContext` those call sites already built by hand (same
 * JWT signing, same Bearer-header shape, same `createContext()` under the
 * hood), just from one consistent, named entry point.
 *
 * It resolves to a `Promise<ORPCContext>` rather than a bound "call this
 * procedure" function — `call()` from `@orpc/server` is generic over the
 * exact procedure passed to it at each call site (that's how
 * `result.data`, `result.success`, etc. stay fully typed with no manual
 * casts), and a wrapping function can't preserve that inference without
 * re-declaring oRPC's own internal generics. So the call sites stay
 * `call(router.x.y, input, { context: await createTestCaller({...}) })` —
 * still one line, still fully typed, just no per-file boilerplate.
 */

const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');

export interface TestCallerUser {
  userId: string;
  role: Role;
}

export interface CreateTestCallerOptions {
  database: Database;
  /** Omit or pass `null` for an unauthenticated request (proves 401 guards). */
  user?: TestCallerUser | null;
  paymentProvider?: PaymentProvider;
  /** Test-only convenience — most tests never need to read this back. */
  resHeaders?: Headers;
  requestUrl?: string;
  /**
   * Extra request headers (e.g. `Cookie: amwal_ref=...` for I-4 attribution
   * tests). Merged in before the Bearer token, so a caller can't override
   * `authorization` by accident.
   */
  headers?: HeadersInit;
}

/**
 * Exported for the plain server-route tests (`routes/api/*`), which build a
 * `Request` by hand instead of an `ORPCContext` but must present the exact
 * same token shape the oRPC guards accept.
 */
export function signTestToken(user: TestCallerUser): Promise<string> {
  return new SignJWT({ userId: user.userId, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(jwtSecret);
}

export async function createTestCaller({
  database,
  user,
  paymentProvider,
  resHeaders,
  requestUrl = 'http://localhost/rpc/test',
  headers: extraHeaders,
}: CreateTestCallerOptions): Promise<ORPCContext> {
  const headers = new Headers(extraHeaders);
  if (user) {
    const token = await signTestToken(user);
    headers.set('authorization', `Bearer ${token}`);
  }

  return createContext({
    request: new Request(requestUrl, { headers }),
    database,
    paymentProvider,
    resHeaders,
  });
}
