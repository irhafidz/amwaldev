import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireSession } from '@/lib/auth/require-session';

export const Route = createFileRoute('/riwayat')({
  beforeLoad: requireSession,
  component: RiwayatLayout,
});

/**
 * Pathless shell for the `/riwayat` branch so `$transactionId` (detail) can
 * mount as a sibling of the history list.
 */
function RiwayatLayout() {
  return <Outlet />;
}
