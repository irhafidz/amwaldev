import { createFileRoute } from '@tanstack/react-router';
import { DashboardHome } from '@/components/dashboard/dashboard-home';
import { UserShell } from '@/components/user-shell';

/**
 * Public feed — no auth guard. Guests browse the catalog freely; the top
 * app bar's own guest/signed-in branching (`UserShell`'s `TopAppBar`) is
 * what shows "Masuk" vs the profile avatar, not a route-level redirect.
 */
export const Route = createFileRoute('/')({
  component: RootPage,
});

function RootPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <DashboardHome user={user} />
    </UserShell>
  );
}
