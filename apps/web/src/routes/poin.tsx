import { createFileRoute } from '@tanstack/react-router';
import { PointsBerkahView } from '@/components/dashboard/points-berkah-view';
import { UserShell } from '@/components/user-shell';
import { requireSession } from '@/lib/auth/require-session';

export const Route = createFileRoute('/poin')({
  beforeLoad: requireSession,
  component: PointsPage,
});

/**
 * `/poin` (`I-10c`) — real balance, ledger, daily check-in, and responsive desktop layout.
 */
function PointsPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <PointsBerkahView />
    </UserShell>
  );
}
