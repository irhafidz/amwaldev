'use client';

import {
  PAYMENT_DISPLAY_LABEL,
  type PaymentDisplayStatus,
  paymentDisplayStatus,
  summarizeDonations,
} from '@amwal/core/payment/resume';
import { Link } from '@tanstack/react-router';
import { ArrowRight, FileText, LogIn } from 'lucide-react';
import { useState } from 'react';
import { PaymentCountdown } from '@/components/payment/payment-countdown';
import { Button } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getMyTransactions } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { TransactionListItem } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { formatWibDateTime } from '@/lib/format-wib';

type FilterTab = 'Semua' | 'Menunggu' | 'Berhasil' | 'Gagal';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'Semua', label: 'Semua' },
  { id: 'Menunggu', label: 'Menunggu Pembayaran' },
  { id: 'Berhasil', label: 'Berhasil' },
  { id: 'Gagal', label: 'Gagal' },
];

/** Tab tempat sebuah status muncul; kedaluwarsa dikelompokkan dengan gagal. */
const TAB_OF: Record<PaymentDisplayStatus, FilterTab> = {
  BERHASIL: 'Berhasil',
  MENUNGGU: 'Menunggu',
  KEDALUWARSA: 'Gagal',
  GAGAL: 'Gagal',
};

const BADGE_TONE: Record<PaymentDisplayStatus, string> = {
  BERHASIL: 'bg-[#e2ece8] border border-[#356152]/20 text-[#356152]',
  MENUNGGU: 'bg-amber-50 border border-amber-200 text-amber-800',
  KEDALUWARSA: 'bg-gray-100 border border-gray-200 text-gray-600',
  GAGAL: 'bg-rose-50 border border-rose-200 text-rose-700',
};

function displayStatusOf(item: TransactionListItem, now: number) {
  return paymentDisplayStatus(
    {
      statusPembayaran: item.statusPembayaran,
      orderStatus: item.status,
      paymentExpiresAt: item.paymentExpiresAt,
      createdAt: item.createdAt,
    },
    now
  );
}

export function TransactionCard({
  item,
  status,
}: {
  item: TransactionListItem;
  status: PaymentDisplayStatus;
}) {
  const resumable = status === 'MENUNGGU' && item.canResume === true;
  return (
    <Link
      className="group block w-full cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md sm:p-6"
      params={{ transactionId: item.id }}
      to="/riwayat/$transactionId"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 font-bold text-base text-gray-900 transition-colors group-hover:text-[#356152] sm:text-lg">
            {item.programTitle || item.jenisTransaksi || 'Wakaf Uang'}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-gray-500 text-xs sm:text-sm">
            <span>{formatWibDateTime(item.createdAt)}</span>
            <span aria-hidden="true">•</span>
            <span className="font-mono text-gray-400">
              {item.nomorKwitansi ?? item.orderId ?? item.id}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-gray-100 border-t pt-3 sm:justify-end sm:gap-6 sm:border-0 sm:pt-0">
          <span
            className={`rounded-full px-3 py-1 font-bold text-xs ${BADGE_TONE[status]}`}
            data-testid="transaction-status"
          >
            {PAYMENT_DISPLAY_LABEL[status]}
          </span>
          <div className="text-right">
            <span className="block font-medium text-[11px] text-gray-400">
              Nominal Wakaf
            </span>
            <span className="font-extrabold text-[#356152] text-base sm:text-lg">
              {formatRupiah(item.amount)}
            </span>
          </div>
        </div>
      </div>

      {resumable && item.paymentExpiresAt && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50/70 px-4 py-2.5">
          <PaymentCountdown compact expiresAt={item.paymentExpiresAt} />
          <span className="inline-flex items-center gap-1 font-bold text-[#356152] text-xs">
            Lanjutkan Pembayaran
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </span>
        </div>
      )}
    </Link>
  );
}

