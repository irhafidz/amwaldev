import { createGoldPriceService } from '@amwal/core/zakat/gold-price';
import { db } from '@/lib/db';

/**
 * Composition shim (Putaran 17, Batch 3) — a 1:1 port of
 * `apps/server/src/lib/zakat/gold-price.ts`. `GoldPriceUnavailableError` is
 * re-exported (not re-declared) so `instanceof` checks in the zakat oRPC
 * router keep working against the exact same class the shared factory
 * throws.
 */
export { GoldPriceUnavailableError } from '@amwal/core/zakat/gold-price';

export const goldPriceService = createGoldPriceService({ database: db });
