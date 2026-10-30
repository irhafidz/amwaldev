import { createFileRoute } from '@tanstack/react-router';
import {
  Check,
  Copy,
  Gift,
  MousePointerClick,
  Share2,
  UserPlus,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ShareButton } from '@/components/share';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserShell } from '@/components/user-shell';
import { useResource } from '@/lib/amwal-api/use-resource';
import { requireSession } from '@/lib/auth/require-session';
import type { SessionUser } from '@/lib/auth/types';
import { orpc } from '@/lib/orpc/client';

const TRAILING_SLASH_PATTERN = /\/+$/;

export const Route = createFileRoute('/afiliasi')({
  beforeLoad: requireSession,
  component: AffiliatePage,
});

export interface AffiliateDashboardData {
  code: string;
  totalAttributedDonations: number;
  totalClicks: number;
}

interface AffiliateDashboardViewProps {
  data: AffiliateDashboardData | null;
  error: string | null;
  isLoading: boolean;
  onReload: () => void;
  referralOrigin: string;
  user: SessionUser | null;
}

function LoginCta() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title-s">
          <UserPlus aria-hidden="true" className="size-5 text-brand-primary" />
          Bergabung Program Afiliasi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-base text-gray-600 leading-relaxed">
          Masuk ke akun Amwal Anda untuk mendapatkan kode referral, membagikan
          tautan kebaikan, dan memantau dampak yang Anda bawa.
        </p>
        <Button asChild className="w-full">
          <a href="/auth/login?redirect=%2Fafiliasi">Masuk untuk Bergabung</a>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReferralCodeCard({
  code,
  referralUrl,
}: {
  code: string;
  referralUrl: string;
}) {
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title-s">
          <Gift aria-hidden="true" className="size-5 text-brand-primary" />
          Kode Referral Anda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-center">
          <p className="font-bold text-2xl text-emerald-900 tracking-[0.25em]">
            {code}
          </p>
          <p className="mt-2 break-all text-caption-mini text-emerald-800">
            {referralUrl}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            aria-label="Salin tautan referral"
            onClick={() => {
              handleCopy().catch(() => null);
            }}
            type="button"
            variant="outline"
          >
            {copied ? (
              <>
                <Check aria-hidden="true" />
                Tersalin!
              </>
            ) : (
              <>
                <Copy aria-hidden="true" />
                Salin Tautan
              </>
            )}
          </Button>
          <ShareButton
            category="SEDEKAH"
            title="Dukung kebaikan lewat Amwal"
            triggerLabel="Bagikan"
            url={referralUrl}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatsCard({ data }: { data: AffiliateDashboardData }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <MousePointerClick aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-caption-mini text-gray-500">
                Total Kunjungan Referral
              </p>
              <p className="font-bold text-2xl text-gray-900">
                {data.totalClicks.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Gift aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-caption-mini text-gray-500">
                Donasi Teratribusi
              </p>
              <p className="font-bold text-2xl text-gray-900">
                {data.totalAttributedDonations.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Salin tautan',
      detail: 'Dapatkan tautan referral unik dari akun Anda.',
    },
    {
      title: 'Sebarkan ke kerabat',
      detail: 'Bagikan lewat WhatsApp, X, atau pesan pribadi.',
    },
    {
      title: 'Raih pahala jariyah',
      detail: 'Setiap kebaikan yang tersalurkan membawa manfaat berkelanjutan.',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title-s">
          <Share2 aria-hidden="true" className="size-5 text-brand-primary" />
          Cara Kerja
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => (
          <div className="flex gap-3" key={step.title}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800 text-xs">
              {index + 1}
            </span>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {step.title}
              </p>
              <p className="text-caption-mini text-gray-500">{step.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-8">
          <div className="mx-auto h-6 w-40 animate-pulse rounded bg-gray-100" />
          <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded bg-gray-100" />
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-card bg-gray-100" />
        <div className="h-24 animate-pulse rounded-card bg-gray-100" />
      </div>
    </div>
  );
}

export function AffiliateDashboardView({
  data,
  error,
  isLoading,
  onReload,
  referralOrigin,
  user,
}: AffiliateDashboardViewProps) {
  if (!user) {
    return <LoginCta />;
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-body-base text-rose-700">
            {error ?? 'Data afiliasi belum tersedia.'}
          </p>
          <Button onClick={onReload} type="button" variant="outline">
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const referralUrl = `${referralOrigin.replace(TRAILING_SLASH_PATTERN, '')}/r/${data.code}`;

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="font-bold text-gray-900 text-heading-l">
          Afiliasi Kebaikan
        </h1>
        <p className="mt-1 text-body-base text-gray-500">
          Bagikan kebaikan, pantau dampaknya, dan tumbuhkan manfaat jariyah.
        </p>
      </header>

      <ReferralCodeCard code={data.code} referralUrl={referralUrl} />
      <StatsCard data={data} />
      <HowItWorks />
    </div>
  );
}

function AffiliatePage() {
  const { user } = Route.useRouteContext();
  const [referralOrigin, setReferralOrigin] = useState('');
  const { state, reload } = useResource(
    async (): Promise<AffiliateDashboardData> => {
      const [codeResult, dashboardResult] = await Promise.all([
        orpc.affiliate.myCode({}),
        orpc.affiliate.dashboard({}),
      ]);

      return {
        code: codeResult.data.code,
        totalAttributedDonations: dashboardResult.data.totalAttributedDonations,
        totalClicks: dashboardResult.data.totalClicks,
      };
    },
    { enabled: Boolean(user) }
  );

  useEffect(() => {
    setReferralOrigin(window.location.origin);
  }, []);

  return (
    <UserShell user={user}>
      <main className="flex-1 overflow-y-auto px-5 pt-6 pb-28">
        <AffiliateDashboardView
          data={state.status === 'success' ? state.data : null}
          error={state.status === 'error' ? state.error : null}
          isLoading={state.status === 'loading' && Boolean(user)}
          onReload={reload}
          referralOrigin={referralOrigin || 'https://amwal.id'}
          user={user}
        />
      </main>
    </UserShell>
  );
}
