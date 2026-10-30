'use client';

import { paymentMethodLabel } from '@amwal/core/payment/methods';
import type { PaymentInstructions } from '@amwal/core/payment/types';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Landmark,
  LoaderCircle,
  QrCode,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { OrderLinkCard } from '@/components/payment/order-link-card';
import { PaymentInstructionsPanel } from '@/components/payment/payment-instructions';
import { Button } from '@/components/ui/button';
import { getWaqfOrderStatus } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { WaqfOrderStatusResult } from '@/lib/amwal-api/types';
import { usePaymentPolling } from '@/lib/amwal-api/use-payment-polling';
import { useResource } from '@/lib/amwal-api/use-resource';

interface WaqfOrderStatusProps {
  orderId?: string;
}

interface StoredOrderData {
  orderId: string;
  amount?: number;
  payment?: {
    paymentType?: string;
    bank?: string;
    expiredAt?: string;
    instructions?: PaymentInstructions;
    redirectUrl?: string;
  };
  programTitle?: string;
  programCategory?: string;
  donorName?: string;
  doaMessage?: string;
}

export function WaqfOrderStatusView({ orderId }: WaqfOrderStatusProps) {
  const resource = useResource(() => getWaqfOrderStatus(orderId ?? ''), {
    enabled: Boolean(orderId),
  });

  const [storedData, setStoredData] = useState<StoredOrderData | null>(null);

  useEffect(() => {
    if (!orderId || typeof window === 'undefined') {
      return;
    }
    try {
      const raw = sessionStorage.getItem(`amwal_order_${orderId}`);
      if (raw) {
        setStoredData(JSON.parse(raw));
      }
    } catch {
      // Ignore sessionStorage parsing error
    }
  }, [orderId]);

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <Button asChild size="sm" type="button" variant="ghost">
          <Link to="/wakaf">
            <ArrowLeft aria-hidden="true" className="mr-1.5 size-4" />
            Kembali ke Katalog
          </Link>
        </Button>
        <span className="font-semibold text-caption-mini text-text-secondary">
          No. Transaksi: {orderId || '-'}
        </span>
      </div>

      {!orderId && <MissingOrderId />}

      {orderId && resource.state.status === 'loading' && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-gray-100 bg-white py-20 shadow-xs">
          <LoaderCircle
            aria-hidden="true"
            className="mb-3 size-9 animate-spin text-[#356152]"
          />
          <p className="font-semibold text-text-primary text-title-s">
            Memeriksa status transaksi...
          </p>
          <p className="mt-1 text-label-caption text-text-secondary">
            Mohon tunggu sebentar, sistem sedang memverifikasi pembayaran Anda.
          </p>
        </div>
      )}

      {orderId && resource.state.status === 'error' && (
        <div
          aria-live="polite"
          className="flex flex-col items-center rounded-3xl border border-rose-200 bg-rose-50/50 p-8 text-center"
          role="alert"
        >
          <AlertCircle
            aria-hidden="true"
            className="mb-3 size-10 text-rose-600"
          />
          <p className="font-bold text-text-primary text-title-m">
            Data Transaksi Tidak Ditemukan
          </p>
          <p className="mt-1.5 max-w-md text-label-caption text-text-secondary">
            {resource.state.error ||
              'Nomor transaksi ini tidak terdaftar pada sistem atau telah kedaluwarsa.'}
          </p>
          <Button
            asChild
            className="mt-5 bg-[#356152] text-white hover:bg-[#2b4f43]"
            type="button"
          >
            <Link to="/wakaf">Lihat Program Wakaf Lainnya</Link>
          </Button>
        </div>
      )}

      {orderId && resource.state.status === 'success' && (
        <OrderStatusDetail
          onPoll={resource.refresh}
          onReload={() => resource.reload()}
          result={resource.state.data}
          storedData={storedData}
        />
      )}
    </section>
  );
}

function MissingOrderId() {
  return (
    <div className="rounded-3xl border border-border-subtle border-dashed bg-white p-10 text-center">
      <AlertCircle
        aria-hidden="true"
        className="mx-auto mb-3 size-10 text-gray-300"
      />
      <p className="font-bold text-text-primary text-title-m">
        Nomor Order Tidak Ditemukan
      </p>
      <p className="mt-1 text-label-caption text-text-secondary">
        Tautan status tidak menyertakan parameter orderId yang sah.
      </p>
      <Button
        asChild
        className="mt-5 bg-[#356152] text-white hover:bg-[#2b4f43]"
        type="button"
      >
        <Link to="/wakaf">Kembali ke Katalog Wakaf</Link>
      </Button>
    </div>
  );
}

