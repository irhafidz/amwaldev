'use client';

import { paymentMethodLabel } from '@amwal/core/payment/methods';
import type { ResumablePayment } from '@amwal/core/payment/resume';
import type { PaymentInstructions } from '@amwal/core/payment/types';
import { Clock, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePaymentPolling } from '@/lib/amwal-api/use-payment-polling';
import { OrderLinkCard } from './order-link-card';
import { PaymentCountdown } from './payment-countdown';
import { PaymentInstructionsPanel } from './payment-instructions';

interface StoredOrder {
  payment?: {
    expiredAt?: string;
    instructions?: PaymentInstructions;
    paymentType?: string;
    redirectUrl?: string;
  };
}

function fromServer(
  server: ResumablePayment | null | undefined
): StoredOrder['payment'] | undefined {
  if (!server) {
    return;
  }
  return {
    expiredAt: server.expiresAt,
    instructions: server.instructions ?? undefined,
    redirectUrl: server.url ?? undefined,
  };
}

function readStored(orderId: string): StoredOrder | null {
  try {
    const raw = sessionStorage.getItem(`amwal_order_${orderId}`);
    return raw ? (JSON.parse(raw) as StoredOrder) : null;
  } catch {
    return null;
  }
}

/**
 * "Menunggu pembayaran" panel shared by the zakat, qurban and infaq status
 * pages. Pembayaran QRIS berlangsung di halaman Mayar; tautannya dicache
 * checkout di sessionStorage, jadi donatur yang kembali sebelum membayar bisa
 * melanjutkan. Selama menunggu, status dicek otomatis tiap beberapa detik —
 * server menanyakannya langsung ke Mayar, sehingga halaman ini berubah
 * menjadi lunas begitu pembayaran masuk, tanpa harus menunggu webhook.
 *
 * Bila sessionStorage kosong (tab lain, perangkat lain, atau dibuka dari
 * tautan status), instruksi diambil dari `serverPayment` — instruksi yang
 * disimpan server saat pembayaran dibuat (QA-02/QA-03).
 */
export function PendingPayment({
  orderId,
  summary,
  onReload,
  onPoll,
  serverPayment,
}: {
  orderId: string;
  summary: string;
  onReload: () => void;
  /** Reload senyap yang dipanggil berkala selama pesanan menunggu. */
  onPoll: () => void;
  serverPayment?: ResumablePayment | null;
}) {
  const [stored, setStored] = useState<StoredOrder | null>(null);
  useEffect(() => setStored(readStored(orderId)), [orderId]);
  const payment = stored?.payment ?? fromServer(serverPayment);
  const expiresAt = serverPayment?.expiresAt ?? payment?.expiredAt;
  usePaymentPolling(onPoll, true);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-amber-900">
        <Clock aria-hidden="true" className="size-5 shrink-0" />
        <div className="text-sm">
          <p className="font-bold">
            Menunggu pembayaran
            {payment?.paymentType
              ? ` · ${paymentMethodLabel(payment.paymentType)}`
              : ''}
          </p>
          <p className="text-xs opacity-90">{summary}</p>
          {expiresAt && (
            <div className="mt-1">
              <PaymentCountdown compact expiresAt={expiresAt} />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
        <PaymentInstructionsPanel
          hostedUrl={payment?.redirectUrl}
          instructions={payment?.instructions}
          orderId={orderId}
        />
      </div>

      <OrderLinkCard orderId={orderId} />

      <Button
        className="h-12 w-full gap-2"
        onClick={onReload}
        type="button"
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Cek Status Pembayaran
      </Button>
    </div>
  );
}
