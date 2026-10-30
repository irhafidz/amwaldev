import { createFileRoute, Outlet } from '@tanstack/react-router';
import { requireSession } from '@/lib/auth/require-session';

export const Route = createFileRoute('/notifikasi')({
  beforeLoad: requireSession,
  component: NotifikasiLayout,
});

/**
 * Pathless shell for the `/notifikasi` branch so `$notificationId` (detail) can
 * mount as a sibling of the notifications list.
 */
function NotifikasiLayout() {
  return <Outlet />;
}
