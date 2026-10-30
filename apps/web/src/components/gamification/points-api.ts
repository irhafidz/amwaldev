import { orpc } from '@/lib/orpc/client';
import type {
  CheckInResult,
  PointsHistoryPage,
  PointsSummary,
} from './points-types';

/**
 * The `/poin` screen's data access (`I-10c`).
 *
 * Until `I-10b` landed this file reached the namespace through a documented
 * cast, because the procedures did not exist and a cast-free call would not
 * typecheck. The procedures are real now, so the cast is gone: these are plain
 * typed oRPC calls, and every response shape is the Zod schema in
 * `@amwal/core/contracts/gamification`.
 */

/** Row count per page; `pointsHistorySchema` caps `limit` at 100. */
const DEFAULT_HISTORY_LIMIT = 20;

export function loadPointsSummary(): Promise<PointsSummary> {
  return orpc.gamification.summary({});
}

export function loadPointsHistory(
  limit = DEFAULT_HISTORY_LIMIT
): Promise<PointsHistoryPage> {
  return orpc.gamification.history({ limit });
}

export function submitCheckIn(): Promise<CheckInResult> {
  return orpc.gamification.checkIn({});
}
