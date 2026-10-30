import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Check } from 'lucide-react';
import { AuthFrame } from '@/components/auth/auth-frame';
import { requireSession } from '@/lib/auth/require-session';

const FEATURES = [
  { title: 'Zakat', subtitle: 'Tunaikan kewajiban dengan mudah' },
  { title: 'Wakaf', subtitle: 'Bangun aset kebaikan jangka panjang' },
  { title: 'Infaq', subtitle: 'Bantu sesama kapan saja' },
  { title: 'Qurban', subtitle: 'Sembelih dengan amanah' },
] as const;

export function OnboardingPage() {
  return (
    <AuthFrame>
      <div className="flex flex-col items-center pt-8 text-center">
        <div className="mb-4 flex items-center justify-center">
          {/* biome-ignore lint/performance/noImgElement: TanStack Start has no next/image */}
          <img
            alt="Amwal Platform ZISWAF"
            className="h-16 w-auto object-contain"
            src="/assets/images/amwal-logo-color-v.png"
          />
        </div>
        <h1 className="mb-2 font-bold text-heading-l text-text-primary tracking-tight sm:text-3xl">
          Selamat Datang di Amwal
        </h1>
        <p className="max-w-[360px] text-gray-500 text-label-caption leading-relaxed sm:text-sm">
          Kelola zakat, wakaf, infak &amp; qurban dalam satu aplikasi yang mudah
          dan transparan.
        </p>
      </div>

      <div className="my-auto flex w-full max-w-md flex-col divide-y divide-gray-100 py-6">
        {FEATURES.map(({ title, subtitle }) => (
          <div
            className="flex items-center gap-3.5 py-3.5 first:pt-0 last:pb-0"
            key={title}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-green-tint text-brand-primary">
              <Check aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <h2 className="font-bold text-sm text-text-primary leading-tight sm:text-base">
                {title}
              </h2>
              <p className="mt-0.5 text-gray-500 text-label-caption leading-snug sm:text-sm">
                {subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-md pt-4">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="size-2 rounded-full bg-brand-primary" />
          <span className="size-2 rounded-full bg-gray-200" />
          <span className="size-2 rounded-full bg-gray-200" />
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link
            className="flex h-[52px] w-full items-center justify-center gap-1.5 rounded-field bg-brand-primary font-semibold text-[15px] text-white shadow-xs transition-all hover:bg-brand-primary-hover active:scale-[0.99]"
            to="/daftar"
          >
            Mulai Sekarang
            <ArrowRight
              aria-hidden="true"
              className="size-5"
              strokeWidth={2.5}
            />
          </Link>

          <Link
            className="flex h-[52px] w-full items-center justify-center rounded-field bg-bg-green-tint font-semibold text-[15px] text-brand-dark transition-all hover:bg-[#d8edd8] active:scale-[0.99]"
            to="/masuk"
          >
            Sudah punya akun? Masuk
          </Link>
        </div>
      </div>
    </AuthFrame>
  );
}

export const Route = createFileRoute('/onboarding')({
  beforeLoad: requireSession,
  component: OnboardingPage,
});
