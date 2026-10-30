import { ACTIVITY_POINTS } from '@amwal/core/gamification/points';
import { Sparkles } from 'lucide-react';

/**
 * Ajakan masuk di akhir kuis untuk TAMU (QA-08, D5). Tamu boleh membaca dan
 * mengerjakan kuis, tetapi XP tidak tersimpan; XP disembunyikan di seluruh
 * halaman edukasi sampai ia masuk.
 */
export function QuizLoginBanner() {
  const target =
    typeof window === 'undefined'
      ? ''
      : `?redirect=${encodeURIComponent(window.location.href)}`;

  return (
    <div
      className="mx-auto mt-4 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-amber-950"
      data-testid="quiz-login-banner"
    >
      <p className="flex items-center justify-center gap-2 font-bold text-sm">
        <Sparkles aria-hidden="true" className="size-4 text-amber-600" />
        Kuis Selesai!
      </p>
      <p className="mt-1 text-xs">
        Masuk sekarang untuk mengklaim +{ACTIVITY_POINTS.QUIZ} XP dan menyimpan
        pencapaian Anda!
      </p>
      <a
        className="mt-3 inline-flex rounded-xl bg-[#356152] px-4 py-2 font-bold text-white text-xs transition hover:bg-[#2b4f43]"
        href={`/auth/login${target}`}
      >
        Masuk untuk Mengklaim
      </a>
    </div>
  );
}
