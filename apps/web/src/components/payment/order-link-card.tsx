'use client';

import { Check, Copy, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { orderStatusPath } from '@/lib/payment/device-orders';

/**
 * Kode transaksi + tautan status yang bisa disalin (QA-03, D2). Tamu yang
 * tidak mengisi kontak tetap bisa membuka transaksinya lagi dari perangkat
 * mana pun; perangkat ini juga mengingatnya di beranda ("Donasi dari
 * perangkat ini").
 */
export function OrderLinkCard({ orderId }: { orderId: string }) {
  const [copied, setCopied] = useState(false);
  const path = orderStatusPath(orderId);
  // Path saat render (server = klien, tanpa hydration mismatch); URL absolut
  // untuk disalin baru dibentuk setelah mount.
  const [href, setHref] = useState(path);
  useEffect(() => {
    setHref(new URL(path, window.location.origin).toString());
  }, [path]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard diblokir: tautan tetap terlihat dan bisa disalin manual.
    }
  };

  return (
    <section
      aria-label="Kode dan tautan status transaksi"
      className="rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900"
      data-testid="order-link-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-gray-500 text-xs dark:text-slate-400">
            Kode Transaksi
          </p>
          <p className="font-bold font-mono text-gray-900 dark:text-white">
            {orderId}
          </p>
        </div>
        <button
          className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#356152]/30 px-3 font-semibold text-[#356152] text-xs hover:bg-[#f2f6f4] dark:text-emerald-300"
          onClick={copy}
          type="button"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? 'Tautan disalin' : 'Salin tautan status'}
        </button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 break-all text-gray-500 text-xs dark:text-slate-400">
        <Link2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <a className="underline-offset-2 hover:underline" href={path}>
          {href}
        </a>
      </p>
      <p className="mt-1 text-[11px] text-gray-400">
        Simpan tautan ini untuk mengecek atau melanjutkan pembayaran nanti.
      </p>
    </section>
  );
}
