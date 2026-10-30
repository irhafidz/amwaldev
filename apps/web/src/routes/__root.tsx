import type { I18n } from '@lingui/core';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  retainSearchParams,
  Scripts,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { z } from 'zod';
import { ToastProvider } from '../components/ui/toast';
import { fetchSessionUser } from '../lib/auth/session';
import { getSessionUserCached } from '../lib/auth/session-cache';
import type { SessionUser } from '../lib/auth/types';
import TanStackQueryLayout from '../lib/tanstack-query/layout';
import { applyDarkMode, isDarkModeStored } from '../lib/theme';
import appCss from '../styles/globals.css?url';

type User = SessionUser | null;

interface MyRouterContext {
  queryClient: QueryClient;
  i18n: I18n;
  user: User;
}

const rootSearchSchema = z.object({
  locale: z
    .string()
    .optional()
    .refine((val) => !val || ['en', 'id'].includes(val), {
      message: 'Invalid locale',
    }),
});

export const Route = createRootRouteWithContext<MyRouterContext>()({
  validateSearch: rootSearchSchema,
  /**
   * Seeds the router context with the real session so every screen (top app
   * bar, profile, riwayat, redirects) sees a signed-in user. Replaces the
   * hard-coded `user: null` that kept the whole app in guest mode.
   */
  beforeLoad: async () => ({
    user: await getSessionUserCached(() => fetchSessionUser()),
  }),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Amwal — Platform Wakaf, Zakat & Qurban',
      },
      {
        name: 'theme-color',
        content: '#356152',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),

  search: {
    middlewares: [retainSearchParams(['locale'])],
  },

  shellComponent: RootDocument,
});

function RootDocument() {
  const { i18n } = Route.useRouteContext();

  useEffect(() => {
    applyDarkMode(isDarkModeStored());
  }, []);

  return (
    <html lang={i18n.locale}>
      {/** biome-ignore lint/style/noHeadElement: need for TanStack Start */}
      <head>
        <HeadContent />
      </head>
      <body>
        <ToastProvider>
          <Outlet />
          <TanStackRouterDevtools />
          <TanStackQueryLayout />
          <Scripts />
        </ToastProvider>
      </body>
    </html>
  );
}
