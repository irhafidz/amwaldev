/**
 * Single guard every integration test calls before its first query.
 *
 * Deliberately imports nothing from the app. `tests/orpc/test-utils.ts`
 * pulls in `lib/orpc/context` → `lib/db` → `env/server.ts`, whose schema
 * validation throws on any missing variable at import time — so a guard
 * living there would be shadowed by an unrelated env error.
 *
 * Both URLs are checked because they are used by different code: fixtures
 * connect with `TEST_DATABASE_URL ?? DATABASE_URL`, while route modules
 * under test use the `lib/db` singleton, which only ever reads
 * `DATABASE_URL`. Guarding just the first would let a correct test URL pass
 * while the singleton writes to whatever `DATABASE_URL` points at.
 */

const TEST_DATABASE_NAME = /^amwal_bun_[a-z0-9_]+_test$/;

function databaseName(connectionUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(connectionUrl).pathname.slice(1));
  } catch {
    return null;
  }
}

function assertIsTestDatabase(variable: string, connectionUrl: string): void {
  const name = databaseName(connectionUrl);
  if (!(name && TEST_DATABASE_NAME.test(name))) {
    throw new Error(
      `${variable} must point at a database named amwal_bun_<lane>_test (got "${name ?? 'unparseable URL'}"); refusing to touch any other database`
    );
  }
}

/** Returns the URL test fixtures should connect with. */
export function assertTestDatabase(): string {
  const databaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set; integration tests need it for the lib/db singleton'
    );
  }
  assertIsTestDatabase('DATABASE_URL', databaseUrl);

  if (testDatabaseUrl) {
    assertIsTestDatabase('TEST_DATABASE_URL', testDatabaseUrl);
    if (databaseName(testDatabaseUrl) !== databaseName(databaseUrl)) {
      throw new Error(
        'TEST_DATABASE_URL and DATABASE_URL name different databases; route modules under test read DATABASE_URL, so fixtures and assertions would diverge'
      );
    }
  }

  return testDatabaseUrl ?? databaseUrl;
}
