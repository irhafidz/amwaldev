import { desc, eq } from 'drizzle-orm';
import { zakatFitrahConfig } from '../db/schema';
import type { Database } from '../db/types';
import { DEFAULT_FITRAH_PRICE_PER_PERSON } from './calculator';

/**
 * Ported from `apps/server/src/lib/zakat/fitrah.ts` (Putaran 17, Batch 1).
 * The only behavioural change: `database` is now required, not defaulted to
 * an app-bound singleton — a shared kernel package cannot assume any one
 * app's `DATABASE_URL`. The one real call site
 * (`apps/server/src/routes/zakat.ts`) already always passes it explicitly,
 * so this is a zero-diff repoint for every consumer.
 */
export async function getActiveFitrahPricePerPerson(deps: {
  database: Database;
}): Promise<bigint> {
  const { database } = deps;
  const [config] = await database
    .select({ pricePerPerson: zakatFitrahConfig.konversiHargaPerJiwa })
    .from(zakatFitrahConfig)
    .where(eq(zakatFitrahConfig.isActive, true))
    .orderBy(desc(zakatFitrahConfig.updatedAt))
    .limit(1);

  if (!config) {
    return DEFAULT_FITRAH_PRICE_PER_PERSON;
  }

  const [integerPart] = config.pricePerPerson.split('.');
  return BigInt(integerPart || '0');
}
