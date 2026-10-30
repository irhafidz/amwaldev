import { createFileRoute } from '@tanstack/react-router';
import { DashboardHome } from '@/components/dashboard/dashboard-home';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/dashboard/')({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <DashboardHome user={user} />
    </UserShell>
  );
}
