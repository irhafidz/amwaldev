import { AFFILIATE_REF_COOKIE } from '@amwal/core/contracts/affiliate';
import { getCookie } from '@orpc/server/helpers';

/**
 * Nilai mentah cookie atribusi first-touch `amwal_ref` [I-4], dibaca dari
 * permintaan checkout. Dipakai keempat prosedur `createOrder` (waqf, zakat,
 * infaq, qurban) supaya satu nama cookie tidak diketik ulang empat kali.
 */
export function readReferralCookie(request: Request): string | undefined {
  return getCookie(request.headers, AFFILIATE_REF_COOKIE);
}
