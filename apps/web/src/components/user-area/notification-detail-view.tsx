'use client';

import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  LogIn,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNotification } from '@/lib/amwal-api';
import type { AppNotification } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';

function formatFullDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const dateFormatted = date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeFormatted = date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${dateFormatted}, ${timeFormatted} WIB`;
  } catch {
    return dateStr;
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) {
    return 'Baru saja';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} menit yang lalu`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours} jam yang lalu`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'Kemarin';
  }
  if (diffDays < 7) {
    return `${diffDays} hari yang lalu`;
  }
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function resolveNotificationContext(item: AppNotification) {
  const upper = item.type.toUpperCase();
  if (
    upper.includes('PAYMENT') ||
    upper.includes('TRANSACTION') ||
    upper.includes('DONATION') ||
    upper.includes('WAKAF')
  ) {
    return {
      label: 'Transaksi',
      Icon: CheckCircle2,
      iconClass: 'bg-[#e2ece8] text-[#356152]',
      ctaLabel: 'Lihat Riwayat Transaksi',
      ctaHref: item.relatedEntityId
        ? `/riwayat/${item.relatedEntityId}`
        : '/riwayat',
    };
  }

  if (upper.includes('PROGRAM') || upper.includes('UPDATE')) {
    return {
      label: 'Kabar Program',
      Icon: TrendingUp,
      iconClass: 'bg-emerald-50 text-emerald-700',
      ctaLabel: 'Lihat Detail Program',
      ctaHref: item.relatedEntityId
        ? `/wakaf/${item.relatedEntityId}`
        : '/wakaf',
    };
  }

  if (upper.includes('CERTIFICATE') || upper.includes('SERTIFIKAT')) {
    return {
      label: 'Sertifikat',
      Icon: FileText,
      iconClass: 'bg-sky-50 text-sky-700',
      ctaLabel: 'Lihat Sertifikat Transaksi',
      ctaHref: item.relatedEntityId
        ? `/riwayat/${item.relatedEntityId}`
        : '/riwayat',
    };
  }

  if (
    upper.includes('WELCOME') ||
    upper.includes('XP') ||
    upper.includes('POINT')
  ) {
    return {
      label: 'Hadiah & XP',
      Icon: Sparkles,
      iconClass: 'bg-amber-50 text-amber-700',
      ctaLabel: 'Lihat Poin & XP',
      ctaHref: '/poin',
    };
  }

  return {
    label: 'Notifikasi',
    Icon: Bell,
    iconClass: 'bg-gray-100 text-gray-700',
    ctaLabel: 'Lihat Riwayat Transaksi',
    ctaHref: '/riwayat',
  };
}

function NotificationBreadcrumbHeader() {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 text-gray-500 text-xs"
    >
      <Link
        className="inline-flex items-center gap-1.5 font-medium text-gray-600 transition-colors hover:text-[#356152]"
        to="/notifikasi"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        <span>Notifikasi</span>
      </Link>
      <span aria-hidden="true" className="text-gray-300">
        /
      </span>
      <span className="font-semibold text-gray-900">Detail Notifikasi</span>
    </nav>
  );
}

function NotificationDetailSkeleton() {
  return (
    <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-5 w-28 animate-pulse rounded-full bg-gray-100" />
      </div>
      <div className="h-8 w-3/4 animate-pulse rounded bg-gray-100" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
      <div className="my-6 h-px w-full bg-gray-100" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-4/6 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="mt-8 h-12 w-full animate-pulse rounded-xl bg-gray-100" />
    </div>
  );
}

function NotificationDetailNotFound({
  error,
  onRetry,
}: {
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center rounded-3xl border border-amber-200 bg-amber-50/60 p-8 text-center"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mb-2 size-8 text-amber-600" />
      <h2 className="font-bold text-gray-900 text-sm">
        Notifikasi Tidak Ditemukan
      </h2>
      <p className="mt-1 text-gray-500 text-xs">
        {error ||
          'Notifikasi yang Anda cari tidak tersedia atau telah dihapus.'}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {onRetry && (
          <Button onClick={onRetry} size="sm" type="button" variant="outline">
            Coba Lagi
          </Button>
        )}
        <Link
          className="inline-flex items-center justify-center rounded-lg bg-[#356152] px-4 py-2 font-semibold text-white text-xs hover:bg-[#2b4f43]"
          to="/notifikasi"
        >
          Kembali ke Notifikasi
        </Link>
      </div>
    </div>
  );
}

function NotificationDetailAuthRequired({
  notificationId,
}: {
  notificationId: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-amber-200 bg-amber-50/60 p-8 text-center">
      <LogIn aria-hidden="true" className="mb-2 size-8 text-amber-600" />
      <h2 className="font-bold text-base text-gray-900">
        Notifikasi Dilindungi
      </h2>
      <p className="mt-1 text-gray-600 text-xs">
        Silakan masuk ke akun Amwal Anda untuk melihat detail notifikasi ini.
      </p>
      <Link
        className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#356152] px-5 py-2.5 font-bold text-white text-xs hover:bg-[#2b4f43]"
        search={(previous) => ({
          ...previous,
          redirect: `/notifikasi/${notificationId}`,
        })}
        to="/auth/login"
      >
        Masuk Sekarang
      </Link>
    </div>
  );
}

function NotificationContentCard({ item }: { item: AppNotification }) {
  const meta = resolveNotificationContext(item);
  const IconComponent = meta.Icon;

  return (
    <article className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-11 items-center justify-center rounded-2xl ${meta.iconClass}`}
          >
            <IconComponent aria-hidden="true" className="size-5" />
          </div>
          <span className="inline-flex items-center rounded-full bg-[#e2ece8] px-3 py-1 font-semibold text-[#356152] text-xs">
            Detail Notifikasi
          </span>
        </div>
        <span className="text-gray-400 text-xs">{meta.label}</span>
      </div>

      <h1 className="mt-5 font-bold text-2xl text-gray-900 leading-snug tracking-tight sm:text-3xl">
        {item.title}
      </h1>

      <div className="mt-3 flex items-center gap-2 text-gray-500 text-xs sm:text-sm">
        <Clock aria-hidden="true" className="size-4 text-gray-400" />
        <span>
          {formatFullDateTime(item.createdAt)} •{' '}
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>

      <hr className="my-6 border-gray-100" />

      <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed sm:text-base">
        {item.body || 'Tidak ada informasi tambahan.'}
      </div>

      {item.relatedEntityId && (
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#e2ece8] bg-[#f2f6f4] px-4 py-3 text-gray-600 text-xs">
          <span>Referensi ID:</span>
          <span className="font-medium font-mono text-[#356152]">
            {item.relatedEntityId}
          </span>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <Link
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#356152] py-3.5 font-semibold text-white shadow-[#356152]/20 shadow-sm transition-colors hover:bg-[#2b4f43]"
          to={meta.ctaHref}
        >
          <span>{meta.ctaLabel}</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>

        <Link
          className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white py-3 font-medium text-gray-600 text-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          to="/notifikasi"
        >
          Kembali ke Notifikasi
        </Link>
      </div>
    </article>
  );
}

export function NotificationDetailView({
  notificationId,
  user,
}: {
  notificationId: string;
  user: SessionUser | null;
}) {
  const resource = useResource(() => getNotification(notificationId), {
    enabled: Boolean(user && notificationId),
  });

  if (!user) {
    return (
      <div className="w-full min-w-0 flex-1 space-y-5">
        <NotificationBreadcrumbHeader />
        <div className="mx-auto max-w-xl">
          <NotificationDetailAuthRequired notificationId={notificationId} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 flex-1 space-y-5">
      <NotificationBreadcrumbHeader />

      <div className="mx-auto max-w-xl space-y-5">
        {resource.state.status === 'loading' && <NotificationDetailSkeleton />}

        {resource.state.status === 'error' && (
          <NotificationDetailNotFound
            error={resource.state.error}
            onRetry={resource.reload}
          />
        )}

        {resource.state.status === 'success' && (
          <NotificationContentCard item={resource.state.data} />
        )}
      </div>
    </div>
  );
}
