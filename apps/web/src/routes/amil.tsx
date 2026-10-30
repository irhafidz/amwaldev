import { createFileRoute, redirect } from '@tanstack/react-router';
import { OfflineZakatView } from '@/components/amil/offline-zakat-view';

/**
 * Amil offline-entry area — reached from the backoffice role switcher.
 * Guarded to ADMIN / PETUGAS_LAPANGAN (the two roles that perform offline
 * collection; there is no separate AMIL role, see AI_RULES §4). The server
 * enforces the same via requireAnyRole on POST /api/amil/offline-zakat.
 */
export const Route = createFileRoute('/amil')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({
        to: '/auth/login',
        search: { redirect: location.href },
      });
    }
    if (
      context.user.role !== 'ADMIN' &&
      context.user.role !== 'PETUGAS_LAPANGAN'
    ) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: OfflineZakatView,
});
