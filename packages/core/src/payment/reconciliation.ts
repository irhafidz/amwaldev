import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { transactions } from '../db/schema';
import type { Database } from '../db/types';
import type { PaymentModule } from './order-id';
import type { PaymentProvider } from './types';
import type { ApplyProviderEventResult } from './webhook';
import { applyProviderEvent } from './webhook';

/**
 * Jaring pengaman rekonsiliasi pembayaran [I-11].
 *
 * Ada karena webhook TIDAK dijamin sampai — timeout jaringan, DNS yang
 * salah, atau Mayar yang gagal mengirim ulang bisa meninggalkan transaksi
 * PENDING selamanya walau donasinya sudah lunas di sisi Mayar. Job ini
 * memoles ulang setiap transaksi yang masih PENDING setelah jeda tertentu.
 *
 * Memanggil `applyProviderEvent` — fungsi SAMA yang dipanggil webhook —
 * sehingga run yang tumpang tindih dengan webhook yang terlambat tidak bisa
 * menghitung ganda. Idempotensi datang dari `UPDATE ... WHERE status !=
 * 'LUNAS'` di dalam `applyProviderEvent`, bukan dari job ini menghindari
 * transaksi yang sama dua kali.
 *
 * Hanya bertindak untuk provider yang mengimplementasikan
 * `reconcileTransaction` (Mayar). Provider webhook-murni (Mock, Midtrans)
 * tidak punya API re-fetch server-side untuk dipoling — `supported: false`
 * memberi tahu pemanggil itu bukan kegagalan, hanya tidak relevan.
 */

const DEFAULT_STALE_MINUTES = 15;
const DEFAULT_BATCH_LIMIT = 50;
const MINUTE_MS = 60_000;

export interface ReconcilePendingTransactionsDeps {
  database: Database;
  paymentProvider: PaymentProvider;
  /** Disuntikkan tes untuk cutoff waktu yang deterministik. */
  now?: Date;
  /** Transaksi lebih muda dari ini tidak disentuh. Default 15 menit. */
  staleMinutes?: number;
  /** Batas jumlah transaksi per pemanggilan. Default 50. */
  limit?: number;
  /**
   * Persempit pemindaian ke transaksi ini saja (mis. satu pesanan, atau tes
   * yang tidak boleh terpengaruh baris PENDING milik pihak lain di basis data
   * bersama). Tanpa ini, semua transaksi PENDING yang usang dipindai.
   */
  onlyTransactionIds?: readonly string[];
  /**
   * Efek samping penyelesaian (WhatsApp, notifikasi, poin, sertifikat), dipanggil
   * SETELAH transaksi basis data commit dan hanya untuk transaksi yang benar-
   * benar berpindah ke LUNAS oleh pemanggilan ini. Tanpa ini, donasi yang
   * diselesaikan lewat rekonsiliasi atau cek status tidak pernah memicu
   * notifikasi karena hook itu hanya terpasang di rute webhook. Kegagalannya
   * ditelan: notifikasi tidak boleh mengubah hasil rekonsiliasi.
   */
  onSettled?: (
    module: PaymentModule,
    orderId: string,
    amount: string
  ) => Promise<void>;
}

export interface ReconciliationItem {
  transactionId: string;
  outcome: ApplyProviderEventResult['status'] | 'retry' | 'rejected' | 'error';
  detail?: string;
}

export interface ReconciliationSummary {
  /** `false` bila provider aktif tidak punya API polling (Mock/Midtrans). */
  supported: boolean;
  scanned: number;
  settled: number;
  failed: number;
  skipped: number;
  items: ReconciliationItem[];
}

type ReconcilableProvider = PaymentProvider &
  Required<Pick<PaymentProvider, 'name'>> & {
    reconcileTransaction: NonNullable<PaymentProvider['reconcileTransaction']>;
  };

function isReconcilable(
  provider: PaymentProvider
): provider is ReconcilableProvider {
  return typeof provider.reconcileTransaction === 'function';
}

