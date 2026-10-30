import type { ReactNode } from 'react';
import { AuthDesktopHero } from './auth-desktop-hero';

interface AuthSplitLayoutProps {
  children: ReactNode;
  /** Optional custom class for the right-hand form container */
  containerClassName?: string;
}

/**
 * Responsive Split-Screen Layout for Desktop Auth Suite.
 * - Desktop (>= lg): 50% green brand hero on left, 50% centered form on right.
 * - Mobile (< lg): 1-column layout with centered brand logo.
 */
export const AuthSplitLayout = ({
  children,
  containerClassName = '',
}: AuthSplitLayoutProps) => {
  return (
    <div className="flex min-h-screen w-full flex-col bg-white font-jakarta antialiased lg:flex-row dark:bg-slate-950">
      {/* Left Column: Brand Hero for Desktop */}
      <AuthDesktopHero />

      {/* Right Column: Form Viewport (Flat clean canvas, no floating card) */}
      <main className="flex min-h-screen flex-1 flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 xl:px-16">
        <div className={`mx-auto w-full max-w-md ${containerClassName}`}>
          {/* Mobile-only logo display */}
          <div className="mb-8 flex justify-center lg:hidden">
            {/* biome-ignore lint/performance/noImgElement: TanStack Start has no next/image */}
            <img
              alt="Amwal Platform ZISWAF"
              className="h-9 w-auto object-contain"
              src="/assets/images/amwal-logo-color-h.png"
            />
          </div>

          {children}
        </div>
      </main>
    </div>
  );
};
