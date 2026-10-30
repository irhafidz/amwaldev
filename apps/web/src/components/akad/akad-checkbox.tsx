'use client';

import { sha256Body } from '@amwal/core/akad';
import type {
  AkadAcceptanceInput,
  AkadModule,
  AkadTemplateSummary,
} from '@amwal/core/contracts/akad';
import { ChevronDown, ChevronUp, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getActiveAkad } from '@/lib/amwal-api/akad';
import { Skeleton } from '../ui/skeleton';

interface AkadCheckboxProps {
  module: AkadModule;
  onAccept: (acceptance: AkadAcceptanceInput | null) => void;
  disabled?: boolean;
  className?: string;
}

export function AkadCheckbox({
  module,
  onAccept,
  disabled = false,
  className = '',
}: AkadCheckboxProps) {
  const [loading, setLoading] = useState(true);
  const [activeAkad, setActiveAkad] = useState<AkadTemplateSummary | null>(
    null
  );
  const [accepted, setAccepted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onAcceptRef = useRef(onAccept);

  useEffect(() => {
    onAcceptRef.current = onAccept;
  }, [onAccept]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getActiveAkad(module)
      .then((akad) => {
        if (!cancelled) {
          setActiveAkad(akad);
          setLoading(false);
          // If no active akad template exists for this module, it is not required
          if (!akad) {
            onAcceptRef.current(null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Gagal memuat templat akad'
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [module]);

  const handleToggleCheck = async (checked: boolean) => {
    setAccepted(checked);
    if (checked && activeAkad) {
      const hash = await sha256Body(activeAkad.body);
      onAccept({
        templateId: activeAkad.id,
        version: activeAkad.version,
        bodySha256: hash,
      });
    } else {
      onAccept(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`rounded-card border border-border-subtle p-4 ${className}`}
      >
        <div className="flex items-center gap-3">
          <Skeleton
            className="size-4 rounded"
            label="Memuat persetujuan akad…"
          />
          <Skeleton aria-hidden="true" className="h-4 w-3/4 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Don't crash checkout if akad fetch fails
  }

  // Modul tanpa akad aktif tidak menampilkan checkbox dan tidak diwajibkan
  if (!activeAkad) {
    return null;
  }

  return (
    <div
      className={`rounded-card border border-border-subtle bg-bg-surface-soft p-4 transition-colors ${
        accepted ? 'border-brand-primary/40 bg-brand-primary/5' : ''
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <input
          checked={accepted}
          className="mt-1 size-4 cursor-pointer accent-brand-primary disabled:cursor-not-allowed"
          disabled={disabled}
          id={`akad-checkbox-${module}`}
          onChange={(e) => handleToggleCheck(e.target.checked)}
          type="checkbox"
        />
        <div className="flex-1">
          <label
            className="cursor-pointer font-medium text-label-caption text-text-primary"
            htmlFor={`akad-checkbox-${module}`}
          >
            Saya telah membaca dan menyetujui{' '}
            <span className="font-semibold text-brand-primary">
              {activeAkad.title} (v{activeAkad.version})
            </span>
          </label>

          <button
            className="mt-1 flex items-center gap-1 font-medium text-caption-mini text-text-secondary hover:text-brand-primary"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            <FileText aria-hidden="true" className="size-3.5" />
            <span>
              {expanded
                ? 'Sembunyikan isi redaksi akad'
                : 'Lihat isi redaksi akad'}
            </span>
            {expanded ? (
              <ChevronUp aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-3.5" />
            )}
          </button>

          {expanded && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border-subtle bg-bg-surface p-3 text-caption-mini text-text-secondary leading-relaxed">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-text-primary">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-4 text-brand-primary"
                />
                <span>{activeAkad.title}</span>
              </div>
              <p className="whitespace-pre-wrap">{activeAkad.body}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
