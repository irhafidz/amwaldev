import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { users } from '../db/schema';
import type { Database } from '../db/types';

export const SYSTEM_ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000001';
export const SYSTEM_ANONYMOUS_EMAIL = 'hamba.allah@amwal.internal';

export function cleanOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps the driver error, so the SQLSTATE can sit on `cause`. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
  return code === UNIQUE_VIOLATION || causeCode === UNIQUE_VIOLATION;
}

async function findByContact(
  database: Database,
  email: string | null,
  phone: string | null
): Promise<{ id: string; passwordHash: string | null } | undefined> {
  const columns = { id: users.id, passwordHash: users.passwordHash };

  if (email !== null) {
    const [byEmail] = await database
      .select(columns)
      .from(users)
      .where(eq(users.email, email));
    if (byEmail) {
      return byEmail;
    }
  }

  if (phone === null) {
    return;
  }
  const [byPhone] = await database
    .select(columns)
    .from(users)
    .where(eq(users.phone, phone));
  return byPhone;
}

async function insertGuest(
  database: Database,
  input: { name: string; email: string | null; phone: string | null }
): Promise<string> {
  const id = `guest-${ulid()}`;
  await database.insert(users).values({
    id,
    email: input.email,
    phone: input.phone,
    name: input.name,
    updatedAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Maps a public (unauthenticated) donation to a user row.
 *
 * Email/phone are claims, not proof: anyone can type someone else's address.
 * So a donation is only ever attached to an existing row that has no password
 * (a previous guest). A registered account (has `passwordHash`) is never
 * linked silently — the order gets its own contact-less guest row instead, and
 * the donor details stay on the order itself.
 */
export async function resolveGuestDonor(
  database: Database,
  input: {
    donorName: string;
    donorEmail?: string | undefined;
    donorPhone?: string | undefined;
  }
): Promise<string> {
  const email = cleanOptional(input.donorEmail);
  const phone = cleanOptional(input.donorPhone);

  if (!(email || phone)) {
    return ensureSystemAnonymousUser(database);
  }

  const unlinked = { name: input.donorName, email: null, phone: null };
  const existing = await findByContact(database, email, phone);

  if (existing) {
    return existing.passwordHash
      ? await insertGuest(database, unlinked)
      : existing.id;
  }

  try {
    return await insertGuest(database, { name: input.donorName, email, phone });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A concurrent request created the same contact between our lookup and
    // insert: reuse that row (unless it turned out to be a registered account).
    const raced = await findByContact(database, email, phone);
    return raced && !raced.passwordHash
      ? raced.id
      : await insertGuest(database, unlinked);
  }
}

async function ensureSystemAnonymousUser(database: Database): Promise<string> {
  const existing = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, SYSTEM_ANONYMOUS_USER_ID));

  if (existing[0]) {
    return existing[0].id;
  }

  await database.insert(users).values({
    id: SYSTEM_ANONYMOUS_USER_ID,
    email: SYSTEM_ANONYMOUS_EMAIL,
    name: 'Hamba Allah (Sistem)',
    updatedAt: new Date().toISOString(),
  });

  return SYSTEM_ANONYMOUS_USER_ID;
}