type Candidate = { id: string; paymentGatewayRef: string };

type SettledResult = Extract<ApplyProviderEventResult, { status: 'settled' }>;

interface ReconcileOutcome {
  item: ReconciliationItem;
  settled?: SettledResult;
}

async function reconcileOne(
  database: Database,
  provider: ReconcilableProvider,
  candidate: Candidate
): Promise<ReconcileOutcome> {
  const resolution = await provider.reconcileTransaction(
    candidate.paymentGatewayRef
  );

  if (resolution.type === 'retry' || resolution.type === 'rejected') {
    return {
      item: {
        transactionId: candidate.id,
        outcome: resolution.type,
        detail: resolution.message,
      },
    };
  }
  if (resolution.type === 'ignored') {
    return { item: { transactionId: candidate.id, outcome: 'rejected' } };
  }

  const result = await database.transaction((tx) =>
    applyProviderEvent(tx, resolution.event)
  );

  return {
    item: { transactionId: candidate.id, outcome: result.status },
    settled: result.status === 'settled' ? result : undefined,
  };
}

/**
 * Satu transaksi bermasalah (mis. `AmountMismatchError`) tidak boleh
 * menghentikan sisa batch — dicatat sebagai item `error`, lanjut ke
 * transaksi berikutnya.
 */
async function reconcileOneSafely(
  database: Database,
  provider: ReconcilableProvider,
  candidate: Candidate
): Promise<ReconcileOutcome> {
  try {
    return await reconcileOne(database, provider, candidate);
  } catch (error) {
    return {
      item: {
        transactionId: candidate.id,
        outcome: 'error',
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchStaleCandidates(
  database: Database,
  cutoff: Date,
  limit: number,
  onlyTransactionIds?: readonly string[]
): Promise<Candidate[]> {
  if (onlyTransactionIds?.length === 0) {
    return [];
  }

  const rows = await database
    .select({
      id: transactions.id,
      paymentGatewayRef: transactions.paymentGatewayRef,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.statusPembayaran, 'PENDING'),
        isNotNull(transactions.paymentGatewayRef),
        lt(transactions.createdAt, cutoff.toISOString()),
        onlyTransactionIds
          ? inArray(transactions.id, [...onlyTransactionIds])
          : undefined
      )
    )
    .limit(limit);

  // `isNotNull` di atas menjamin `paymentGatewayRef` bukan null di database;
  // filter ini hanya menyempitkan tipenya untuk TypeScript.
  return rows.filter((row): row is Candidate => row.paymentGatewayRef !== null);
}

function tally(items: ReconciliationItem[]): {
  settled: number;
  failed: number;
  skipped: number;
} {
  let settled = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    if (item.outcome === 'settled') {
      settled += 1;
    } else if (item.outcome === 'failed') {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  return { settled, failed, skipped };
}

export async function reconcilePendingTransactions(
  deps: ReconcilePendingTransactionsDeps
): Promise<ReconciliationSummary> {
  const { database, paymentProvider } = deps;
  const staleMinutes = deps.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const limit = deps.limit ?? DEFAULT_BATCH_LIMIT;
  const now = deps.now ?? new Date();

  if (!isReconcilable(paymentProvider)) {
    return {
      supported: false,
      scanned: 0,
      settled: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }

  const cutoff = new Date(now.getTime() - staleMinutes * MINUTE_MS);
  const candidates = await fetchStaleCandidates(
    database,
    cutoff,
    limit,
    deps.onlyTransactionIds
  );

  const items: ReconciliationItem[] = [];
  for (const candidate of candidates) {
    const { item, settled } = await reconcileOneSafely(
      database,
      paymentProvider,
      candidate
    );
    items.push(item);

    if (settled && deps.onSettled) {
      try {
        await deps.onSettled(settled.module, settled.orderId, settled.amount);
      } catch {
        // Best-effort: a notification failure must not undo a settlement.
      }
    }
  }

  return {
    supported: true,
    scanned: candidates.length,
    ...tally(items),
    items,
  };
}
