import { parseInstant as toInstant } from '../time/wib';

/**
 * Presentation helpers for certificates (Sprint 11, `I-5`).
 *
 * Lives next to `generator.ts` instead of a new exported module because
 * `packages/core/package.json` is owned by Claude Pro (PLAN §3) — both
 * `./certificate/generator` and `./certificate/service` re-export this file,
 * so every consumer stays reachable without touching the manifest.
 *
 * Two things here are load-bearing and must not be "simplified":
 *
 * 1. Every date is formatted with an **explicit** `Asia/Jakarta` time zone.
 *    The bug this fixes: `toLocaleDateString()` without a zone used the
 *    runtime zone (UTC on the server), so a donation made at 00:30 WIB was
 *    printed as the previous day.
 * 2. Timestamps arrive from Postgres as naive strings (`mode: 'string'` on a
 *    `timestamp(3)` column, no offset). Postgres runs in UTC here, so a naive
 *    value must be read as UTC — `new Date('2026-09-17 00:30:00')` would
 *    otherwise be parsed in the server's local zone and shift the instant.
 */

/** Trailing slashes on `PUBLIC_APP_URL` must not produce `//verifikasi/`. */
const TRAILING_SLASHES = /\/+$/;

const WHITESPACE = /\s+/;

/** Certificate numbers are sequential, so a public lookup is enumerable. */
const MAX_PUBLIC_NAME_PARTS = 3;

const WIB_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Printed on the PDF and the public verification page for anonymous donors. */
export const ANONYMOUS_DONOR_LABEL = 'Hamba Allah (Anonim)';

/**
 * DB rows carry naive timestamps; they are UTC wall time, never local time.
 * The rule lives in `@amwal/core/time/wib` so certificates, check-in and
 * penalty settlement cannot drift apart (PLAN §8, "Zona waktu").
 */
export { parseInstant as toInstant } from '../time/wib';

function wibFields(value: Date | string): Map<string, string> {
  return new Map(
    WIB_FORMATTER.formatToParts(toInstant(value)).map((part) => [
      part.type,
      part.value,
    ])
  );
}

function pad(raw: string | undefined): string {
  return (raw ?? '').padStart(2, '0');
}

/** `17 September 2026` — the signature block needs the day, not the clock. */
export function formatWibDate(value: Date | string): string {
  const parts = wibFields(value);
  return `${pad(parts.get('day'))} ${parts.get('month')} ${parts.get('year')}`;
}

/** `17 September 2026, 00:30:00 WIB` — the canonical `I-5` format. */
export function formatWibDateTime(value: Date | string): string {
  const parts = wibFields(value);
  const date = `${pad(parts.get('day'))} ${parts.get('month')} ${parts.get('year')}`;
  const clock = [
    pad(parts.get('hour')),
    pad(parts.get('minute')),
    pad(parts.get('second')),
  ].join(':');

  return `${date}, ${clock} WIB`;
}

/**
 * `null` means "there is no name to show" — callers pick their own fallback.
 * An anonymous donation never reveals the stored `namaWakif`, on the PDF or
 * on the public verification page.
 */
export function maskDonorName(
  nama: string | null | undefined,
  isAnonymous: boolean
): string | null {
  if (isAnonymous) {
    return ANONYMOUS_DONOR_LABEL;
  }

  const trimmed = nama?.trim();
  return trimmed ? trimmed : null;
}

/** `Budi Santoso` → `B. S.` */
export function initialsOf(nama: string): string {
  return nama
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, MAX_PUBLIC_NAME_PARTS)
    .map((part) => `${part.at(0)?.toUpperCase() ?? ''}.`)
    .join(' ');
}

/**
 * The name shown on the **public** verification page.
 *
 * Stricter than `maskDonorName()` on purpose: `CERT-AMW-YYYY-NNNN` numbers are
 * sequential, so anyone can walk the range and harvest donor names off a page
 * that needs no session. The page therefore shows initials for a named donor —
 * enough for the certificate holder to recognise their own certificate, not
 * enough to build a donor list. The PDF keeps the full name (it is the donor's
 * own document, behind the owner/admin gate).
 */
export function maskDonorNameForPublic(
  nama: string | null | undefined,
  isAnonymous: boolean
): string | null {
  if (isAnonymous) {
    return ANONYMOUS_DONOR_LABEL;
  }

  const trimmed = nama?.trim();
  return trimmed ? initialsOf(trimmed) : null;
}

/**
 * QR target for a certificate: `<PUBLIC_APP_URL>/verifikasi/<nomor>`.
 *
 * Fail-closed on purpose. The previous hard-coded `https://amwal.id/verify-cert/…`
 * has no route anywhere in the app, so a certificate carrying it was
 * unverifiable — silently generating a QR to nowhere is worse than refusing
 * to issue the PDF.
 */
export function buildVerificationUrl(
  nomor: string,
  verifyBaseUrl: string
): string {
  const base = verifyBaseUrl.trim().replace(TRAILING_SLASHES, '');
  if (!base) {
    throw new Error(
      'PUBLIC_APP_URL belum diisi: QR sertifikat tidak boleh menunjuk ke alamat kosong'
    );
  }

  const parsed = new URL(base);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `PUBLIC_APP_URL harus http(s), menerima "${parsed.protocol}"`
    );
  }

  return `${base}/verifikasi/${encodeURIComponent(nomor)}`;
}
