/**
 * Sliding-window throttle for failed logins (audit C5).
 *
 * Two keys are tracked per attempt: the identifier (stops one account being
 * brute-forced from many addresses) and the client IP (stops one address
 * spraying many accounts). Only *failures* count, and a success clears the
 * identifier's record, so a legitimate user is never locked out by their own
 * successful logins.
 *
 * ponytail: per-process memory, so the limit is per instance and resets on
 * restart. Move to a shared store (DB/Redis) if the app scales out.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IDENTIFIER = 5;
const MAX_FAILURES_PER_IP = 30;
const MAX_TRACKED_KEYS = 10_000;

const FALLBACK_IP = 'unknown-ip';

const failures = new Map<string, number[]>();

/**
 * Best-effort client address behind the reverse proxy.
 * ponytail: `x-forwarded-for` is only trustworthy when the proxy overwrites it;
 * the per-identifier limit still holds if a client spoofs the address.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || FALLBACK_IP;
  }

  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    FALLBACK_IP
  );
}

function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (kept.length === 0) {
    failures.delete(key);
  } else {
    failures.set(key, kept);
  }
  return kept;
}

const identifierKey = (identifier: string) =>
  `id:${identifier.trim().toLowerCase()}`;
const ipKey = (ip: string) => `ip:${ip}`;

export function isLoginBlocked(
  identifier: string,
  ip: string,
  now = Date.now()
): boolean {
  return (
    recent(identifierKey(identifier), now).length >=
      MAX_FAILURES_PER_IDENTIFIER ||
    recent(ipKey(ip), now).length >= MAX_FAILURES_PER_IP
  );
}

export function recordLoginFailure(
  identifier: string,
  ip: string,
  now = Date.now()
): void {
  if (failures.size > MAX_TRACKED_KEYS) {
    failures.clear();
  }
  for (const key of [identifierKey(identifier), ipKey(ip)]) {
    failures.set(key, [...recent(key, now), now]);
  }
}

export function clearLoginFailures(identifier: string): void {
  failures.delete(identifierKey(identifier));
}

/** Test hook: start from a clean slate. */
export function resetLoginThrottle(): void {
  failures.clear();
}