function getBannerClass(settled: boolean, failed: boolean): string {
  if (settled) {
    return 'bg-[#356152]';
  }
  if (failed) {
    return 'bg-rose-600';
  }
  return 'bg-gradient-to-r from-amber-500 to-amber-600';
}

function getHeroTitle(settled: boolean, failed: boolean): string {
  if (settled) {
    return 'Pembayaran Berhasil!';
  }
  if (failed) {
    return 'Pembayaran Dibatalkan / Gagal';
  }
  return 'Menunggu Pembayaran';
}

function getHeroSubtitle(settled: boolean, failed: boolean): string {
  if (settled) {
    return 'Alhamdulillah, donasi wakaf Anda telah terverifikasi secara sah.';
  }
  if (failed) {
    return 'Transaksi tidak berhasil diproses. Silakan coba kembali.';
  }
  return 'Mohon selesaikan pembayaran sebelum batas waktu berakhir.';
}

function StatusHeroBanner({
  settled,
  failed,
  pending,
  expiredAt,
}: {
  settled: boolean;
  failed: boolean;
  pending: boolean;
  expiredAt: string;
}) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    if (!pending) {
      return;
    }

    const calculateTimeLeft = () => {
      const difference = new Date(expiredAt).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      setTimeLeft({ hours, minutes, seconds, isExpired: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [expiredAt, pending]);

  return (
    <div
      className={`overflow-hidden rounded-3xl p-6 text-white shadow-sm transition-all ${getBannerClass(settled, failed)}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
            {settled && <CheckCircle2 className="size-6 text-white" />}
            {failed && <XCircle className="size-6 text-white" />}
            {pending && <Clock className="size-6 animate-pulse text-white" />}
          </div>
          <div>
            <span className="font-bold text-caption-mini text-white/80 uppercase tracking-wider">
              Status Pembayaran
            </span>
            <h1 className="mt-0.5 font-bold text-xl sm:text-2xl">
              {getHeroTitle(settled, failed)}
            </h1>
            <p className="mt-1 text-sm text-white/90">
              {getHeroSubtitle(settled, failed)}
            </p>
          </div>
        </div>

        {pending && (
          <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-xs">
            <Clock className="size-4.5 text-white/80" />
            <div>
              <span className="block font-medium text-[11px] text-white/80 uppercase tracking-wider">
                Sisa Waktu
              </span>
              <span className="font-bold font-mono text-base tracking-wider sm:text-lg">
                {timeLeft.isExpired
                  ? 'Kedaluwarsa'
                  : `${String(timeLeft.hours).padStart(2, '0')}:${String(
                      timeLeft.minutes
                    ).padStart(2, '0')}:${String(timeLeft.seconds).padStart(
                      2,
                      '0'
                    )}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function _QrisPaymentCard({
  qrCodeUrl,
  orderId,
}: {
  qrCodeUrl: string;
  orderId: string;
}) {
  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `QRIS-Amwal-${orderId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-2">
        <QrCode className="size-5 text-[#356152]" />
        <h2 className="font-bold text-body-large text-text-primary">
          Scan QRIS Pembayaran
        </h2>
      </div>
      <p className="mt-1.5 max-w-sm text-label-caption text-text-secondary">
        Buka aplikasi perbankan (BSI Mobile, Livin, BCA) atau e-wallet (GoPay,
        OVO, ShopeePay, DANA) lalu scan QR code ini.
      </p>

      <div className="mt-4 rounded-3xl border-2 border-gray-100 bg-white p-4 shadow-sm">
        {/** biome-ignore lint/performance/noImgElement: dynamic QR code */}
        <img
          alt="QRIS Pembayaran Wakaf"
          className="size-56 rounded-2xl object-contain sm:size-64"
          src={qrCodeUrl}
        />
      </div>

      <Button
        className="mt-4 gap-2 border-[#356152] text-[#356152] hover:bg-[#f2f6f4]"
        onClick={handleDownloadQr}
        type="button"
        variant="outline"
      >
        <Download className="size-4" />
        Unduh Gambar QR Code
      </Button>
    </div>
  );
}

function PaymentDataBox({
  instructions,
  continueUrl,
  method,
  orderId,
}: {
  instructions?: PaymentInstructions;
  continueUrl?: string;
  method?: string | null;
  orderId: string;
}) {
  return (
    <div>
      {method && (
        <p className="mb-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
          Metode: {paymentMethodLabel(method)}
        </p>
      )}
      <PaymentInstructionsPanel
        hostedUrl={continueUrl}
        instructions={instructions}
        orderId={orderId}
      />
    </div>
  );
}

function PaymentSummaryCard({
  result,
  doaMessage,
}: {
  result: WaqfOrderStatusResult;
  doaMessage?: string;
}) {
  const { order, program } = result;

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs">
      <h2 className="font-bold text-body-large text-text-primary">
        Ringkasan Donasi Wakaf
      </h2>

      {program && (
        <div className="mt-4 flex items-start gap-3.5 rounded-2xl bg-gray-50/80 p-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#356152] to-[#1d352d] text-white">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block font-bold text-[#356152] text-caption-mini uppercase tracking-wider">
              {program.kategori || 'Wakaf Produktif'}
            </span>
            <p className="truncate font-semibold text-body-medium text-text-primary">
              {program.judul}
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 divide-y divide-gray-100 text-sm">
        <div className="flex justify-between py-2.5">
          <span className="text-text-secondary">Nomor Order</span>
          <span className="font-mono font-semibold text-text-primary">
            {order.id}
          </span>
        </div>
        <div className="flex justify-between py-2.5">
          <span className="text-text-secondary">Nama Wakif</span>
          <span className="font-semibold text-text-primary">
            {order.namaWakif || 'Hamba Allah'}
          </span>
        </div>
        <div className="flex justify-between py-2.5">
          <span className="text-text-secondary">Nominal Wakaf</span>
          <span className="font-semibold text-text-primary">
            {formatRupiah(order.nominal)}
          </span>
        </div>
        <div className="flex justify-between py-2.5">
          <span className="text-text-secondary">Biaya Administrasi</span>
          <span className="font-semibold text-emerald-600">Gratis (Rp 0)</span>
        </div>
        <div className="flex items-center justify-between py-3.5">
          <span className="font-bold text-body-medium text-text-primary">
            Total Pembayaran
          </span>
          <span className="font-bold font-mono text-[#356152] text-xl">
            {formatRupiah(order.nominal)}
          </span>
        </div>
      </div>

      {doaMessage && (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-[#f2f6f4] p-3.5">
          <span className="block font-semibold text-[#356152] text-caption-mini uppercase tracking-wider">
            Doa &amp; Harapan Wakif:
          </span>
          <p className="mt-1 text-body-small text-text-primary italic">
            "{doaMessage}"
          </p>
        </div>
      )}
    </div>
  );
}

function WakafSuccessReceipt({
  result,
  storedData,
}: {
  result: WaqfOrderStatusResult;
  storedData: StoredOrderData | null;
}) {
  const { order, transaction, program } = result;
  const methodDisplay = paymentMethodLabel(
    transaction?.paymentMethod ?? order.metodePembayaran
  );

  return (
    <div className="flex flex-col items-center">
      {/* Green checkmark icon */}
      <div className="mb-4 flex size-20 items-center justify-center rounded-full bg-[#f2f6f4] text-[#356152] ring-8 ring-[#e2ece8]/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900/30">
        <Check aria-hidden="true" className="size-10 stroke-[2.5]" />
      </div>

      {/* Badge: WAKAF TERSALURKAN */}
      <div className="mb-3">
        <span className="inline-flex items-center rounded-full bg-[#e2ece8] px-4 py-1.5 font-bold text-[#1d352d] text-xs uppercase tracking-wider dark:bg-emerald-950 dark:text-emerald-300">
          WAKAF TERSALURKAN
        </span>
      </div>

      {/* Title & Subtitle */}
      <h1 className="text-center font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
        Amal Jariyah Sempurna
      </h1>
      <p className="mt-2 max-w-md text-center text-gray-500 text-xs sm:text-sm dark:text-slate-400">
        Alhamdulillah, amanah wakaf uang Anda telah berhasil kami terima dan
        siap dialokasikan untuk kemaslahatan umat.
      </p>

      {/* Receipt Card Details */}
      <div className="mt-8 w-full overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-start gap-3.5 rounded-2xl bg-gray-50 p-4 dark:bg-slate-800/60">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#356152] text-white">
            <Landmark aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block font-bold text-[#356152] text-[10px] uppercase tracking-wider dark:text-emerald-400">
              {program?.kategori || 'Wakaf Uang'}
            </span>
            <p className="line-clamp-2 font-bold text-gray-900 text-sm dark:text-white">
              {program?.judul || storedData?.programTitle || 'Program Wakaf'}
            </p>
          </div>
        </div>

        <div className="divide-y divide-gray-100 text-xs sm:text-sm dark:divide-slate-800">
          <div className="flex items-center justify-between py-3">
            <span className="text-gray-500 dark:text-slate-400">
              No. Transaksi
            </span>
            <span className="font-bold font-mono text-gray-900 dark:text-white">
              {order.id}
            </span>
          </div>

          <div className="flex items-center justify-between py-3">
            <span className="text-gray-500 dark:text-slate-400">
              Jenis Alokasi
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {program?.kategori
                ? `Wakaf ${program.kategori}`
                : 'Wakaf Uang Produktif'}
            </span>
          </div>

          <div className="flex items-center justify-between py-3">
            <span className="text-gray-500 dark:text-slate-400">
              Kategori Program
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {program?.kategori || 'Wakaf Produktif'}
            </span>
          </div>

          <div className="flex items-center justify-between py-3">
            <span className="text-gray-500 dark:text-slate-400">
              Metode Bayar
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {methodDisplay}
            </span>
          </div>

          <div className="flex items-center justify-between py-3.5">
            <span className="font-bold text-gray-900 text-sm sm:text-base dark:text-white">
              Total Terbayar
            </span>
            <span className="font-extrabold text-[#356152] text-lg sm:text-xl dark:text-emerald-400">
              {formatRupiah(order.nominal)}
            </span>
          </div>
        </div>

        {storedData?.doaMessage && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-[#f2f6f4] p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <span className="block font-bold text-[#356152] text-[11px] uppercase tracking-wider dark:text-emerald-400">
              Doa &amp; Harapan Wakif:
            </span>
            <p className="mt-1 text-gray-700 text-xs italic dark:text-slate-300">
              "{storedData.doaMessage}"
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex w-full flex-col gap-3">
        <Button
          asChild
          className="h-12 w-full bg-[#356152] font-bold text-base text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.99]"
          size="lg"
          type="button"
        >
          <Link to="/dashboard">Kembali ke Beranda</Link>
        </Button>

        {transaction?.id && (
          <Button
            asChild
            className="w-full border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            size="lg"
            type="button"
            variant="outline"
          >
            <Link
              params={{ transactionId: transaction.id }}
              to="/riwayat/$transactionId"
            >
              <Download className="mr-1.5 size-4" />
              Lihat Riwayat &amp; Sertifikat
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function OrderStatusDetail({
  result,
  storedData,
  onReload,
  onPoll,
}: {
  result: WaqfOrderStatusResult;
  storedData: StoredOrderData | null;
  onReload: () => void;
  onPoll: () => void;
}) {
  const { order, transaction } = result;
  const orderStatus = order.status;
  const paymentStatus = transaction?.statusPembayaran ?? null;
  const settled = orderStatus === 'TERVERIFIKASI' || paymentStatus === 'LUNAS';
  const failed = orderStatus === 'DITOLAK';
  const pending = !(settled || failed);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // sessionStorage checkout dulu; bila kosong (tab/perangkat lain, tautan
  // status), pakai instruksi yang disimpan server (QA-02/QA-03).
  const instructions =
    storedData?.payment?.instructions ??
    result.payment?.instructions ??
    undefined;
  const continueUrl =
    storedData?.payment?.redirectUrl ?? result.payment?.url ?? undefined;

  // Pesanan menunggu: tanya Mayar otomatis tiap beberapa detik (lihat
  // `reconcileOrderNow`), jadi halaman berubah lunas tanpa menunggu webhook.
  usePaymentPolling(onPoll, pending);
  const expiredAt =
    storedData?.payment?.expiredAt ??
    result.payment?.expiresAt ??
    new Date(
      new Date(order.createdAt).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onReload();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  if (settled) {
    return <WakafSuccessReceipt result={result} storedData={storedData} />;
  }

  return (
    <div className="space-y-6">
      <StatusHeroBanner
        expiredAt={expiredAt}
        failed={failed}
        pending={pending}
        settled={settled}
      />

      {pending && (
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-xs">
          <PaymentDataBox
            continueUrl={continueUrl}
            instructions={instructions}
            method={
              transaction?.paymentMethod ?? storedData?.payment?.paymentType
            }
            orderId={order.id}
          />
        </div>
      )}

      {pending && <OrderLinkCard orderId={order.id} />}

      <PaymentSummaryCard doaMessage={storedData?.doaMessage} result={result} />

      <div className="flex flex-col gap-3 sm:flex-row">
        {pending && (
          <Button
            className="flex-1 gap-2 bg-[#356152] text-white shadow-xs hover:bg-[#2b4f43]"
            disabled={isRefreshing}
            onClick={handleRefresh}
            size="lg"
            type="button"
          >
            <RefreshCw
              className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            {isRefreshing ? 'Memperbarui...' : 'Cek Status Pembayaran'}
          </Button>
        )}

        <Button
          asChild
          className="flex-1 border-gray-200 text-text-primary hover:bg-gray-50"
          size="lg"
          type="button"
          variant="outline"
        >
          <Link to="/wakaf">Kembali ke Katalog Wakaf</Link>
        </Button>
      </div>
    </div>
  );
}
