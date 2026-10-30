'use client';

import { Check, Copy, MessageCircle, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { buildShareMessage, buildWhatsAppShareUrl } from './share-template';

/**
 * Generic "share this program" control (`I-3`, Zone 2).
 *
 * One component for all four modules — wakaf, zakat, infaq/sedekah and
 * qurban — because the interaction is identical and only the invitation verb
 * differs (`ajakan`). It is deliberately presentational: the deep link and
 * the referral code arrive as props, so the page that owns the program
 * decides *what* is being shared and *who* is sharing it.
 *
 * Fallback order is the point of the ticket: Web Share API when the platform
 * has it, clipboard when it does not. Both paths carry the same template,
 * including `?ref=<kode>` when the donor is signed in.
 */

export type ShareButtonVariant = 'button' | 'floating' | 'inline';

interface ShareProgramButtonProps {
  judul: string;
  deskripsi?: string | null;
  /** Defaults to the current page URL; pass an absolute deep link when known. */
  url?: string;
  /** Opaque referral code (`I-4`) — only set when a session actually exists. */
  refCode?: string | null;
  ajakan?: string;
  variant?: ShareButtonVariant;
  label?: string;
  className?: string;
}

function currentUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.href;
  }
  return '';
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Native sharing is used only when the platform can actually take our
 * payload — `navigator.canShare()` is what tells us that, not the mere
 * presence of `navigator.share`. Everything else falls through to the
 * clipboard/modal path, which is one extra tap, never a dead button.
 */
function canUseNativeShare(payload: ShareData): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare(payload)
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function ShareProgramButton({
  judul,
  deskripsi,
  url,
  refCode,
  ajakan,
  variant = 'button',
  label = 'Bagikan Program',
  className,
}: ShareProgramButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const shareUrl = url ?? currentUrl();
  const message = buildShareMessage({
    judul,
    deskripsi,
    url: shareUrl,
    refCode,
    ajakan,
  });
  const whatsappUrl = buildWhatsAppShareUrl(message);

  const copyMessage = async () => {
    if (await copyToClipboard(message)) {
      setCopied(true);
      showToast({
        description: 'Tempel di aplikasi chat pilihan Anda.',
        title: 'Pesan & tautan disalin',
        type: 'success',
      });
      setTimeout(() => setCopied(false), 2500);
      return true;
    }
    return false;
  };

  const handleShareClick = async () => {
    const payload: ShareData = {
      text: message,
      title: judul,
      url: shareUrl,
    };

    if (canUseNativeShare(payload)) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (isAbort(error)) {
          // The donor closed the share sheet. That is a decision, not a
          // failure: no fallback, no toast.
          return;
        }
        // Platform refused for any other reason — fall through to the
        // clipboard/modal path rather than doing nothing.
      }
    }

    await copyMessage();
    setIsOpen(true);
  };

  const icon = copied ? (
    <Check className="size-4 text-emerald-600" />
  ) : (
    <Share2 className="size-4" />
  );

  return (
    <>
      {variant === 'floating' ? (
        <button
          aria-label={label}
          className={cn(
            'flex size-10 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-md backdrop-blur-md transition-all hover:bg-black/60 active:scale-95',
            className
          )}
          onClick={handleShareClick}
          type="button"
        >
          {copied ? (
            <Check className="size-5 text-emerald-400" />
          ) : (
            <Share2 className="size-5" />
          )}
        </button>
      ) : (
        <button
          className={cn(
            'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 text-xs shadow-2xs transition-all hover:bg-gray-50 active:scale-[0.98]',
            className
          )}
          onClick={handleShareClick}
          type="button"
        >
          {icon}
          <span>{copied ? 'Pesan disalin' : label}</span>
        </button>
      )}

      {isOpen && (
        <ShareModal
          copied={copied}
          judul={judul}
          message={message}
          onClose={() => setIsOpen(false)}
          onCopy={copyMessage}
          whatsappUrl={whatsappUrl}
        />
      )}
    </>
  );
}

interface ShareModalProps {
  judul: string;
  message: string;
  whatsappUrl: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

function ShareModal({
  judul,
  message,
  whatsappUrl,
  copied,
  onCopy,
  onClose,
}: ShareModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div
        aria-labelledby="share-modal-title"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-center justify-between border-gray-100 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-emerald-50 text-[#439F46]">
              <Share2 className="size-4" />
            </div>
            <h2
              className="font-bold text-gray-900 text-sm"
              id="share-modal-title"
            >
              Bagikan Program
            </h2>
          </div>
          <button
            aria-label="Tutup"
            className="flex size-7 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-gray-500 text-xs leading-relaxed">
          {judul}
        </p>

        <blockquote className="mt-3 max-h-28 overflow-y-auto whitespace-pre-line rounded-xl border border-gray-100 bg-gray-50 p-3 text-[11px] text-gray-600 leading-relaxed">
          {message}
        </blockquote>

        <div className="mt-4 space-y-2.5">
          <a
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white text-xs shadow-xs transition-all hover:bg-[#20bd5a]"
            href={whatsappUrl}
            onClick={onClose}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle className="size-4 fill-white" />
            <span>Bagikan ke WhatsApp</span>
          </a>

          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-800 text-xs transition-all hover:bg-gray-100"
            onClick={onCopy}
            type="button"
          >
            {copied ? (
              <>
                <Check className="size-4 text-emerald-600" />
                <span className="font-bold text-emerald-700">
                  Pesan berhasil disalin!
                </span>
              </>
            ) : (
              <>
                <Copy className="size-4 text-gray-600" />
                <span>Salin template pesan</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
