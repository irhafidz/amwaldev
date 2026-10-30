import type {
  checkInResultSchema,
  pointLedgerEntrySchema,
  pointsHistoryResultSchema,
  pointsSummaryResultSchema,
} from '@amwal/core/contracts/gamification';
import type { z } from 'zod';

/**
 * Response types for `/poin`, inferred from the contract schemas rather than
 * hand-written (`I-10c`).
 *
 * The earlier hand-written versions were an honest guess while `I-10b` was
 * missing; now that the procedures exist, inferring means the screen cannot
 * silently drift from what the router actually returns — a changed schema
 * becomes a type error here, at build time.
 */

export type PointsSummary = z.infer<typeof pointsSummaryResultSchema>;
export type PointsHistoryEntry = z.infer<typeof pointLedgerEntrySchema>;
export type PointsHistoryPage = z.infer<typeof pointsHistoryResultSchema>;
export type CheckInResult = z.infer<typeof checkInResultSchema>;
