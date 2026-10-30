'use client';

import { useLocation } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { BackofficeHeader } from './backoffice-header';
import { BackofficeSidebar } from './backoffice-sidebar';
import { FixedMosaicBackground } from './mosaic-accent';

interface BackofficeShellProps {
  role: string;
  userName: string;
  children: ReactNode;
}

/**
 * Backoffice frame ported 1:1 from `amwalheti/components/backoffice/
 * backoffice-shell.tsx`. Differences from the legacy version:
 *  - `usePathname()` → `useLocation()` (TanStack Router)
 *  - `motion/react` fade → `key` + `animate-in fade-in` from tw-animate-css
 *    (the legacy `<AnimatePresence>` around the backdrop carried no motion
 *    props, so a plain conditional is exactly equivalent)
 *  - no local `ToastProvider` — the root document already mounts one
 */
export function BackofficeShell({
  role,
  userName,
  children,
}: BackofficeShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="relative isolate flex min-h-screen w-full bg-[#F2F6F4] font-jakarta antialiased">
      <FixedMosaicBackground />
      <BackofficeSidebar
        mobileOpen={mobileOpen}
        role={role}
        setMobileOpen={setMobileOpen}
        userName={userName}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip">
        <BackofficeHeader
          onToggleMobileMenu={() => setMobileOpen((prev) => !prev)}
          role={role}
          userName={userName}
        />

        <main
          className="fade-in w-full flex-1 animate-in space-y-6 px-4 py-4 duration-200 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
          key={pathname}
        >
          {children}
        </main>

        <footer className="mt-auto border-[#356152]/15 border-t bg-white/80 px-6 py-4 text-center text-slate-500 text-xs backdrop-blur-sm">
          <div className="flex w-full flex-col items-center justify-between gap-2 sm:flex-row">
            <p className="font-semibold text-[#356152]">
              Amwal © 2026 — Islamic Social Finance Platform (Super Admin,
              Nazhir Wakaf, Amil ZISWAF)
            </p>
            <p className="text-[11px] text-slate-400">
              Otoritas Tunggal Internal Super Admin • Terakreditasi BWI & BAZNAS
              RI
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
