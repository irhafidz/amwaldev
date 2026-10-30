import { desc } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { zakatGoldPriceHistory } from '../db/schema';
import type { Database } from '../db/types';
import type { ZakatAmountInput } from './calculator';

export const GOLD_PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class GoldPriceUnavailableError extends Error {}

export interface GoldPriceProvider {
  fetchPrice(): Promise<ZakatAmountInput>;
}

export interface LiveGoldPrice {
  price: bigint;
  isStale: boolean;
  fetchedAt: string;
  source: 'LIVE_API' | 'MANUAL_FALLBACK';
}

export interface GoldPriceDeps {
  database?: Database | null;
  provider?: GoldPriceProvider;
  now?: () => number;
}

interface GoldPriceCache {
  price: bigint;
  fetchedAtMs: number;
}

interface HistoryRow {
  pricePerGram: string;
  source: 'LIVE_API' | 'MANUAL_FALLBACK';
  fetchedAt: string;
}

function toExactBigInt(value: ZakatAmountInput, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `${label} must be an exact integer; fractional or unsafe numbers are forbidden`
      );
    }
    return BigInt(value);
  }
  return value;
}

function decimalStringToBigInt(value: string): bigint {
  const normalized = value.trim();
  const [integerPart] = normalized.split('.');
  return BigInt(integerPart || '0');
}

function isFresh(fetchedAtMs: number, now: number): boolean {
  return now - fetchedAtMs < GOLD_PRICE_CACHE_TTL_MS;
}

function liveFromCache(
  cache: GoldPriceCache,
  now: number
): LiveGoldPrice | null {
  if (!isFresh(cache.fetchedAtMs, now)) {
    return null;
  }
  return {
    price: cache.price,
    isStale: false,
    fetchedAt: new Date(cache.fetchedAtMs).toISOString(),
    source: 'LIVE_API',
  };
}

function liveFromManual(row: HistoryRow): LiveGoldPrice {
  return {
    price: decimalStringToBigInt(row.pricePerGram),
    isStale: false,
    fetchedAt: row.fetchedAt,
    source: 'MANUAL_FALLBACK',
  };
}

async function readLatest(
  database: Database | null
): Promise<HistoryRow | null> {
  if (!database) {
    return null;
  }

  const [row] = await database
    .select({
      pricePerGram: zakatGoldPriceHistory.pricePerGram,
      source: zakatGoldPriceHistory.source,
      fetchedAt: zakatGoldPriceHistory.fetchedAt,
    })
    .from(zakatGoldPriceHistory)
    .orderBy(desc(zakatGoldPriceHistory.fetchedAt))
    .limit(1);

  return row ?? null;
}

async function fetchAndRecord(
  database: Database | null,
  provider: GoldPriceProvider,
  now: number
): Promise<LiveGoldPrice> {
  const price = toExactBigInt(await provider.fetchPrice(), 'gold price');
  if (price <= 0n) {
    throw new Error('Gold price must be positive');
  }

  if (database) {
    await database.insert(zakatGoldPriceHistory).values({
      id: `GOLD-${ulid()}`,
      pricePerGram: price.toString(),
      source: 'LIVE_API',
    });
  }

  return {
    price,
    isStale: false,
    fetchedAt: new Date(now).toISOString(),
    source: 'LIVE_API',
  };
}

function staleFromCache(
  cache: GoldPriceCache,
  latest: HistoryRow | null
): LiveGoldPrice {
  return {
    price: cache.price,
    isStale: true,
    fetchedAt: latest?.fetchedAt ?? new Date(cache.fetchedAtMs).toISOString(),
    source: latest?.source ?? 'MANUAL_FALLBACK',
  };
}

function staleFromHistory(latest: HistoryRow): LiveGoldPrice {
  return {
    price: decimalStringToBigInt(latest.pricePerGram),
    isStale: true,
    fetchedAt: latest.fetchedAt,
    source: latest.source,
  };
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Gold price API responded with ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function fetchLiveGoldPricePerGram(): Promise<bigint> {
  const gold = await fetchJson('https://api.gold-api.com/price/XAU');
  const usdPerTroyOunce = Number(gold.price);
  if (!Number.isFinite(usdPerTroyOunce) || usdPerTroyOunce <= 0) {
    throw new Error('Invalid gold price payload');
  }

  const fx = await fetchJson('https://open.er-api.com/v6/latest/USD');
  const rates = fx.rates as Record<string, unknown> | undefined;
  const idrPerUsd = Number(rates?.IDR);
  if (!Number.isFinite(idrPerUsd) || idrPerUsd <= 0) {
    throw new Error('Invalid USD-IDR rate payload');
  }

  const pricePerGram = (usdPerTroyOunce / 31.1035) * idrPerUsd;
  return BigInt(Math.round(pricePerGram));
}

class GoldPriceService {
  private readonly database: Database | null;
  private readonly provider: GoldPriceProvider;
  private readonly now: () => number;
  private cache: GoldPriceCache | null = null;

  constructor(deps: GoldPriceDeps = {}) {
    this.database = deps.database ?? null;
    this.provider = deps.provider ?? {
      fetchPrice: fetchLiveGoldPricePerGram,
    };
    this.now = deps.now ?? Date.now;
  }

  async getLivePrice(): Promise<LiveGoldPrice> {
    const latest = await readLatest(this.database);
    const manual =
      latest?.source === 'MANUAL_FALLBACK' ? liveFromManual(latest) : null;
    if (manual) {
      return manual;
    }

    const cachedOrHistory = this.#freshFromCacheOrHistory(latest);
    if (cachedOrHistory) {
      return cachedOrHistory;
    }

    return this.#fetchFreshOrStale(latest);
  }

  #freshFromCacheOrHistory(latest: HistoryRow | null): LiveGoldPrice | null {
    if (this.cache) {
      const cached = liveFromCache(this.cache, this.now());
      if (cached) {
        return cached;
      }
    }

    if (latest && isFresh(Date.parse(latest.fetchedAt), this.now())) {
      this.cache = {
        price: decimalStringToBigInt(latest.pricePerGram),
        fetchedAtMs: this.now(),
      };
      return {
        price: this.cache.price,
        isStale: false,
        fetchedAt: latest.fetchedAt,
        source: latest.source,
      };
    }

    return null;
  }

  async #fetchFreshOrStale(latest: HistoryRow | null): Promise<LiveGoldPrice> {
    try {
      const fresh = await fetchAndRecord(
        this.database,
        this.provider,
        this.now()
      );
      this.cache = {
        price: fresh.price,
        fetchedAtMs: this.now(),
      };
      return fresh;
    } catch {
      let fallback: LiveGoldPrice | null = null;
      if (this.cache !== null) {
        fallback = staleFromCache(this.cache, latest);
      } else if (latest !== null) {
        fallback = staleFromHistory(latest);
      }

      if (fallback !== null) {
        return fallback;
      }

      throw new GoldPriceUnavailableError(
        'Gold price is unavailable and no historical price exists'
      );
    }
  }
}

/**
 * Ported from `apps/server/src/lib/zakat/gold-price.ts` (Putaran 17, Batch
 * 1). The only behavioural change: no `defaultDb` fallback — a shared kernel
 * package cannot assume any one app's `DATABASE_URL`. Each app wires its own
 * env-bound singleton (`createGoldPriceService({ database: db })`) in a thin
 * composition file; this factory itself is unchanged.
 */
export function createGoldPriceService(
  deps: GoldPriceDeps = {}
): GoldPriceService {
  return new GoldPriceService(deps);
}
