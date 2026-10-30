import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Islamic geometric mosaic for Amwal deep-green surfaces (`#356152` family).
 * Both assets are white line-art on a transparent background, so they only
 * need an opacity to blend into the card colour.
 *
 * Containers must be `relative isolate overflow-hidden`: the overlays use a
 * negative z-index inside that stacking context, so they paint above the
 * container's background and below its content and nothing else needs
 * wrapping. They never receive pointer events and are hidden from assistive
 * tech.
 */
const SINGLE_MOTIF = '/patterns/islamic-mosaic-single.png';
const FULL_MOSAIC = '/patterns/islamic-mosaic-desktop.png';

/** Fades the motif toward its left edge so it never cuts off against copy. */
const MOTIF_FADE = 'linear-gradient(to left, black 40%, transparent 100%)';

const motifStyle: CSSProperties = {
  backgroundImage: `url(${SINGLE_MOTIF})`,
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'contain',
  maskImage: MOTIF_FADE,
  WebkitMaskImage: MOTIF_FADE,
  opacity: 0.09,
};

/**
 * Width of the rosette relative to the card, with floor and ceiling so it
 * shrinks with compact mobile cards instead of engulfing their copy.
 */
const SIZES = {
  sm: 'w-[34%] min-w-[7rem] max-w-[10rem]',
  md: 'w-[44%] min-w-[9rem] max-w-[16rem]',
  lg: 'w-[40%] min-w-[11rem] max-w-[24rem]',
} as const;

interface GreenPatternOverlayProps {
  /** `sm` for slim strips, `md` for cards, `lg` for full-bleed heroes. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Card / banner variant: exactly one rosette (9%), vertically centred and
 * pushed past the right edge (the card clips it), faded toward its left side.
 */
export function GreenPatternOverlay({
  size = 'md',
  className,
}: GreenPatternOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        '-z-10 pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      <div
        className={cn(
          '-right-[12%] -translate-y-1/2 absolute top-1/2 aspect-square',
          SIZES[size]
        )}
        style={motifStyle}
      />
    </div>
  );
}

/** Fades the mosaic out on the left (behind headings) and in toward the right. */
const FADE_MASK =
  'linear-gradient(to right, transparent 15%, rgba(0,0,0,0.8) 100%)';

interface MosaicHeroOverlayProps {
  className?: string;
}

/**
 * Auth hero variant: the full tiled mosaic at ~16%, anchored to the right and
 * masked so it is invisible under the left-aligned copy and emerges gently
 * toward the right edge.
 */
export function MosaicHeroOverlay({ className }: MosaicHeroOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        '-z-10 pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
      style={{
        backgroundImage: `url(${FULL_MOSAIC})`,
        backgroundPosition: 'right center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        maskImage: FADE_MASK,
        WebkitMaskImage: FADE_MASK,
        opacity: 0.16,
      }}
    />
  );
}
