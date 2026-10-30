import { createFileRoute } from '@tanstack/react-router';
import { QurbanCatalog } from '@/components/qurban/qurban-catalog';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/qurban/')({
  component: QurbanIndexPage,
});

function QurbanIndexPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell user={user}>
      <QurbanCatalog />
    </UserShell>
  );
}