function EmptyState({ activeTab }: { activeTab: FilterTab }) {
  return (
    <div className="mt-4 rounded-3xl border border-gray-200 border-dashed bg-white p-12 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f2f6f4] text-[#356152]">
        <FileText aria-hidden="true" className="size-7" />
      </div>
      <h3 className="mt-4 font-bold text-base text-gray-900">
        Belum Ada Riwayat Transaksi
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-gray-500 text-xs sm:text-sm">
        {activeTab === 'Semua'
          ? 'Anda belum memiliki transaksi donasi atau wakaf. Salurkan wakaf terbaik Anda hari ini.'
          : `Tidak ada transaksi dengan status "${activeTab}".`}
      </p>
      <Link
        className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#356152] px-6 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#2b4f43]"
        to="/wakaf"
      >
        Jelajahi Program Wakaf
      </Link>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <output aria-busy="true" className="w-full space-y-4">
      {[0, 1, 2, 3].map((placeholder) => (
        <div
          className="flex w-full flex-col justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6"
          key={placeholder}
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4 max-w-md" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex items-center justify-between gap-4 border-gray-100 border-t pt-3 sm:justify-end sm:border-0 sm:pt-0">
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="ml-auto h-3 w-16" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Memuat riwayat transaksi Anda…</span>
    </output>
  );
}

function LoginPrompt() {
  return (
    <section className="mx-auto max-w-md px-5 pt-16 pb-24 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f2f6f4] text-[#356152]">
        <LogIn aria-hidden="true" className="size-6" />
      </div>
      <h1 className="mt-4 font-bold text-gray-900 text-lg">
        Masuk Untuk Melihat Riwayat
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-gray-500 text-xs leading-relaxed">
        Riwayat menampilkan amanah transaksi milik akun Anda. Data pembayaran
        terlindungi secara aman.
      </p>
      <Link
        className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#356152] px-6 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#2b4f43]"
        search={(previous) => ({ ...previous, redirect: '/riwayat' })}
        to="/auth/login"
      >
        Masuk Sekarang
      </Link>
    </section>
  );
}

export function TransactionHistory({ user }: { user: SessionUser | null }) {
  const [activeTab, setActiveTab] = useState<FilterTab>('Semua');
  const resource = useResource(getMyTransactions, { enabled: Boolean(user) });

  // Satu "sekarang" per render: badge, filter, dan ringkasan selalu sepakat.
  const now = Date.now();
  const items = resource.state.status === 'success' ? resource.state.data : [];
  const withStatus = items.map((item) => ({
    item,
    status: displayStatusOf(item, now),
  }));
  const filteredTransactions =
    activeTab === 'Semua'
      ? withStatus
      : withStatus.filter((entry) => TAB_OF[entry.status] === activeTab);
  const summary = summarizeDonations(
    items.map((item) => ({
      statusPembayaran: item.statusPembayaran,
      orderStatus: item.status,
      paymentExpiresAt: item.paymentExpiresAt,
      createdAt: item.createdAt,
      amount: item.amount,
    })),
    now
  );

  if (!user) {
    return <LoginPrompt />;
  }

  return (
    <div className="w-full min-w-0 flex-1">
      {/* Header Section (LEFT-ALIGNED) */}
      <div className="text-left">
        <h1 className="text-left font-bold text-2xl text-gray-900 tracking-tight sm:text-3xl">
          Riwayat Wakaf
        </h1>
        <p className="mt-1 text-left text-gray-500 text-sm">
          Daftar seluruh amanah donasi, zakat, dan wakaf yang telah Anda
          salurkan.
        </p>
      </div>

      {resource.state.status === 'success' && items.length > 0 && (
        <p className="mt-4 text-gray-600 text-sm" data-testid="history-summary">
          Total donasi berhasil{' '}
          <strong className="text-[#356152]">
            {formatRupiah(summary.totalBerhasil)}
          </strong>{' '}
          ({summary.berhasil} transaksi)
          {summary.menunggu > 0 &&
            ` · ${summary.menunggu} menunggu pembayaran (tidak dihitung)`}
        </p>
      )}

      {/* Filter status transaksi */}
      <SegmentedTabs
        className="my-5"
        label="Filter status transaksi"
        onChange={setActiveTab}
        tabs={FILTER_TABS}
        value={activeTab}
      />

      {/* Main Content List (FULL-WIDTH HORIZONTAL CARDS) */}
      <main className="w-full space-y-5">
        {resource.state.status === 'loading' && <HistorySkeleton />}

        {resource.state.status === 'error' && (
          <div
            className="flex flex-col items-center rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center"
            role="alert"
          >
            <p className="font-bold text-gray-900 text-sm">
              Riwayat Transaksi Tidak Dapat Dimuat
            </p>
            <p className="mt-1 text-gray-500 text-xs">{resource.state.error}</p>
            <Button
              className="mt-4"
              onClick={resource.reload}
              size="sm"
              type="button"
              variant="outline"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {resource.state.status === 'success' &&
          filteredTransactions.length === 0 && (
            <EmptyState activeTab={activeTab} />
          )}

        {resource.state.status === 'success' &&
          filteredTransactions.map(({ item, status }) => (
            <TransactionCard item={item} key={item.id} status={status} />
          ))}
      </main>
    </div>
  );
}
