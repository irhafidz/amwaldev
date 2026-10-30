import type * as React from 'react';

import { cn } from '@/lib/utils';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Teks yang dibacakan pembaca layar selama placeholder tampil. */
  label?: string;
};

/**
 * Placeholder pemuatan.
 *
 * `aria-busy` menandai wilayah ini sedang dimuat, dan teks `sr-only`
 * memberi pembaca layar sesuatu untuk dibacakan — tanpa itu, placeholder
 * visual ini sama sekali tidak terdengar dan pengguna hanya menemui
 * kekosongan.
 *
 * **Sengaja bukan live region.** Versi pertama memakai `role="status"` +
 * `aria-live="polite"`, dan itu keliru: daftar berisi sepuluh skeleton
 * menjadi sepuluh live region yang mengumumkan diri bersamaan. Placeholder
 * perlu *dapat ditemukan* pembaca layar, bukan *berteriak* kepadanya.
 * `aria-busy` menandai wilayah sedang dimuat, teks `sr-only` memberi sesuatu
 * untuk dibacakan saat pengguna sampai ke sana. Pengumuman "data siap"
 * adalah tugas wilayah yang menampung hasilnya, bukan tugas placeholder.
 *
 * Untuk daftar, beri label pada yang pertama dan sembunyikan sisanya —
 * props disebar setelah atribut bawaan sehingga selalu bisa ditimpa:
 *
 *   <Skeleton label="Memuat daftar kuitansi…" />
 *   <Skeleton aria-hidden="true" />
 */
function Skeleton({ className, label, children, ...props }: SkeletonProps) {
  return (
    <div
      aria-busy="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    >
      {children ?? <span className="sr-only">{label ?? 'Memuat…'}</span>}
    </div>
  );
}

export { Skeleton };
