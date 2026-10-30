import { createFileRoute } from '@tanstack/react-router';
import { UserShell } from '@/components/user-shell';
import { WaqfCatalog } from '@/components/wakaf/waqf-catalog';

export const Route = createFileRoute('/wakaf/')({
  component: WakafIndexPage,
});

function WakafIndexPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell frame="catalog" user={user}>
      <WaqfCatalog />
    </UserShell>
  );
}
