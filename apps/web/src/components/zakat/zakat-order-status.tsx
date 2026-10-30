'use client';

import { paymentMethodLabel } from '@amwal/core/payment/methods';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  Check,
  Download,
  LoaderCircle,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { PendingPayment } from '@/components/payment/pending-payment';
import { Button } from '@/components/ui/button';
import { getZakatOrderStatus } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { ZakatOrderStatusResult } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';

const JENIS_LABEL: Record<string, string> = {
  FITRAH: 'Zakat Fitrah',
  MAAL_PENGHASILAN: 'Zakat Penghasilan',
  EMAS: 'Zakat Emas',
  PERUSAHAAN: 'Zakat Perusahaan / Perdagangan',
  PERTANIAN: 'Zakat Pertanian',
};

export function ZakatOrderStatusView({ orderId }: { orderId?: string }) {
  const resource = useResource(() => getZakatOrderStatus(orderId ?? ''), {
    enabled: Boolean(orderId),
  });

  return (
    <section className="mx-auto w-full max-w-2xl pb-12">
      {!orderId && <Notice message="ID order zakat tidak ditemukan." />}
      {orderId && resource.state.status === 'loading' && (
        <div className="flex justify-center py-20">
          <LoaderCircle
            aria-hidden="true"
            className="size-8 animate-spin text-[#356152]"
          />
        </div>
      )}
      {orderId && resource.state.status === 'error' && (
        <Notice message={resource.state.error} />
      )}
      {orderId && resource.state.status === 'success' && (
        <StatusBody
          onPoll={resource.refresh}
          onReload={resource.reload}
          orderId={orderId}
          result={resource.state.data}
        />
      )}
    </section>
  );
}

function StatusBody({
  result,
  orderId,
  onReload,
  onPoll,
}: {
  result: ZakatOrderStatusResult;
  orderId: string;
  onReload: () => void;
  onPoll: () => void;
}) {
  const paymentStatus = result.transaction?.statusPembayaran;
  if (paymentStatus === 'LUNAS' || result.order.status === 'TERVERIFIKASI') {
    return <Receipt result={result} />;
  }
  if (paymentStatus === 'GAGAL' || paymentStatus === 'KADALUARSA') {
    return (
      <Notice
        icon={<XCircle aria-hidden="true" className="size-8 text-rose-500" />}
        message={
          paymentStatus === 'KADALUARSA'
            ? 'Pembayaran kedaluwarsa. Silakan buat pembayaran zakat baru.'
            : 'Pembayaran gagal. Silakan coba lagi.'
        }
      />
    );
  }
  return (
    <PendingPayment
      onPoll={onPoll}
      onReload={onReload}
      orderId={orderId}
      serverPayment={result.payment}
      summary={`${JENIS_LABEL[result.order.jenisZakat] ?? 'Zakat'} · ${formatRupiah(result.order.nominal ?? 0)}`}
    />
  );
}

function Receipt({ result }: { result: ZakatOrderStatusResult }) {
  const { order, transaction } = result;
  const rows: [string, string][] = [
    ['No. Transaksi', order.id],
    ['Jenis Zakat', JENIS_LABEL[order.jenisZakat] ?? order.jenisZakat],
    ['Nilai Zakat', formatRupiah(order.nominal ?? 0)],
    [
      'Metode Bayar',
      paymentMethodLabel(transaction?.paymentMethod ?? order.metodePembayaran),
    ],
    [
      'Waktu Transaksi',
      new Date(order.createdAt).toLocaleString('id-ID', {
        dateStyle: 'long',
        timeStyle: 'short',
      }),
    ],
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex size-20 items-center justify-center rounded-full bg-[#356152] text-white ring-8 ring-[#e2ece8]/70">
        <Check aria-hidden="true" className="size-10 stroke-[2.5]" />
      </div>
      <span className="mb-3 inline-flex rounded-full bg-[#e2ece8] px-4 py-1.5 font-bold text-[#1d352d] text-xs uppercase tracking-wider">
        ZAKAT TERBAYAR
      </span>
      <h1 className="text-center font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl">
        Ibadah Zakat Sempurna
      </h1>
      <p className="mt-2 max-w-md text-center text-gray-500 text-sm">
        Alhamdulillah, zakat Anda telah kami terima dan akan disalurkan kepada
        mustahik yang berhak.
      </p>

      <dl className="mt-8 w-full divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white p-6 text-sm shadow-sm">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-4 py-3" key={label}>
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right font-semibold text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex w-full flex-col gap-3">
        <Button
          asChild
          className="h-12 w-full bg-[#356152] font-bold text-white hover:bg-[#2b4f43]"
        >
          <Link to="/dashboard">Kembali ke Beranda</Link>
        </Button>
        {transaction?.id && (
          <Button asChild className="w-full" variant="outline">
            <Link
              params={{ transactionId: transaction.id }}
              to="/riwayat/$transactionId"
            >
              <Download aria-hidden="true" className="mr-1.5 size-4" />
              Lihat Riwayat &amp; Sertifikat
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Notice({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div
      className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center"
      role="alert"
    >
      {icon ?? (
        <AlertCircle aria-hidden="true" className="size-8 text-rose-500" />
      )}
      <p className="text-gray-600 text-sm">{message}</p>
      <Button asChild variant="outline">
        <Link to="/zakat/kalkulator">Ke Kalkulator Zakat</Link>
      </Button>
    </div>
  );
}
