'use client';

import { Link } from '@tanstack/react-router';
import { Bell, LogIn, LogOut, Search, User } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { FloatingChatWidget } from '@/components/chat/floating-chat-widget';
import { DesktopSidebar } from '@/components/desktop-sidebar';
import authClient from '@/lib/auth/auth-client';
import type { SessionUser } from '@/lib/auth/types';
import { cn } from '@/lib/utils';
import { BottomNav } from './bottom-nav';

export type FrameVariant = 'app' | 'appMuted' | 'catalog';

interface UserShellProps {
  /** Screen header + main content, rendered as direct flex children. */
  children: ReactNode;
  user: SessionUser | null;
  showNav?: boolean;
  /** Mobile-only top app bar (search, bell, profile menu). */
  topBar?: boolean;
  frame?: FrameVariant;
  outerClassName?: string;
}

/**
 * Responsive Application Shell:
 * - Desktop (>= md): Persistent left sidebar navigation (256px) + responsive wide canvas
 * - Mobile (< md): Full-width mobile layout with bottom navigation bar
 */
export function UserShell({
  children,
  user,
  showNav = true,
  topBar = false,
  frame: _frame = 'app',
  outerClassName,
}: UserShellProps) {
  return (
    <div
      className={cn(
        'min-h-screen bg-[#F8FAFC] font-jakarta antialiased dark:bg-slate-950',
        outerClassName
      )}
    >
      <DesktopSidebar user={user} />

      <div className="flex min-h-screen flex-col md:pl-64">
        {topBar && (
          <div className="md:hidden">
            <TopAppBar isLoggedIn={Boolean(user)} />
          </div>
        )}

        <div className="flex w-full min-w-0 flex-1 flex-col px-4 py-4 pb-24 md:px-[28px] md:py-[24px] md:pb-8">
          {children}
        </div>
      </div>

      {showNav && <BottomNav />}
      <FloatingChatWidget user={user} />
    </div>
  );
}

/**
 * Mobile top app bar: search field, notification bell, and either a
 * profile dropdown (signed in) or a "Masuk" button (guest).
 */
function TopAppBar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Signing out should still navigate even if the server call fails.
    } finally {
      setIsMenuOpen(false);
      window.location.assign('/auth/login');
    }
  };

  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between gap-3 border-gray-100 border-b bg-white px-4 py-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="relative flex flex-1 items-center">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 z-10 shrink-0 text-gray-400"
          size={16}
        />
        <input
          aria-label="Cari program"
          className="w-full rounded-2xl border border-transparent bg-[#e2ece8]/50 py-2 pr-3 pl-9 font-jakarta text-gray-900 text-xs transition-all placeholder:text-gray-400 hover:bg-[#e2ece8]/70 focus:border-[#356152] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356152]/20 dark:bg-slate-800 dark:text-white"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Cari program..."
          type="text"
          value={searchQuery}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          aria-label="Notifikasi"
          className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-gray-200/80 bg-gray-50 text-gray-600 transition-all hover:bg-gray-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          to="/notifikasi"
        >
          <Bell
            aria-hidden="true"
            className="shrink-0 text-gray-700 dark:text-slate-300"
            size={16}
          />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
        </Link>

        {isLoggedIn ? (
          <div className="relative" ref={dropdownRef}>
            <button
              aria-label="Profil Pengguna"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-[#356152] to-emerald-600 font-bold text-white text-xs shadow-xs ring-2 ring-[#356152]/20 transition-all hover:ring-[#356152]/50 active:scale-95"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              type="button"
            >
              <User
                aria-hidden="true"
                className="shrink-0 text-white"
                size={16}
                strokeWidth={2.5}
              />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-44 rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <Link
                  className="flex items-center gap-2.5 px-3.5 py-2.5 font-medium text-gray-700 text-xs transition-colors hover:bg-emerald-50 hover:text-[#356152] dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
                  onClick={() => setIsMenuOpen(false)}
                  to="/profil"
                >
                  <User
                    aria-hidden="true"
                    className="text-gray-500"
                    size={15}
                  />
                  <span>Profil Saya</span>
                </Link>

                <div className="my-1 border-gray-100 border-t dark:border-slate-800" />

                <button
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left font-medium text-rose-600 text-xs transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogOut
                    aria-hidden="true"
                    className="text-rose-500"
                    size={15}
                  />
                  <span>Keluar (Logout)</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            className="flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#356152] px-3.5 font-semibold text-white text-xs shadow-xs transition-all hover:bg-[#2b4f43] active:scale-95"
            to="/auth/login"
          >
            <LogIn
              aria-hidden="true"
              className="shrink-0 text-white"
              size={15}
            />
            <span>Masuk</span>
          </Link>
        )}
      </div>
    </header>
  );
}
