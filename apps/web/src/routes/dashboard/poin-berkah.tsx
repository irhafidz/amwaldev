import { createFileRoute } from '@tanstack/react-router';
import { PointsBerkahView } from '@/components/dashboard/points-berkah-view';
import { UserShell } from '@/components/user-shell';
import { requireSession } from '@/lib/auth/require-session';

export const Route = createFileRoute('/dashboard/poin-berkah')({
  beforeLoad: requireSession,
  component: PointsBerkahPage,
});

function PointsBerkahPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <PointsBerkahView />
    </UserShell>
  );
}
