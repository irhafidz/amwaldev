'use client';

import { Check, Copy, MessageCircle, Share2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  buildShareMessage,
  buildTwitterShareUrl,
  buildWhatsAppShareUrl,
  type ShareMessageParams,
} from '@/lib/share/message';
import { cn } from '@/lib/utils';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ShareModalProps extends ShareMessageParams {
  className?: string;
  copyFeedbackDurationMs?: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export interface ShareButtonProps extends ShareMessageParams {
  className?: string;
  copyFeedbackDurationMs?: number;
  triggerLabel?: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => element.tabIndex !== -1);
}

function trapTabKey(event: KeyboardEvent, dialog: HTMLElement | null): void {
  if (!dialog) {
    return;
  }

  const focusable = focusableElements(dialog);
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!(first && last)) {
    event.preventDefault();
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function useCopyFeedback(durationMs: number) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setCopied(false), durationMs);
  };

  return { copied, copy };
}

function ShareDialog({
  category,
  className,
  collectedAmount,
  copyFeedbackDurationMs = 2000,
  onOpenChange,
  open,
  targetAmount,
  title,
  url,
}: ShareModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopyFeedback(copyFeedbackDurationMs);
  const message = buildShareMessage({
    category,
    collectedAmount,
    targetAmount,
    title,
    url,
  });
  const messageWithoutUrl = buildShareMessage(
    { category, collectedAmount, targetAmount, title, url },
    { includeUrl: false }
  );
  const whatsappUrl = buildWhatsAppShareUrl(message);
  const twitterUrl = buildTwitterShareUrl(messageWithoutUrl, url);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActive = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      const first = dialog ? focusableElements(dialog).at(0) : null;
      (first ?? dialog)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key === 'Tab') {
        trapTabKey(event, dialogRef.current);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousActive?.focus();
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        aria-labelledby="share-modal-title"
        aria-modal="true"
        className={cn(
          'relative w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl',
          className
        )}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-gray-100 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-brand-primary">
              <Share2 className="size-4" />
            </div>
            <h3
              className="font-bold text-gray-900 text-sm"
              id="share-modal-title"
            >
              Bagikan Kebaikan
            </h3>
          </div>
          <button
            aria-label="Tutup dialog bagikan"
            className="flex size-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-gray-500 text-xs leading-relaxed">
          {title}
        </p>

        <div className="mt-4 space-y-2.5">
          <a
            aria-label="Bagikan ke WhatsApp"
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white text-xs shadow-xs transition-all hover:bg-[#20bd5a]"
            href={whatsappUrl}
            onClick={() => onOpenChange(false)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle className="size-4 fill-white" />
            <span>WhatsApp</span>
          </a>
          <a
            aria-label="Bagikan ke X atau Twitter"
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white text-xs shadow-xs transition-all hover:bg-black"
            href={twitterUrl}
            onClick={() => onOpenChange(false)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="font-black text-sm">X</span>
            <span>X / Twitter</span>
          </a>
          <button
            aria-label="Salin tautan"
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-800 text-xs transition-all hover:bg-gray-100"
            onClick={() => {
              copy(url).catch(() => null);
            }}
            type="button"
          >
            {copied ? (
              <>
                <Check className="size-4 text-emerald-600" />
                <span className="font-bold text-emerald-700">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="size-4 text-gray-600" />
                <span>Salin Tautan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareModal(props: ShareModalProps) {
  return <ShareDialog {...props} />;
}

export function ShareButton({
  className,
  copyFeedbackDurationMs = 2000,
  triggerLabel = 'Bagikan',
  ...shareParams
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  const handleShare = async () => {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({
          text: buildShareMessage(shareParams, { includeUrl: false }),
          title: shareParams.title,
          url: shareParams.url,
        });
        return;
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
      }
    }

    setOpen(true);
  };

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={cn(
          'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 font-semibold text-gray-700 text-xs shadow-2xs transition-all hover:bg-gray-50 active:scale-[0.98]',
          className
        )}
        onClick={() => {
          handleShare().catch(() => null);
        }}
        type="button"
      >
        <Share2 className="size-4 shrink-0 text-brand-primary" />
        <span>{triggerLabel}</span>
      </button>
      <ShareModal
        {...shareParams}
        copyFeedbackDurationMs={copyFeedbackDurationMs}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

export default ShareButton;
