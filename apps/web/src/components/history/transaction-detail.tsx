'use client';

import { paymentMethodLabel } from '@amwal/core/payment/methods';
import {
  type PaymentDisplayStatus,
  paymentDisplayStatus,
} from '@amwal/core/payment/resume';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  LoaderCircle,
  Lock,
  MessageCircle,
  Printer,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PaymentCountdown } from '@/components/payment/payment-countdown';
import { PaymentInstructionsPanel } from '@/components/payment/payment-instructions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCertificate, getTransaction } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { TransactionDetail } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { formatWibDateTime } from '@/lib/format-wib';
import { saveBlobAs } from '@/lib/save-blob';

interface TransactionDetailProps {
  transactionId: string;
  user: SessionUser | null;
}

function resolveStatusContent(status: PaymentDisplayStatus) {
  const settled = status === 'BERHASIL';
  const failed = status === 'GAGAL';

  if (settled) {
    return {
      badgeText: 'Berhasil',
      badgeClass: 'bg-[#e2ece8] text-[#356152] border border-[#356152]/20',
      heading: 'Wakaf Berhasil Disalurkan',
      subtitle:
        'Dana telah diterima oleh Nazhir resmi dan tercatat dalam sistem amanah.',
      Icon: CheckCircle2,
      iconClass: 'text-[#356152]',
      settled: true,
      failed: false,
    };
  }

  if (failed) {
    return {
      badgeText: 'Gagal',
      badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
      heading: 'Pembayaran Belum Berhasil',
      subtitle:
        'Transaksi tidak dapat diselesaikan atau telah melewati batas waktu.',
      Icon: XCircle,
      iconClass: 'text-rose-600',
      settled: false,
      failed: true,
    };
  }

  if (status === 'KEDALUWARSA') {
    return {
      badgeText: 'Kedaluwarsa',
      badgeClass: 'bg-gray-100 text-gray-600 border border-gray-200',
      heading: 'Batas Waktu Pembayaran Habis',
      subtitle:
        'Pembayaran ini tidak bisa dilanjutkan. Silakan buat donasi baru bila ingin menyalurkan kembali.',
      Icon: Clock,
      iconClass: 'text-gray-500',
      settled: false,
      failed: true,
    };
  }

  return {
    badgeText: 'Menunggu Pembayaran',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
    heading: 'Menunggu Pembayaran',
    subtitle:
      'Silakan selesaikan pembayaran sesuai instruksi channel yang dipilih.',
    Icon: Clock,
    iconClass: 'text-amber-600',
    settled: false,
    failed: false,
  };
}

function BreadcrumbHeader() {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-xs">
        <li>
          <Link
            className="flex items-center gap-1 font-semibold text-[#356152] hover:underline"
            to="/riwayat"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            <span>Riwayat</span>
          </Link>
        </li>
        <li aria-hidden="true" className="text-gray-300">
          /
        </li>
        <li aria-current="page" className="truncate font-medium text-gray-500">
          Detail Transaksi
        </li>
      </ol>
    </nav>
  );
}

