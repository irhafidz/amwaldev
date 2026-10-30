import { useEffect, useRef } from 'react';

const POLL_INTERVAL_MS = 5000;
/** Berhenti setelah ±3 menit; setelah itu tombol "Cek Status" tetap ada. */
const MAX_POLLS = 36;

/**
 * Memuat ulang status pembayaran di latar selama pesanan masih menunggu.
 *
 * Tiap pemuatan ulang membuat server bertanya langsung ke Mayar (lihat
 * `reconcileOrderNow`), jadi donatur yang baru selesai memindai QRIS melihat
 * halaman berubah lunas dalam hitungan detik meski webhook belum diterima.
 * `refresh` (reload senyap) menjaga tampilan tetap utuh — tanpa itu setiap putaran
 * mengganti halaman dengan indikator "memuat".
 */
export function usePaymentPolling(refresh: () => void, active: boolean): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!active) {
      return;
    }
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      refreshRef.current();
      if (polls >= MAX_POLLS) {
        clearInterval(timer);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);
}
