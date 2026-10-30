'use client';

import { paymentDeadline, remainingParts } from '@amwal/core/payment/resume';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Hitung mundur batas waktu pembayaran (D1). Dirender di server dengan sisa
 * waktu saat itu, lalu diperbarui tiap detik di klien; `onExpire` dipanggil
 * sekali ketika waktunya habis agar halaman bisa menyembunyikan tombol bayar.
 */
export function PaymentCountdown({
  expiresAt,
  onExpire,
  compact = false,
}: {
  expiresAt: string;
  onExpire?: () => void;
  compact?: boolean;
}) {
  // Tahan terhadap string DB naif (UTC) maupun ISO lengkap.
  const deadline = paymentDeadline({
    paymentExpiresAt: expiresAt,
    createdAt: expiresAt,
  });
  const [now, setNow] = useState(() => Date.now());
  const left = remainingParts(deadline, now);

  useEffect(() => {
    if (left.expired) {
      onExpire?.();
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [left.expired, onExpire]);

  const text = left.expired
    ? 'Kedaluwarsa'
    : `${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-semibold tabular-nums ${
        compact ? 'text-[11px]' : 'text-sm'
      } ${left.expired ? 'text-gray-500' : 'text-amber-800'}`}
      data-testid="payment-countdown"
    >
      <Clock aria-hidden="true" className={compact ? 'size-3' : 'size-4'} />
      <span>
        {left.expired ? '' : 'Sisa waktu '}
        <time dateTime={expiresAt}>{text}</time>
      </span>
    </span>
  );
}