function StatusHeader({
  statusMeta,
}: {
  statusMeta: ReturnType<typeof resolveStatusContent>;
}) {
  const { Icon } = statusMeta;
  return (
    <div className="space-y-2 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-xs shadow-2xs">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-xs ${statusMeta.badgeClass}`}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          <span>{statusMeta.badgeText}</span>
        </span>
      </div>

      <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl">
        {statusMeta.heading}
      </h1>

      <p className="mx-auto max-w-md text-gray-500 text-xs leading-relaxed sm:text-sm">
        {statusMeta.subtitle}
      </p>
    </div>
  );
}

function NominalHighlightBox({
  amount,
  createdAt,
  settled,
}: {
  amount: string;
  createdAt: string;
  settled: boolean;
}) {
  return (
    <div className="rounded-3xl border border-[#e2ece8] bg-[#f2f6f4] p-6 text-center shadow-xs">
      <span className="font-extrabold text-[#356152] text-[11px] uppercase tracking-widest">
        Nominal Wakaf
      </span>

      <div className="mt-2 font-extrabold text-3xl text-[#356152] tracking-tight sm:text-4xl">
        {formatRupiah(amount)}
      </div>

      <p className="mt-3 text-[11px] text-gray-500">
        {settled ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
            <span>+100 XP Poin Berkah Amal Jariyah</span>
            <span>•</span>
            <span>{formatWibDateTime(createdAt)}</span>
          </span>
        ) : (
          <span>Waktu dibuat: {formatWibDateTime(createdAt)}</span>
        )}
      </p>
    </div>
  );
}

/**
 * QA-02 / D1: instruksi bayar yang tersimpan, dengan hitung mundur, agar
 * donatur bisa melanjutkan pembayaran dari Riwayat (juga setelah menutup tab
 * checkout). Disembunyikan sendiri begitu waktunya habis.
 */
export function ResumePaymentCard({ data }: { data: TransactionDetail }) {
  const [expired, setExpired] = useState(false);
  const resume = data.resume;
  if (!resume || expired) {
    return null;
  }
  return (
    <section
      aria-labelledby="resume-payment-title"
      className="space-y-4 rounded-3xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6"
      data-testid="resume-payment"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="font-bold text-base text-gray-900"
          id="resume-payment-title"
        >
          Lanjutkan Pembayaran
        </h2>
        <PaymentCountdown
          expiresAt={resume.expiresAt}
          onExpire={() => setExpired(true)}
        />
      </div>
      <PaymentInstructionsPanel
        hostedUrl={resume.url ?? undefined}
        instructions={resume.instructions ?? undefined}
        orderId={data.orderId ?? data.id}
      />
    </section>
  );
}

function MetadataTable({ data }: { data: TransactionDetail }) {
  const settled =
    data.statusPembayaran === 'LUNAS' || data.status === 'TERVERIFIKASI';

  const rows = [
    {
      label: 'PROGRAM WAKAF',
      value: data.programTitle || 'Wakaf Uang Produktif',
      highlight: true,
    },
    {
      label: 'NAZHIR',
      value: data.nazhirName || 'Badan Wakaf Indonesia / Nazhir Mitra Resmi',
    },
    {
      label: 'DOKUMEN',
      value: settled
        ? 'Sertifikat & Kuitansi tersedia'
        : 'Menunggu penyelesaian',
    },
    {
      label: 'WAKTU TRANSAKSI',
      value: formatWibDateTime(data.createdAt),
    },
    {
      label: 'NOMOR TRANSAKSI',
      value: data.nomorKwitansi ?? data.orderId ?? data.id,
      mono: true,
    },
    {
      label: 'METODE PEMBAYARAN',
      value: paymentMethodLabel(data.paymentMethod),
    },
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xs">
      <div className="border-gray-100 border-b bg-gray-50/60 px-5 py-3">
        <h3 className="font-bold text-gray-700 text-xs uppercase tracking-wider">
          Rincian Transaksi
        </h3>
      </div>

      <dl className="divide-y divide-gray-100 text-xs sm:text-sm">
        {rows.map((row) => (
          <div
            className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            key={row.label}
          >
            <dt className="font-medium text-[11px] text-gray-400 uppercase tracking-wide">
              {row.label}
            </dt>
            <dd
              className={`font-semibold text-gray-900 sm:text-right ${
                row.mono ? 'font-mono' : ''
              } ${row.highlight ? 'text-gray-900' : ''}`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReceiptModal({
  data,
  isOpen,
  onClose,
}: {
  data: TransactionDetail;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  // Dirender ke <body> supaya saat dicetak (`@media print` di globals.css)
  // seluruh aplikasi lainnya — navbar, widget chat, toast — cukup disembunyikan.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      id="receipt-print-root"
    >
      <div
        aria-labelledby="receipt-modal-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="hidden items-center justify-between border-[#356152] border-b-2 pb-3 print:flex">
          {/** biome-ignore lint/performance/noImgElement: kop cetak statis */}
          <img
            alt="Amwal"
            className="h-10 w-auto"
            src="/assets/images/amwal-logo-color-h.png"
          />
          <p className="font-bold text-[#356152] text-sm uppercase tracking-widest">
            Kuitansi Resmi
          </p>
        </div>

        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <FileCheck2 aria-hidden="true" className="size-5 text-[#356152]" />
            <h2 className="font-bold text-gray-900" id="receipt-modal-title">
              Kuitansi Resmi Wakaf
            </h2>
          </div>
          <button
            aria-label="Tutup kuitansi"
            className="cursor-pointer rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 print:hidden"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="space-y-1 rounded-2xl border border-gray-100 bg-[#f2f6f4]/60 p-5 text-center">
          <p className="font-bold text-[11px] text-gray-400 uppercase tracking-widest">
            Nomor Kuitansi
          </p>
          <p className="font-bold font-mono text-[#356152] text-sm">
            {data.nomorKwitansi ?? data.orderId ?? data.id}
          </p>
          <div className="pt-2">
            <span className="font-extrabold text-2xl text-gray-900">
              {formatRupiah(data.amount)}
            </span>
          </div>
          <p className="text-gray-500 text-xs">
            Status: <span className="font-bold text-[#356152]">LUNAS</span>
          </p>
        </div>

        <div className="space-y-2 text-gray-600 text-xs">
          <div className="flex justify-between border-b py-2">
            <span>Program</span>
            <span className="text-right font-semibold text-gray-900">
              {data.programTitle || 'Wakaf Uang Produktif'}
            </span>
          </div>
          <div className="flex justify-between border-b py-2">
            <span>Nazhir Pengelola</span>
            <span className="font-semibold text-gray-900">
              {data.nazhirName || 'Badan Wakaf Indonesia'}
            </span>
          </div>
          <div className="flex justify-between border-b py-2">
            <span>Wakif / Donatur</span>
            <span className="font-semibold text-gray-900">
              {data.donorName || 'Hamba Allah'}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span>Waktu Transaksi</span>
            <span className="font-semibold text-gray-900">
              {formatWibDateTime(data.createdAt)}
            </span>
          </div>
        </div>

        <p className="hidden border-t pt-3 text-center text-[11px] text-gray-500 print:block">
          Dokumen ini diterbitkan otomatis oleh Platform Amwal · amwal.id ·
          dicetak {formatWibDateTime(new Date().toISOString())}
        </p>

        <div className="flex gap-2 pt-2 print:hidden">
          <button
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] py-2.5 font-bold text-white text-xs hover:bg-[#2b4f43]"
            onClick={handlePrint}
            type="button"
          >
            <Printer aria-hidden="true" className="size-4" />
            <span>Cetak Kuitansi</span>
          </button>
          <button
            className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2.5 font-semibold text-gray-600 text-xs hover:bg-gray-50"
            onClick={onClose}
            type="button"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Jenis transaksi yang punya sertifikat PDF (lihat `JENIS_COPY` di generator). */
const CERTIFICATE_JENIS = new Set(['WAKAF', 'ZAKAT', 'INFAQ', 'QURBAN']);

export function hasCertificate(
  data: Pick<TransactionDetail, 'jenisTransaksi'>,
  settled: boolean
): boolean {
  return (
    settled && CERTIFICATE_JENIS.has((data.jenisTransaksi ?? '').toUpperCase())
  );
}

function certificateFileName(data: TransactionDetail): string {
  const jenis = (data.jenisTransaksi ?? 'wakaf').toLowerCase();
  return `sertifikat-${jenis}-${data.id}.pdf`;
}

export function ActionControls({
  data,
  settled,
}: {
  data: TransactionDetail;
  settled: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadCertificate(data.id);
      saveBlobAs(blob, certificateFileName(data));
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : 'Sertifikat wakaf digital belum siap diunduh.'
      );
    } finally {
      setDownloading(false);
    }
  };

  // Tombol hanya ada bila dokumennya benar-benar siap: transaksi sudah
  // berhasil dan jenisnya punya sertifikat. Bukan tombol mati yang bikin bingung.
  const canDownload = hasCertificate(data, settled);

  return (
    <div className="space-y-3">
      <div
        className={`grid grid-cols-1 gap-3 ${canDownload ? 'sm:grid-cols-2' : ''}`}
      >
        {canDownload && (
          <button
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-6 py-3 font-semibold text-sm text-white shadow-xs transition hover:bg-[#2b4f43] disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={downloading}
            onClick={handleDownload}
            type="button"
          >
            {downloading ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            <span>{downloading ? 'Menyiapkan PDF...' : 'Unduh PDF'}</span>
          </button>
        )}

        <button
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-700 text-sm shadow-xs transition hover:bg-gray-50"
          onClick={() => setIsReceiptOpen(true)}
          type="button"
        >
          <FileText aria-hidden="true" className="size-4 text-gray-500" />
          <span>Lihat Kuitansi</span>
        </button>
      </div>

      {downloadError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-rose-700 text-xs">
          {downloadError}
        </p>
      )}

      <ReceiptModal
        data={data}
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
      />
    </div>
  );
}

function HelpFooter() {
  const csWhatsappUrl =
    'https://wa.me/628112345678?text=Assalamu%27alaikum%20Amwal%20Support%2C%20saya%20butuh%20bantuan%20terkait%20transaksi%20wakaf.';

  return (
    <div className="pt-2 text-center">
      <p className="text-gray-500 text-xs">
        Punya kendala atau pertanyaan?{' '}
        <a
          className="inline-flex items-center gap-1 font-bold text-[#356152] hover:underline"
          href={csWhatsappUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <MessageCircle aria-hidden="true" className="size-3.5" />
          <span>Hubungi CS</span>
        </a>
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-xs">
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export function TransactionDetailView({
  transactionId,
  user,
}: TransactionDetailProps) {
  const resource = useResource(() => getTransaction(transactionId), {
    enabled: Boolean(transactionId && user),
  });

  if (!user) {
    return (
      <div className="w-full min-w-0 flex-1 space-y-5">
        <BreadcrumbHeader />
        <div className="mx-auto max-w-md">
          <div className="mt-4 flex flex-col items-center rounded-3xl border border-amber-200 bg-amber-50/60 p-6 text-center">
            <Lock aria-hidden="true" className="mb-2 size-8 text-amber-600" />
            <h2 className="font-bold text-base text-gray-900">
              Detail Transaksi Dilindungi
            </h2>
            <p className="mt-1 text-gray-600 text-xs">
              Silakan masuk untuk melihat data transaksi akun Anda.
            </p>
            <Link
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#356152] px-5 py-2.5 font-bold text-white text-xs hover:bg-[#2b4f43]"
              search={(previous) => ({
                ...previous,
                redirect: `/riwayat/${transactionId}`,
              })}
              to="/auth/login"
            >
              Masuk Sekarang
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 flex-1 space-y-5">
      <BreadcrumbHeader />

      <div className="mx-auto max-w-2xl space-y-5">
        {resource.state.status === 'loading' && <DetailSkeleton />}

        {resource.state.status === 'error' && (
          <div
            aria-live="polite"
            className="flex flex-col items-center rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center"
            role="alert"
          >
            <AlertCircle
              aria-hidden="true"
              className="mb-2 size-8 text-rose-500"
            />
            <h2 className="font-bold text-gray-900 text-sm">
              Transaksi Tidak Dapat Ditampilkan
            </h2>
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

        {resource.state.status === 'success' && (
          <div className="space-y-6">
            <StatusHeader
              statusMeta={resolveStatusContent(
                paymentDisplayStatus(
                  {
                    statusPembayaran: resource.state.data.statusPembayaran,
                    orderStatus: resource.state.data.status,
                    paymentExpiresAt: resource.state.data.paymentExpiresAt,
                    createdAt: resource.state.data.createdAt,
                  },
                  Date.now()
                )
              )}
            />

            <ResumePaymentCard data={resource.state.data} />

            <NominalHighlightBox
              amount={resource.state.data.amount}
              createdAt={resource.state.data.createdAt}
              settled={
                resource.state.data.statusPembayaran === 'LUNAS' ||
                resource.state.data.status === 'TERVERIFIKASI'
              }
            />

            <MetadataTable data={resource.state.data} />

            <ActionControls
              data={resource.state.data}
              settled={
                resource.state.data.statusPembayaran === 'LUNAS' ||
                resource.state.data.status === 'TERVERIFIKASI'
              }
            />

            <HelpFooter />
          </div>
        )}
      </div>
    </div>
  );
}
