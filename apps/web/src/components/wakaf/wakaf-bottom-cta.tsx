'use client';

import { Link } from '@tanstack/react-router';
import { Heart } from 'lucide-react';
import { useState } from 'react';
import { WakafIdentityChoiceSheet } from './wakaf-identity-choice-sheet';

interface WakafBottomCtaProps {
  programId: string;
  isCompleted?: boolean;
  isLoggedIn: boolean;
  nominal?: number;
}

export function WakafBottomCta({
  programId,
  isCompleted = false,
  isLoggedIn,
  nominal,
}: WakafBottomCtaProps) {
  const [choiceOpen, setChoiceOpen] = useState(false);

  return (
    <div className="fixed right-0 bottom-0 left-0 z-40 border-slate-200/80 border-t bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-md sm:py-3.5">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 md:max-w-3xl lg:max-w-4xl">
        <CtaAction
          isCompleted={isCompleted}
          isLoggedIn={isLoggedIn}
          nominal={nominal}
          onOpenChoice={() => setChoiceOpen(true)}
          programId={programId}
        />
      </div>

      <WakafIdentityChoiceSheet
        nominal={nominal}
        onClose={() => setChoiceOpen(false)}
        open={choiceOpen}
        programId={programId}
      />
    </div>
  );
}

function CtaAction({
  isCompleted,
  isLoggedIn,
  nominal,
  onOpenChoice,
  programId,
}: {
  isCompleted: boolean;
  isLoggedIn: boolean;
  nominal?: number;
  onOpenChoice: () => void;
  programId: string;
}) {
  if (isCompleted) {
    return (
      <div className="w-full rounded-xl bg-gray-100 px-6 py-3.5 text-center font-bold text-gray-500 text-sm sm:text-base">
        Target Program Telah Terpenuhi
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <Link
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-6 py-3.5 text-center font-extrabold text-sm text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.98] sm:text-base"
        params={{ programId }}
        search={nominal !== undefined ? { nominal } : undefined}
        to="/wakaf/$programId/donate"
      >
        <Heart className="size-4 shrink-0 fill-white" />
        <span>Wakaf Sekarang</span>
      </Link>
    );
  }

  return (
    <button
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-6 py-3.5 text-center font-extrabold text-sm text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.98] sm:text-base"
      onClick={onOpenChoice}
      type="button"
    >
      <Heart className="size-4 shrink-0 fill-white" />
      <span>Wakaf Sekarang</span>
    </button>
  );
}
