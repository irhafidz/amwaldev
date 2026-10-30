import { createFileRoute } from '@tanstack/react-router';
import { InfaqView } from '@/components/infaq/infaq-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/infaq/')({
  component: InfaqPage,
});

function InfaqPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell showNav={false} user={user}>
      <InfaqView user={user} />
    </UserShell>
  );
}
