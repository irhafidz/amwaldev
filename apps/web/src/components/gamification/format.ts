import type { GamificationActivityType } from '@amwal/core/contracts/gamification';

/**
 * Display helpers for the points screen (`I-10c`). Pure by design: the ledger
 * holds signed integers and ISO instants, and turning them into Indonesian
 * labels in WIB is the part that can be tested without a browser.
 */

const ACTIVITY_LABELS: Record<GamificationActivityType, string> = {
  REGISTER: 'Pendaftaran akun',
  CHECKIN: 'Check-in harian',
  QUIZ: 'Kuis',
  READ: 'Baca artikel',
  WATCH: 'Tonton video',
  TRANSACTION: 'Transaksi LUNAS',
  AFFILIATE: 'Reward afiliasi',
  PENALTY: 'Tidak check-in',
};

/**
 * Points are non-monetary (PLAN §D2) — no formatter here may ever turn them
 * into a rupiah figure.
 */
export function activityLabel(activityType: string): string {
  return (
    ACTIVITY_LABELS[activityType as GamificationActivityType] ??
    'Aktivitas tidak dikenal'
  );
}

/** `+50` / `−20` — the sign is the whole message, so it is always shown. */
export function formatPointsDelta(points: number): string {
  if (points > 0) {
    return `+${points}`;
  }
  if (points < 0) {
    return `−${Math.abs(points)}`;
  }
  return '0';
}

export function formatPointsBalance(saldo: number): string {
  return new Intl.NumberFormat('id-ID').format(saldo);
}

const HISTORY_TIMESTAMP = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Ledger rows are ISO instants; the donor reads them in WIB. A 00:30 WIB
 * check-in must not appear as the previous day (the same class of bug `I-5`
 * fixes on the certificate).
 */
export function formatPointsTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Waktu tidak diketahui';
  }

  // Assembled from parts on purpose: `id-ID` renders the clock as `00.30`,
  // while the rest of the product (certificate, `I-5`) prints `00:30`.
  const parts = new Map(
    HISTORY_TIMESTAMP.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${parts.get('day')} ${parts.get('month')} ${parts.get('year')}, ${parts.get('hour')}:${parts.get('minute')} WIB`;
}
