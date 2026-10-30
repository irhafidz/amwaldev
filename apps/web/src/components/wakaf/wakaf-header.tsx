'use client';

import { useRouter } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { WakafShareButton } from './wakaf-share-button';

interface WakafHeaderProps {
  bannerUrl?: string | null;
  judul: string;
}

const DEFAULT_BANNER =
  '/assets/images/wakaf/wakaf-dana-abadi-untuk-pendidikan-agama-islam.png';

export function WakafHeader({ bannerUrl, judul }: WakafHeaderProps) {
  const router = useRouter();
  const imageSrc =
    bannerUrl && bannerUrl.trim() !== '' ? bannerUrl : DEFAULT_BANNER;

  return (
    <div className="relative h-[260px] w-full overflow-hidden bg-slate-900 sm:h-[320px] md:h-[380px]">
      {/** biome-ignore lint/performance/noImgElement: banner may be an uploaded URL or a legacy asset */}
      <img
        alt={judul}
        className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105"
        decoding="async"
        fetchPriority="high"
        src={imageSrc}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

      <div className="absolute top-4 right-4 left-4 z-20 mx-auto flex max-w-4xl items-center justify-between">
        <button
          aria-label="Kembali"
          className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-md backdrop-blur-md transition-all hover:bg-black/60 active:scale-95"
          onClick={() => router.history.back()}
          type="button"
        >
          <ChevronLeft className="size-6" />
        </button>

        <WakafShareButton judul={judul} variant="floating" />
      </div>
    </div>
  );
}
