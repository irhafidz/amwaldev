/**
 * Sliding-window limiter keyed by an arbitrary string. Used where an endpoint
 * can be hammered for side effects (sending email) rather than guessed at.
 *
 * ponytail: per-process memory, so the limit is per instance and resets on
 * restart. Move to a shared store (DB/Redis) if the app scales out.
 */
const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter(options: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return {
    /** Records an attempt for `key`; `false` once it is over the limit. */
    allow(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter(
        (at) => now - at < options.windowMs
      );
      if (recent.length >= options.max) {
        hits.set(key, recent);
        return false;
      }
      if (hits.size > MAX_TRACKED_KEYS) {
        hits.clear();
      }
      hits.set(key, [...recent, now]);
      return true;
    },
    /** Test hook: forget everything. */
    reset(): void {
      hits.clear();
    },
  };
}
