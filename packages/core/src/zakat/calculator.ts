export const GOLD_NISAB_GRAM = 85n;
/** Standard BAZNAS rate (Rp 45.000 ≈ 2,5 kg beras) used when no config is active. */
export const DEFAULT_FITRAH_PRICE_PER_PERSON = 45_000n;
export const ZAKAT_RATE_NUMERATOR = 25n;
export const ZAKAT_RATE_DENOMINATOR = 1000n;

export type ZakatAmountInput = bigint | number;

export interface ZakatMaalResult {
  wajibZakat: boolean;
  nisab: bigint;
  zakatAmount: bigint;
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

function toNonNegativeBigInt(value: ZakatAmountInput, label: string): bigint {
  const exact = toExactBigInt(value, label);
  if (exact < 0n) {
    throw new Error(`${label} must not be negative`);
  }
  return exact;
}

export function calculateZakatMaal(
  totalWealth: ZakatAmountInput,
  goldPricePerGram: ZakatAmountInput
): ZakatMaalResult {
  const wealth = toNonNegativeBigInt(totalWealth, 'totalWealth');
  const pricePerGram = toNonNegativeBigInt(
    goldPricePerGram,
    'goldPricePerGram'
  );
  const nisab = GOLD_NISAB_GRAM * pricePerGram;

  if (wealth < nisab) {
    return {
      wajibZakat: false,
      nisab,
      zakatAmount: 0n,
    };
  }

  return {
    wajibZakat: true,
    nisab,
    zakatAmount: (wealth * ZAKAT_RATE_NUMERATOR) / ZAKAT_RATE_DENOMINATOR,
  };
}

export function calculateZakatFitrah(
  numberOfPersons: number,
  config: { pricePerPerson: ZakatAmountInput }
): { zakatAmount: bigint } {
  if (!Number.isSafeInteger(numberOfPersons) || numberOfPersons < 0) {
    throw new Error('numberOfPersons must be a non-negative safe integer');
  }

  const pricePerPerson = toNonNegativeBigInt(
    config.pricePerPerson,
    'config.pricePerPerson'
  );

  return {
    zakatAmount: BigInt(numberOfPersons) * pricePerPerson,
  };
}
