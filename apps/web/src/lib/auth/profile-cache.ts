/**
 * Server-side cache of the profile fields shown next to the session (name,
 * email, phone), so `fetchSessionUser` does not hit the database on every
 * request and every client navigation. The signed token already proves who the
 * caller is; this only fills in display fields, so a minute of staleness is
 * harmless and a profile edit drops its own entry.
 *
 * ponytail: per-process memory, so another instance can show an old name for up
 * to one TTL after an edit. Move to a shared store if the app scales out.
 */
export interface SessionProfile {
  email?: string;
  name?: string;
  phone?: string;
}

export const PROFILE_TTL_MS = 60_000;
const MAX_ENTRIES = 2000;

const entries = new Map<
  string,
  { expiresAt: number; profile: SessionProfile }
>();

export function getCachedProfile(
  userId: string,
  now = Date.now()
): SessionProfile | null {
  const hit = entries.get(userId);
  if (!hit) {
    return null;
  }
  if (hit.expiresAt <= now) {
    entries.delete(userId);
    return null;
  }
  return hit.profile;
}

export function cacheProfile(
  userId: string,
  profile: SessionProfile,
  now = Date.now()
): void {
  if (entries.size >= MAX_ENTRIES) {
    entries.clear();
  }
  entries.set(userId, { expiresAt: now + PROFILE_TTL_MS, profile });
}

export function invalidateProfile(userId: string): void {
  entries.delete(userId);
}
