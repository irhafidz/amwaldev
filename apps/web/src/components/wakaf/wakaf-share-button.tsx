'use client';

import {
  type ShareButtonVariant,
  ShareProgramButton,
} from '@/components/share/share-program-button';

/**
 * Wakaf-flavoured entry point for the generic share control (`I-3`).
 *
 * It survives as its own component for two reasons: `waqf-detail.tsx` and
 * `wakaf-header.tsx` already import this name, and wakaf is the one module
 * whose invitation verb differs (`berwakaf`). All behaviour — the chat
 * template, the `?ref=` merge, the Web Share API with clipboard fallback —
 * lives in `ShareProgramButton`, so the four modules cannot drift apart.
 */

interface WakafShareButtonProps {
  judul: string;
  className?: string;
  variant?: ShareButtonVariant;
  /** Defaults to the current page URL. */
  url?: string;
  deskripsi?: string | null;
  /** Opaque referral code (`I-4`); pass it only for a signed-in donor. */
  refCode?: string | null;
}

export function WakafShareButton({
  judul,
  className,
  variant,
  url,
  deskripsi,
  refCode,
}: WakafShareButtonProps) {
  return (
    <ShareProgramButton
      ajakan="berwakaf"
      className={className}
      deskripsi={deskripsi}
      judul={judul}
      refCode={refCode}
      url={url}
      variant={variant}
    />
  );
}
