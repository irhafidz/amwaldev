export type WaqfCategory = 'HABIS_PAKAI' | 'PRODUKTIF_KEKAL';

export type WaqfMoney = bigint | number;

export interface WaqfLedgerState {
  pokokDanaTerkumpul: WaqfMoney;
  totalHasilAvailable: WaqfMoney;
  category: WaqfCategory;
}

function toExactBigInt(value: WaqfMoney, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `${label} must be an exact integer amount; fractional or unsafe numbers are forbidden`
      );
    }
    return BigInt(value);
  }
  return value;
}

function validateMoney(value: WaqfMoney, label: string): bigint {
  const exact = toExactBigInt(value, label);
  if (exact < 0n) {
    throw new Error(`${label} must not be negative`);
  }
  return exact;
}

function validateState(state: WaqfLedgerState): {
  principal: bigint;
  yieldAvailable: bigint;
} {
  return {
    principal: validateMoney(state.pokokDanaTerkumpul, 'pokokDanaTerkumpul'),
    yieldAvailable: validateMoney(
      state.totalHasilAvailable,
      'totalHasilAvailable'
    ),
  };
}

export function recordDonation(
  state: WaqfLedgerState,
  amount: number
): WaqfLedgerState {
  const { principal } = validateState(state);
  const donation = validateMoney(amount, 'amount');

  return {
    ...state,
    pokokDanaTerkumpul: principal + donation,
  };
}

export function recordYield(
  state: WaqfLedgerState,
  yieldAmount: number
): WaqfLedgerState {
  const { yieldAvailable } = validateState(state);
  const amount = validateMoney(yieldAmount, 'yieldAmount');

  return {
    ...state,
    totalHasilAvailable: yieldAvailable + amount,
  };
}

export function disburse(
  state: WaqfLedgerState,
  amount: number
): WaqfLedgerState {
  const { principal, yieldAvailable } = validateState(state);
  const disbursement = validateMoney(amount, 'amount');

  if (state.category === 'HABIS_PAKAI') {
    if (disbursement > principal) {
      throw new Error(
        `Insufficient principal: cannot disburse ${disbursement} from ${principal}`
      );
    }

    return {
      ...state,
      pokokDanaTerkumpul: principal - disbursement,
    };
  }

  if (disbursement > yieldAvailable) {
    throw new Error(
      `Insufficient available yield: cannot disburse ${disbursement} from ${yieldAvailable}`
    );
  }

  // Fiqh invariant: for a perpetual waqf, principal is never touched.
  return {
    ...state,
    pokokDanaTerkumpul: principal,
    totalHasilAvailable: yieldAvailable - disbursement,
  };
}
