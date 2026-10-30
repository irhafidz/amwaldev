'use client';

import { Link, useLocation } from '@tanstack/react-router';
import {
  Bell,
  BookOpen,
  Calculator,
  HandHeart,
  HeartHandshake,
  History,
  Home,
  Landmark,
  LogIn,
  LogOut,
  Newspaper,
  User,
} from 'lucide-react';
import { type ElementType, useEffect, useState } from 'react';
import { getUserProfile } from '@/lib/amwal-api/user';
import authClient from '@/lib/auth/auth-client';
import type { SessionUser } from '@/lib/auth/types';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  to: string;
  icon: ElementType;
  matchPaths: string[];
}

const SIDEBAR_NAV_ITEMS: NavItem[] = [
  {
    name: 'Beranda',
    to: '/dashboard',
    icon: Home,
    matchPaths: ['/dashboard', '/'],
  },
  {
    name: 'Wakaf',
    to: '/wakaf',
    icon: Landmark,
    matchPaths: ['/wakaf'],
  },
  {
    name: 'Infaq',
    to: '/infaq',
    icon: HandHeart,
    matchPaths: ['/infaq'],
  },
  {
    name: 'Zakat',
    to: '/zakat/kalkulator',
    icon: Calculator,
    matchPaths: ['/zakat'],
  },
  {
    name: 'Qurban',
    to: '/qurban',
    icon: HeartHandshake,
    matchPaths: ['/qurban'],
  },
  {
    name: 'Riwayat',
    to: '/riwayat',
    icon: History,
    matchPaths: ['/riwayat'],
  },
  {
    name: 'Edukasi',
    to: '/edukasi',
    icon: BookOpen,
    matchPaths: ['/edukasi'],
  },
  {
    name: 'Berita',
    to: '/berita',
    icon: Newspaper,
    matchPaths: ['/berita'],
  },
  {
    name: 'Notifikasi',
    to: '/notifikasi',
    icon: Bell,
    matchPaths: ['/notifikasi'],
  },
  {
    name: 'Profil',
    to: '/profil',
    icon: User,
    matchPaths: ['/profil'],
  },
];

function isItemActive(pathname: string, matchPaths: string[]): boolean {
  if (
    matchPaths.includes('/dashboard') &&
    (pathname === '/dashboard' || pathname === '/')
  ) {
    return true;
  }
  return matchPaths.some((p) => p !== '/' && pathname.startsWith(p));
}

const WHITESPACE_REGEX = /\s+/;

function getInitials(name: string): string {
  const parts = name.trim().split(WHITESPACE_REGEX).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase();
  }
  if (parts.length === 1 && (parts[0]?.length ?? 0) >= 2) {
    return (parts[0]?.slice(0, 2) ?? 'BA').toUpperCase();
  }
  return (name.slice(0, 2) || 'BA').toUpperCase();
}

interface DesktopSidebarProps {
  user: SessionUser | null;
}

export function DesktopSidebar({ user }: DesktopSidebarProps) {
  const { pathname } = useLocation();

  const [profileData, setProfileData] = useState<{
    name?: string;
    email?: string | null;
  } | null>(() => {
    if (user?.name) {
      return { name: user.name, email: user.email };
    }
    return null;
  });

  useEffect(() => {
    if (!user) {
      setProfileData(null);
      return;
    }

    if (user.name) {
      setProfileData({ name: user.name, email: user.email });
    }

    let isMounted = true;
    getUserProfile()
      .then((res) => {
        if (isMounted && res?.user) {
          setProfileData({
            name: res.user.name,
            email: res.user.email,
          });
        }
      })
      .catch(() => {
        // Fallback to user prop if getUserProfile fails
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Signing out should still navigate even if the server call fails.
    } finally {
      window.location.assign('/auth/login');
    }
  };

  const effectiveName = profileData?.name || user?.name || '';
  const effectiveEmail = profileData?.email || user?.email || '';
  const isAuthenticated = Boolean(user || effectiveName);
  const initials = getInitials(effectiveName || 'BA');

  return (
    <aside
      aria-label="Sidebar Navigasi Desktop"
      className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-gray-200/80 border-r bg-white md:flex dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Brand Logo Header */}
      <div className="flex h-16 shrink-0 items-center border-gray-100 border-b px-6 dark:border-slate-800">
        <Link
          aria-label="Beranda Amwal"
          className="flex items-center"
          to="/dashboard"
        >
          {/** biome-ignore lint/performance/noImgElement: official Amwal branding */}
          <img
            alt="Amwal Logo"
            className="h-8 w-auto object-contain"
            height={32}
            src="/assets/images/amwal-logo-color-h.png"
            width={120}
          />
        </Link>
      </div>

      {/* Navigation Links */}
      <nav
        aria-label="Menu Utama"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {SIDEBAR_NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.matchPaths);
          const Icon = item.icon;

          return (
            <Link
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-medium text-sm transition-all',
                active
                  ? 'border-[#356152] border-r-3 bg-[#f2f6f4] font-semibold text-[#356152] dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              )}
              key={item.to}
              to={item.to}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'size-5 shrink-0 transition-colors',
                  active
                    ? 'text-[#356152] dark:text-emerald-400'
                    : 'text-gray-400 group-hover:text-gray-600 dark:text-slate-500'
                )}
              />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User / Auth Bottom Section */}
      <div className="shrink-0 border-gray-100 border-t p-4 dark:border-slate-800">
        {isAuthenticated ? (
          <div className="flex items-center justify-between gap-3">
            <Link
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800"
              to="/profil"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e2ece8] font-bold text-[#356152] text-sm dark:bg-emerald-950 dark:text-emerald-300">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900 text-sm dark:text-white">
                  {effectiveName || 'Hamba Allah'}
                </p>
                {effectiveEmail ? (
                  <p className="truncate text-gray-400 text-xs">
                    {effectiveEmail}
                  </p>
                ) : null}
              </div>
            </Link>

            <button
              aria-label="Keluar dari akun"
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              onClick={handleLogout}
              title="Keluar"
              type="button"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        ) : (
          <Link
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-4 py-2.5 font-semibold text-sm text-white shadow-xs transition-colors hover:bg-[#2b4f43] active:scale-95"
            to="/auth/login"
          >
            <LogIn aria-hidden="true" size={16} />
            <span>Masuk / Daftar</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
