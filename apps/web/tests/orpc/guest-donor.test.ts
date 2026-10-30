import { afterAll, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '../../src/lib/db';
import { assertTestDatabase } from '../test-database-guard';

/** Audit C4: guest donations must not be auto-linked to registered accounts. */

const connectionUrl = assertTestDatabase();

const { createDatabase } = await import('../../src/lib/db');
const schema = await import('../../src/lib/db/schema');
const { resolveGuestDonor } = await import('@amwal/core/identity/guest');

const database: Database = createDatabase(connectionUrl);
const runId = ulid().toLowerCase();
const createdIds = new Set<string>();

function track(id: string) {
  createdIds.add(id);
  return id;
}

describe('resolveGuestDonor (audit C4)', () => {
  afterAll(async () => {
    const ids = [...createdIds];
    if (ids.length > 0) {
      await database.delete(schema.users).where(inArray(schema.users.id, ids));
    }
  });

  test('a registered account (has a password) is never linked silently', async () => {
    const accountId = track(`c4-${runId}-account`);
    const email = `c4-${runId}-account@example.com`;
    await database.insert(schema.users).values({
      id: accountId,
      email,
      name: 'Pemilik Akun',
      passwordHash: 'x-not-a-real-hash',
      updatedAt: new Date().toISOString(),
    });

    const resolved = track(
      await resolveGuestDonor(database, {
        donorName: 'Orang Lain',
        donorEmail: email,
      })
    );

    expect(resolved).not.toBe(accountId);
    const [guest] = await database
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, resolved));
    expect(guest?.email).toBeNull();
    expect(guest?.name).toBe('Orang Lain');
  });

  test('a returning guest (no password) is reused', async () => {
    const email = `c4-${runId}-guest@example.com`;
    const first = track(
      await resolveGuestDonor(database, {
        donorName: 'Tamu',
        donorEmail: email,
      })
    );
    const second = await resolveGuestDonor(database, {
      donorName: 'Tamu',
      donorEmail: email,
    });

    expect(second).toBe(first);
  });

  test('parallel first-time donations with one email do not throw or duplicate', async () => {
    const email = `c4-${runId}-race@example.com`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        resolveGuestDonor(database, { donorName: 'Balapan', donorEmail: email })
      )
    );
    for (const id of results) {
      track(id);
    }

    expect(new Set(results).size).toBe(1);
    const rows = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    expect(rows).toHaveLength(1);
  });
});
