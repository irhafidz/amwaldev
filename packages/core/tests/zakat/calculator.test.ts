import { describe, expect, test } from 'bun:test';
import {
  calculateZakatFitrah,
  calculateZakatMaal,
} from '../../src/zakat/calculator';
import {
  createGoldPriceService,
  GOLD_PRICE_CACHE_TTL_MS,
} from '../../src/zakat/gold-price';

describe('zakat calculator', () => {
  test('zakat maal below 85g gold nisab is not obligatory', () => {
    const result = calculateZakatMaal(8_000_000n, 100_000n);

    expect(result.nisab).toBe(8_500_000n);
    expect(result.wajibZakat).toBe(false);
    expect(result.zakatAmount).toBe(0n);
  });

  test('zakat maal at or above nisab applies exact 2.5%', () => {
    const result = calculateZakatMaal(9_000_000n, 100_000n);

    expect(result.wajibZakat).toBe(true);
    expect(result.zakatAmount).toBe(225_000n);
  });

  test('zakat fitrah multiplies persons by database config price', () => {
    const result = calculateZakatFitrah(5, {
      pricePerPerson: 45_000n,
    });

    expect(result.zakatAmount).toBe(225_000n);
  });
});

describe('gold price cache and stale fallback', () => {
  test('fresh provider result is cached and stale fallback is served after TTL', async () => {
    let currentTime = Date.now();
    let fetchCount = 0;
    let shouldThrow = false;
    const provider = {
      fetchPrice: () => {
        fetchCount += 1;
        if (shouldThrow) {
          return Promise.reject(new Error('gold provider unavailable'));
        }
        return Promise.resolve(1_500_000n);
      },
    };

    const service = createGoldPriceService({
      database: null,
      provider,
      now: () => currentTime,
    });

    const first = await service.getLivePrice();
    expect(first.price).toBe(1_500_000n);
    expect(first.isStale).toBe(false);

    const second = await service.getLivePrice();
    expect(second.price).toBe(1_500_000n);
    expect(second.isStale).toBe(false);
    expect(fetchCount).toBe(1);

    currentTime += GOLD_PRICE_CACHE_TTL_MS + 1;
    shouldThrow = true;

    const stale = await service.getLivePrice();
    expect(stale.price).toBe(1_500_000n);
    expect(stale.isStale).toBe(true);
    expect(fetchCount).toBe(2);

    const stillStale = await service.getLivePrice();
    expect(stillStale.isStale).toBe(true);
    expect(fetchCount).toBe(3);
  });
});
