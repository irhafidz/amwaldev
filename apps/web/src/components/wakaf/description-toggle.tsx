'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface DescriptionToggleProps {
  text: string;
}

export function DescriptionToggle({ text }: DescriptionToggleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = text.length > 220;

  return (
    <div className="text-gray-600 text-xs leading-relaxed sm:text-sm">
      <p className={isExpanded ? '' : 'line-clamp-4'}>{text}</p>

      {isLong && (
        <button
          className="mt-2 inline-flex cursor-pointer items-center gap-1 font-bold text-emerald-600 text-xs transition-colors hover:text-emerald-700"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          {isExpanded ? (
            <>
              <span>Tutup Keterangan</span>
              <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              <span>Baca Selengkapnya</span>
              <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
