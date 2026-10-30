'use client';

import { Link } from '@tanstack/react-router';
import {
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  FileText,
  LoaderCircle,
  LogIn,
  ServerCrash,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/amwal-api';
import type { AppNotification } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';

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

function getNotificationCategory(type: string) {
  const upper = type.toUpperCase();
  if (
    upper.includes('PAYMENT') ||
    upper.includes('TRANSACTION') ||
    upper.includes('DONATION') ||
    upper.includes('WAKAF')
  ) {
    return {
      Icon: CheckCircle2,
      containerClass: 'bg-[#e2ece8] text-[#356152]',
    };
  }
  if (upper.includes('PROGRAM') || upper.includes('UPDATE')) {
    return {
      Icon: TrendingUp,
      containerClass: 'bg-emerald-50 text-emerald-700',
    };
  }
  if (upper.includes('CERTIFICATE') || upper.includes('SERTIFIKAT')) {
    return {
      Icon: FileText,
      containerClass: 'bg-sky-50 text-sky-700',
    };
  }
  if (
    upper.includes('WELCOME') ||
    upper.includes('XP') ||
    upper.includes('POINT')
  ) {
    return {
      Icon: Sparkles,
      containerClass: 'bg-amber-50 text-amber-700',
    };
  }
  return {
    Icon: Bell,
    containerClass: 'bg-gray-100 text-gray-700',
  };
}

function NotificationCard({ item }: { item: AppNotification }) {
  const { Icon, containerClass } = getNotificationCategory(item.type);

  const handleClick = () => {
    if (!item.isRead) {
      markNotificationRead(item.id).catch(() => {
        // Silently handled
      });
    }
  };

  return (
    <Link
      className={`group flex w-full items-start gap-4 rounded-2xl border p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md ${
        item.isRead
          ? 'border-gray-100 bg-white'
          : 'border-gray-100 border-l-4 border-l-[#356152] bg-[#f2f6f4]/40'
      }`}
      onClick={handleClick}
      params={{ notificationId: item.id }}
      to="/notifikasi/$notificationId"
    >
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${containerClass}`}
      >
        <Icon aria-hidden="true" className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="line-clamp-1 font-bold text-base text-gray-900 transition-colors group-hover:text-[#356152]">
            {item.title}
          </h2>
          {!item.isRead && (
            <span
              className="size-2.5 shrink-0 rounded-full bg-[#356152]"
              title="Belum dibaca"
            >
              <span className="sr-only">Belum dibaca</span>
            </span>
          )}
        </div>

        {item.body && (
          <p className="mt-1 line-clamp-2 text-gray-600 text-xs leading-relaxed sm:text-sm">
            {item.body}
          </p>
        )}

        <p className="mt-2 font-medium text-[11px] text-gray-400 sm:text-xs">
          {formatRelativeTime(item.createdAt)}
        </p>
      </div>
    </Link>
  );
}

function EmptyNotificationState() {
  return (
    <div className="mt-6 flex flex-col items-center rounded-3xl border border-gray-200 border-dashed bg-white p-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-[#f2f6f4] text-[#356152]">
        <BellOff aria-hidden="true" className="size-7" />
      </div>
      <h2 className="mt-4 font-bold text-base text-gray-900">
        Belum Ada Notifikasi
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-gray-500 text-xs leading-relaxed sm:text-sm">
        Pemberitahuan transaksi, update penyaluran program wakaf, dan sertifikat
        akan muncul di sini.
      </p>
      <Link
        className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#356152] px-6 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#2b4f43]"
        to="/wakaf"
      >
        Jelajahi Program Wakaf
      </Link>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="w-full space-y-3">
      {[0, 1, 2, 3].map((placeholder) => (
        <div
          className="flex w-full items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          key={placeholder}
        >
          <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-gray-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoginPrompt() {
  return (
    <section className="mx-auto max-w-md px-5 pt-16 pb-24 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f2f6f4] text-[#356152]">
        <LogIn aria-hidden="true" className="size-6" />
      </div>
      <h1 className="mt-4 font-bold text-gray-900 text-lg">
        Masuk Untuk Melihat Notifikasi
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-gray-500 text-xs leading-relaxed">
        Masuk ke akun Amwal Anda untuk memantau status penyaluran dan pembaruan
        program.
      </p>
      <Link
        className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#356152] px-6 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#2b4f43]"
        search={(previous) => ({ ...previous, redirect: '/notifikasi' })}
        to="/auth/login"
      >
        Masuk Sekarang
      </Link>
    </section>
  );
}

export function NotificationsView({ user }: { user: SessionUser | null }) {
  const resource = useResource(getNotifications, {
    enabled: Boolean(user),
  });
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount =
    resource.state.status === 'success'
      ? resource.state.data.filter((item) => !item.isRead).length
      : 0;

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      resource.reload();
    } finally {
      setMarkingAll(false);
    }
  };

  if (!user) {
    return <LoginPrompt />;
  }

  return (
    <div className="w-full min-w-0 flex-1">
      {/* Header Section (LEFT-ALIGNED) */}
      <div className="mb-5 flex flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
        <div className="text-left">
          <div className="flex items-center gap-2.5">
            <h1 className="text-left font-bold text-2xl text-gray-900 tracking-tight sm:text-3xl">
              Notifikasi
            </h1>
            {resource.state.status === 'success' && unreadCount > 0 && (
              <span className="rounded-full bg-[#356152] px-2.5 py-0.5 font-bold text-[11px] text-white">
                {unreadCount} baru
              </span>
            )}
          </div>
          <p className="mt-1 text-left text-gray-500 text-xs sm:text-sm">
            Informasi penting terkait transaksi donasi, wakaf, dan kabar
            program.
          </p>
        </div>

        {resource.state.status === 'success' && unreadCount > 0 && (
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-xl border border-gray-200 bg-white px-4 py-2 font-semibold text-gray-700 text-xs shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
            disabled={markingAll}
            onClick={handleMarkAllRead}
            type="button"
          >
            {markingAll ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin text-[#356152]"
              />
            ) : (
              <CheckCheck
                aria-hidden="true"
                className="size-3.5 text-[#356152]"
              />
            )}
            <span>Tandai Semua Dibaca</span>
          </button>
        )}
      </div>

      {/* Main Notification List (FULL-WIDTH STACK) */}
      <main className="mt-5 w-full space-y-3">
        {resource.state.status === 'loading' && <NotificationSkeleton />}

        {resource.state.status === 'error' && (
          <div
            aria-live="polite"
            className="flex flex-col items-center rounded-3xl border border-amber-200 bg-amber-50/60 p-8 text-center"
            role="alert"
          >
            <ServerCrash
              aria-hidden="true"
              className="mb-2 size-8 text-amber-600"
            />
            <h2 className="font-bold text-gray-900 text-sm">
              Gagal Memuat Notifikasi
            </h2>
            <p className="mt-1 text-gray-500 text-xs">{resource.state.error}</p>
            <Button
              className="mt-4"
              onClick={resource.reload}
              size="sm"
              type="button"
              variant="outline"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {resource.state.status === 'success' &&
          resource.state.data.length === 0 && <EmptyNotificationState />}

        {resource.state.status === 'success' &&
          resource.state.data.map((item) => (
            <NotificationCard item={item} key={item.id} />
          ))}
      </main>
    </div>
  );
}
