import type { CSSProperties } from 'react';

const MOSAIC = '/patterns/islamic-mosaic-desktop.png';

/**
 * The mosaic asset is white line-art on a transparent background, which is
 * invisible on the light backoffice surfaces. Used as a CSS *mask* over a solid
 * Amwal Emerald fill, the lines take the brand colour instead, and the opacity
 * decides how quiet it is.
 */
function mosaicStyle(
  size: string,
  opacity: number,
  extra?: CSSProperties
): CSSProperties {
  return {
    backgroundColor: '#356152',
    maskImage: `url(${MOSAIC})`,
    WebkitMaskImage: `url(${MOSAIC})`,
    maskRepeat: 'repeat',
    WebkitMaskRepeat: 'repeat',
    maskSize: size,
    WebkitMaskSize: size,
    opacity,
    ...extra,
  };
}

/**
 * Page-wide texture. `fixed` + `inset-0` pins it to the viewport, so it stays
 * put while the content scrolls over it. Must sit inside an `isolate`d parent:
 * the negative z-index then keeps it above the parent's background and below
 * everything else.
 */
export function FixedMosaicBackground() {
  return (
    <div
      aria-hidden="true"
      className="-z-10 pointer-events-none fixed inset-0"
      style={mosaicStyle('1100px auto', 0.05)}
    />
  );
}

/** Soft accent for a bar or card: fades out toward the left. */
export function MosaicHeaderAccent() {
  const fade = 'linear-gradient(to left, black 0%, transparent 85%)';
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 w-1/2 max-w-xl"
      style={mosaicStyle('640px auto', 0.1, {
        maskImage: `url(${MOSAIC}), ${fade}`,
        WebkitMaskImage: `url(${MOSAIC}), ${fade}`,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      })}
    />
  );
}
