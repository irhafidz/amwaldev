'use client';

import { Link } from '@tanstack/react-router';
import { ChevronRight, LogIn, UserRound, UserRoundX, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface WakafIdentityChoiceSheetProps {
  open: boolean;
  onClose: () => void;
  programId: string;
  nominal?: number;
}

const LINK_CLASSNAME =
  'flex w-full items-center gap-3 rounded-field border border-gray-200 p-3.5 text-left transition-all hover:border-[#356152]/50 hover:bg-[#f2f6f4]/60';

export function WakafIdentityChoiceSheet({
  open,
  onClose,
  programId,
  nominal,
}: WakafIdentityChoiceSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!(open && mounted) || typeof document === 'undefined') {
    return null;
  }

  const anonymousSearch =
    nominal !== undefined
      ? { mode: 'anonymous' as const, nominal }
      : { mode: 'anonymous' as const };

  const guestSearch =
    nominal !== undefined
      ? { mode: 'guest' as const, nominal }
      : { mode: 'guest' as const };

  const redirectUrl =
    nominal !== undefined
      ? `/wakaf/${programId}/donate?nominal=${nominal}`
      : `/wakaf/${programId}/donate`;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <button
        aria-label="Tutup"
        className="fade-in absolute inset-0 animate-in bg-black/60 backdrop-blur-sm duration-150"
        onClick={onClose}
        type="button"
      />

      <div
        aria-modal="true"
        className="fade-in zoom-in-95 relative m-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md animate-in flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-xl duration-150"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-text-primary text-title-s">
            Lanjutkan Wakaf Sebagai
          </h3>
          <button
            aria-label="Tutup"
            className="cursor-pointer text-gray-500 hover:text-gray-800"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="space-y-2.5">
          <Link
            className={LINK_CLASSNAME}
            params={{ programId }}
            search={anonymousSearch}
            to="/wakaf/$programId/donate"
          >
            <ChoiceLabel
              description="Wakaf tanpa data diri, nama disamarkan"
              icon={<UserRoundX aria-hidden="true" className="size-5" />}
              label="Hamba Allah (Anonim)"
            />
          </Link>
          <Link
            className={LINK_CLASSNAME}
            params={{ programId }}
            search={guestSearch}
            to="/wakaf/$programId/donate"
          >
            <ChoiceLabel
              description="Isi nama, WhatsApp & email tanpa perlu akun"
              icon={<UserRound aria-hidden="true" className="size-5" />}
              label="Donasi sebagai Tamu"
            />
          </Link>
          <Link
            className={LINK_CLASSNAME}
            search={{ redirect: redirectUrl }}
            to="/auth/login"
          >
            <ChoiceLabel
              description="Riwayat donasi tersimpan di akun Anda"
              icon={<LogIn aria-hidden="true" className="size-5" />}
              label="Masuk ke Akun"
            />
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChoiceLabel({
  icon,
  label,
  description,
}: {
  icon: ReactNode;
  label: string;
  description: string;
}) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f2f6f4] text-[#356152]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-label-caption text-text-primary">
          {label}
        </span>
        <span className="block text-caption-mini text-text-secondary">
          {description}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-gray-400"
      />
    </>
  );
}
