'use client';

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  LogOut,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatRupiahCompact } from '@/lib/amwal-api/format';
import {
  getUserProfile,
  type UserDocumentItem,
  type UserProfileResponse,
} from '@/lib/amwal-api/user';
import authClient from '@/lib/auth/auth-client';
import type { SessionUser } from '@/lib/auth/types';

export function ProfileMainView({ user }: { user: SessionUser | null }) {
  const [profileData, setProfileData] = useState<UserProfileResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    let isMounted = true;
    setIsLoading(true);
    setLoadError(false);
    getUserProfile()
      .then((res) => {
        if (isMounted) {
          setProfileData(res);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  if (!user) {
    return <LoginPrompt />;
  }

  const displayName = profileData?.user.name || user.name || 'Pengguna Amwal';
  const displayContact =
    profileData?.user.email ||
    profileData?.user.phone ||
    user.email ||
    user.phone ||
    '';
  const avatarUrl = profileData?.user.avatarUrl;

  const stats = profileData?.stats ?? {
    totalWakaf: 0,
    proyekDidanai: 0,
    sertifikatTerbit: 0,
    totalZakat: 0,
  };

  const gamification = profileData?.gamification ?? {
    level: user.level || 'LEVEL 1 • MUBTADI',
    xp: 0,
  };

  const documents: UserDocumentItem[] = profileData?.documents ?? [];

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authClient.signOut();
    } catch {
      // Ignore error during signout
    } finally {
      window.location.assign('/auth/login');
    }
  };

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s.charAt(0))
      .join('')
      .toUpperCase() || 'AM';

  return (
    <div className="flex h-full flex-col justify-between">
      {/* Header (Figma Node: 2966-8941) */}
      <header className="z-20 flex shrink-0 items-center justify-between border-gray-100 border-b bg-white px-5 pt-6 pb-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Kembali"
            className="-ml-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-[#1E293B] transition-all hover:bg-slate-100 active:scale-95"
            to="/dashboard"
          >
            <ArrowLeft className="stroke-[2.5]" size={22} />
          </Link>
          <h1 className="font-bold text-[#1E293B] text-xl tracking-tight">
            Profil
          </h1>
        </div>

        <Link
          aria-label="Pengaturan"
          className="-mr-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-[#1E293B] transition-all hover:bg-slate-100 active:scale-95"
          to="/profil/pengaturan"
        >
          <Settings className="text-[#1E293B]" size={22} />
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-24 sm:px-6">
        {/* User Card */}
        <div className="flex items-center gap-4 py-1">
          <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-[#00AB55] border-[2.5px] bg-emerald-50 p-[3px] shadow-sm">
            {avatarUrl ? (
              /** biome-ignore lint/performance/noImgElement: user avatar display */
              <img
                alt={displayName}
                className="size-full rounded-full object-cover"
                height={74}
                src={avatarUrl}
                width={74}
              />
            ) : (
              <div className="flex size-full items-center justify-center rounded-full bg-gradient-to-tr from-[#006D34] to-[#00AB55] font-bold text-2xl text-white uppercase tracking-wide">
                {initials}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold text-[#1E293B] text-xl tracking-tight sm:text-2xl">
              {displayName}
            </h2>
            {displayContact && (
              <p className="mt-1 truncate font-medium text-[#64748B] text-xs sm:text-sm">
                {displayContact}
              </p>
            )}
          </div>
        </div>

        {/* Gamifikasi Banner */}
        <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#064E3B] p-4 text-white shadow-md sm:p-5">
          <div className="-right-6 -bottom-6 pointer-events-none absolute size-24 rounded-full bg-[#00AB55]/30 blur-xl" />

          <div className="relative z-10 flex items-center gap-3.5">
            <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#00AB55]/40 bg-[#006D34]/80 p-1 shadow-inner">
              {/** biome-ignore lint/performance/noImgElement: gamification coin icon */}
              <img
                alt="XP Coin"
                className="size-full object-contain drop-shadow-sm"
                height={48}
                src="/assets/images/profile/icon-coin.png"
                width={48}
              />
            </div>
            <div>
              <span className="block font-bold text-[10px] text-emerald-300 uppercase tracking-wider">
                {gamification.level}
              </span>
              <span className="font-bold text-base text-white tracking-tight sm:text-lg">
                {gamification.xp} XP Berkah
              </span>
            </div>
          </div>

          <Link
            className="relative z-10 flex cursor-pointer items-center gap-1 font-semibold text-emerald-200 text-xs transition-colors hover:text-white sm:text-sm"
            to="/poin"
          >
            <span>Rincian</span>
            <ChevronRight size={16} />
          </Link>
        </div>

        {/* Ringkasan Portofolio (Grid 2x2) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1E293B] text-base tracking-tight">
              Ringkasan Portofolio
            </h3>
            {isLoading && (
              <RefreshCw className="size-3.5 animate-spin text-gray-400" />
            )}
          </div>

          {loadError && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-600 text-xs">
              Gagal memuat data portofolio. Coba muat ulang halaman.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex h-[86px] flex-col justify-between rounded-xl border border-[#F1F5F9] bg-white p-4 shadow-2xs">
              <span className="font-medium text-[#64748B] text-xs">
                Total Wakaf
              </span>
              <span className="font-bold text-[#00AB55] text-lg tracking-tight">
                {formatRupiahCompact(stats.totalWakaf)}
              </span>
            </div>

            <div className="flex h-[86px] flex-col justify-between rounded-xl border border-[#F1F5F9] bg-white p-4 shadow-2xs">
              <span className="font-medium text-[#64748B] text-xs">
                Program Didanai
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-[#1E293B] text-lg">
                  {stats.proyekDidanai}
                </span>
                <span className="font-medium text-[#94A3B8] text-sm">
                  Proyek
                </span>
              </div>
            </div>

            <div className="flex h-[86px] flex-col justify-between rounded-xl border border-[#F1F5F9] bg-white p-4 shadow-2xs">
              <span className="font-medium text-[#64748B] text-xs">
                Sertifikat Wakaf
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-[#1E293B] text-lg">
                  {stats.sertifikatTerbit}
                </span>
                <span className="font-medium text-[#94A3B8] text-sm">
                  Terbit
                </span>
              </div>
            </div>

            <div className="flex h-[86px] flex-col justify-between rounded-xl border border-[#F1F5F9] bg-white p-4 shadow-2xs">
              <span className="font-medium text-[#64748B] text-xs">
                Total Zakat
              </span>
              <span className="font-bold text-[#2563EB] text-lg tracking-tight">
                {formatRupiahCompact(stats.totalZakat)}
              </span>
            </div>
          </div>
        </div>

        {/* Section: Dokumen Saya */}
        <div className="space-y-3">
          <h3 className="font-bold text-[#1E293B] text-base tracking-tight">
            Dokumen Saya
          </h3>

          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-[#F1F5F9] bg-white shadow-2xs">
            {documents.length === 0 && (
              <p className="p-4 text-center text-[#94A3B8] text-xs">
                Belum ada dokumen sertifikat wakaf.
              </p>
            )}
            {documents.map((doc) => (
              <div
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50/70"
                key={doc.id}
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#DCFCE7] bg-[#F0FDF4]">
                    <FileText className="text-[#00AB55]" size={20} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-[#1E293B] text-xs sm:text-sm">
                      {doc.title}
                    </h4>
                    <p className="mt-0.5 truncate text-[#94A3B8] text-[11px]">
                      {doc.date} • {doc.code}
                    </p>
                  </div>
                </div>

                {doc.pdfUrl ? (
                  <a
                    aria-label={`Unduh ${doc.title}`}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-400 transition-all hover:bg-emerald-50 hover:text-[#00AB55] active:scale-95"
                    href={doc.pdfUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Download size={18} />
                  </a>
                ) : (
                  <Link
                    aria-label={`Lihat ${doc.title}`}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-400 transition-all hover:bg-emerald-50 hover:text-[#00AB55] active:scale-95"
                    to="/riwayat"
                  >
                    <Download size={18} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tombol Keluar (Logout) */}
        <div className="pt-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white py-4 font-bold text-rose-600 text-sm shadow-2xs transition-all hover:bg-rose-50/50 active:scale-[0.98] sm:text-base"
            onClick={() => setShowLogoutDialog(true)}
            type="button"
          >
            <LogOut className="text-rose-600" size={18} />
            <span>Keluar (Logout)</span>
          </button>
        </div>
      </main>

      {/* Dialog Konfirmasi Logout */}
      {showLogoutDialog && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="zoom-in-95 w-full max-w-sm animate-in rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <LogOut size={24} />
            </div>
            <h3 className="font-bold text-[#1E293B] text-lg">
              Konfirmasi Keluar
            </h3>
            <p className="mt-2 text-gray-500 text-xs leading-relaxed">
              Apakah Anda yakin ingin keluar dari akun Amwal? Anda perlu masuk
              kembali untuk melihat portofolio dan dokumen wakaf Anda.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                className="flex-1 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 text-xs transition-colors hover:bg-gray-50"
                onClick={() => setShowLogoutDialog(false)}
                type="button"
              >
                Batal
              </button>
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 font-semibold text-white text-xs transition-colors hover:bg-rose-700 disabled:opacity-50"
                disabled={isLoggingOut}
                onClick={handleLogout}
                type="button"
              >
                {isLoggingOut ? 'Memproses...' : 'Ya, Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPrompt() {
  return (
    <section className="flex h-full flex-col items-center justify-center px-5 py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-emerald-50 text-[#00AB55]">
        <FileText size={32} />
      </div>
      <h1 className="font-bold text-gray-900 text-xl tracking-tight">
        Masuk untuk membuka profil
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-gray-500 text-xs leading-relaxed">
        Lihat riwayat wakaf, total zakat, sertifikat digital, dan kumpulkan XP
        Berkah di akun Anda.
      </p>
      <Button
        asChild
        className="mt-6 rounded-2xl bg-[#00AB55] hover:bg-[#009248]"
      >
        <Link
          search={(previous) => ({ ...previous, redirect: '/profil' })}
          to="/auth/login"
        >
          Masuk Sekarang
        </Link>
      </Button>
    </section>
  );
}
