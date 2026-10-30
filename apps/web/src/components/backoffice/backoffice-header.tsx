'use client';

import { Link, useLocation } from '@tanstack/react-router';
import { Bell, BookOpen, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import authClient from '@/lib/auth/auth-client';
import { MosaicHeaderAccent } from './mosaic-accent';

interface BackofficeHeaderProps {
  breadcrumbTitle?: string;
  role?: string;
  userName?: string;
  onToggleMobileMenu?: () => void;
}

/** Both spellings of the Nazhir portal path resolve to the same work area. */
function isNazhirArea(pathname: string): boolean {
  return pathname.startsWith('/nadzir') || pathname.startsWith('/nazhir');
}

function resolveRoleChrome(pathname: string): { pill: string; label: string } {
  if (isNazhirArea(pathname)) {
    return {
      pill: 'border-teal-200/80 bg-teal-50 text-teal-800',
      label: 'Nazhir Wakaf (Pengelola)',
    };
  }
  if (pathname.startsWith('/amil')) {
    return {
      pill: 'border-amber-200/80 bg-amber-50 text-amber-900',
      label: 'Amil ZISWAF (Pengelola)',
    };
  }
  return {
    pill: 'border-[#356152]/25 bg-[#356152]/10 text-[#356152]',
    label: 'Super Admin (Badan Pengawas)',
  };
}

const ADMIN_PAGE_TITLES: Record<string, string> = {
  '/admin': 'Ringkasan Utama & Analitik RFM-D',
  '/admin/approvals': 'Pusat Persetujuan & Verifikasi Terpadu',
  '/admin/nadzir-verifikasi': 'Verifikasi & Pendaftaran Lembaga Nazhir (BWI)',
  '/admin/wakaf': 'Manajemen Program Wakaf & Progres Fisik',
  '/admin/ziswaf/infaq': 'Infaq & Sedekah — Kategori & Transaksi',
  '/admin/ziswaf/zakat': 'Zakat & 8 Asnaf — Kalkulator & Penyaluran',
  '/admin/ziswaf/qurban': 'Pengelolaan Qurban, Patungan 1/7 & RPH',
  '/admin/segmentasi': 'Kelompok Donatur — Segmentasi RFM-D',
  '/admin/kesetiaan': 'Kesetiaan Donatur — Retensi & Heatmap M+1',
  '/admin/transparansi': 'Catatan Transparansi & Log Realisasi Dana',
  '/admin/edukasi': 'Edukasi & Berita — Manajemen Edukasi',
  '/admin/berita': 'Edukasi & Berita — Manajemen Berita & Kegiatan',
  '/admin/dokumen': 'Dokumen Legalitas & Arsip SK / AIW',
  '/admin/master-data': 'Master Data — Akad & Kategori Waqaf',
  '/admin/notifikasi': 'Manajemen Notifikasi Pengguna',
  '/admin/pengaturan': 'Pengaturan Konfigurasi Platform',
  '/admin/panduan': 'Panduan Operasional Admin',
};

export function BackofficeHeader({
  breadcrumbTitle,
  role = 'ADMIN',
  userName = 'Super Admin BWI',
  onToggleMobileMenu,
}: BackofficeHeaderProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const isSuperAdmin = role === 'ADMIN';

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (
        notificationRef.current &&
        !notificationRef.current.contains(target)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
    if (breadcrumbTitle) {
      return breadcrumbTitle;
    }
    if (!isSuperAdmin) {
      return 'Portofolio Wakaf Amwal';
    }
    return ADMIN_PAGE_TITLES[pathname] ?? 'Tata Kelola Platform Amwal';
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch {
      // navigate regardless of server outcome
    } finally {
      window.location.assign('/auth/login');
    }
  };

  const userInitial = userName.trim().charAt(0).toUpperCase() || 'S';
  const roleChrome = resolveRoleChrome(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 min-h-[64px] w-full items-center justify-between overflow-visible border-[#356152]/20 border-b bg-gradient-to-r from-white via-white to-[#356152]/[0.08] px-6 font-jakarta shadow-[0_1px_0_0_rgba(53,97,82,0.06)] backdrop-blur-md sm:px-8">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-[#356152]"
      />
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <MosaicHeaderAccent />
      </div>
      {/* Left: Mobile Toggle & Breadcrumb */}
      <div className="relative flex min-w-0 items-center gap-3">
        {onToggleMobileMenu && (
          <button
            aria-label="Buka Menu"
            className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            onClick={onToggleMobileMenu}
            type="button"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="truncate font-extrabold text-[#356152] text-sm leading-tight sm:text-base">
            {isSuperAdmin ? 'Super Admin' : 'Portal Nazhir'}
            <span className="mx-1.5 font-normal text-[#356152]/40">›</span>
            <span className="font-bold text-[#244438]">{getPageTitle()}</span>
          </h1>
          <div className="mt-0.5 hidden items-center gap-1.5 truncate text-[11px] text-slate-500 sm:flex">
            <span>Platform Islamic Social Finance</span>
            <span>•</span>
            <span className="font-semibold text-[#356152]">
              {isSuperAdmin
                ? 'Badan Pengawas Platform Amwal & BWI Hub'
                : 'Mitra Nazhir Platform Amwal'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Role Badge + Notifications + Profile */}
      <div className="relative mr-1 flex shrink-0 items-center gap-3">
        {/* Role Badge (read-only, dropdown switcher removed) */}
        <span
          className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-bold text-xs ${roleChrome.pill}`}
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span>{roleChrome.label}</span>
        </span>

        {isSuperAdmin && (
          <Link
            aria-label="Panduan operasional admin"
            className="hidden items-center gap-1.5 rounded-full border border-[#356152]/30 bg-white px-3 py-1.5 font-semibold text-[#356152] text-xs transition hover:bg-[#356152]/10 sm:flex"
            to="/admin/panduan"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Panduan
          </Link>
        )}

        {/* Notification Bell */}
        <div className="relative shrink-0" ref={notificationRef}>
          <button
            aria-label="Notifikasi"
            className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100"
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowProfileMenu(false);
            }}
            type="button"
          >
            <Bell className="h-5 w-5 min-w-[20px] shrink-0 text-[#356152]" />
          </button>

          {showNotifications && (
            <div className="fade-in slide-in-from-top-2 absolute right-0 z-50 mt-2 w-80 animate-in rounded-2xl border border-slate-200 bg-white py-3 shadow-xl duration-150">
              <div className="flex items-center justify-between border-slate-100 border-b px-4 pb-2">
                <span className="font-bold text-slate-900 text-xs">
                  Log Audit & Notifikasi
                </span>
                <span className="font-bold text-[10px] text-slate-400">
                  PRATINJAU
                </span>
              </div>
              {/*
                The legacy prototype hardcoded three fake audit entries here.
                They are NOT ported — a real feed lands with S10-N-12. Showing
                an honest empty state instead (AMW-10 / AMW-11).
              */}
              <div className="px-4 py-8 text-center text-slate-400 text-xs">
                Pusat notifikasi aktif setelah endpoint notifikasi real-time
                tersedia (Batch 3 / S10-N-12).
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative shrink-0" ref={profileMenuRef}>
          <button
            aria-label="Menu Profil"
            className="flex h-8 w-8 min-w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#356152] font-bold text-white text-xs shadow-xs ring-2 ring-[#356152]/20 transition-opacity hover:opacity-90"
            onClick={() => {
              setShowProfileMenu((prev) => !prev);
              setShowNotifications(false);
            }}
            type="button"
          >
            {userInitial}
          </button>

          {showProfileMenu && (
            <div className="fade-in slide-in-from-top-2 absolute right-0 z-50 mt-2 w-72 animate-in rounded-2xl border border-slate-200 bg-white py-3 shadow-xl duration-150">
              <div className="space-y-0.5 border-slate-100 border-b px-5 py-2">
                <div className="font-bold text-slate-900 text-xs">
                  {userName}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {isSuperAdmin
                    ? 'Peran: Super Admin (Badan Pengawas Amwal & BWI)'
                    : 'Peran: Nazhir Wakaf (Mitra Pengelola Amwal)'}
                </div>
              </div>

              <div className="p-2">
                <button
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left font-bold text-rose-700 text-xs transition hover:bg-rose-50"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Keluar / Ganti Akun</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
