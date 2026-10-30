import { count, countDistinct, eq, sql } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { transactions, waqfPrograms } from '@/lib/db/schema';
import { publicProcedure } from '../procedures';

/**
 * Statistik agregat PUBLIK untuk beranda tamu (QA-15): total dana terhimpun,
 * jumlah donatur, dan program aktif. Hanya angka agregat; tidak ada baris
 * donatur, nama, atau kontak. Dihitung dari transaksi LUNAS (semua modul).
 */

/** Beranda dibuka terus-menerus; agregat ini cukup segar setiap menit. */
const CACHE_MS = 60_000;

interface PublicStats {
  activePrograms: number;
  donorCount: number;
  totalRaised: number;
}

let cached: { at: number; value: PublicStats } | null = null;

async function loadStats(database: Database): Promise<PublicStats> {
  const [totals] = await database
    .select({
      raised: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
      donors: countDistinct(transactions.wakifId),
    })
    .from(transactions)
    .where(eq(transactions.statusPembayaran, 'LUNAS'));
  const [programs] = await database
    .select({ total: count() })
    .from(waqfPrograms)
    .where(eq(waqfPrograms.status, 'LIVE'));

  return {
    totalRaised: Number(totals?.raised ?? 0),
    donorCount: Number(totals?.donors ?? 0),
    activePrograms: Number(programs?.total ?? 0),
  };
}

const publicStats = publicProcedure.handler(async ({ context }) => {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    cached = { at: now, value: await loadStats(context.db) };
  }
  return { data: cached.value };
});

/** Hook tes: buang cache agregat. */
export function resetPublicStatsCache(): void {
  cached = null;
}

export const stats = { public: publicStats };
