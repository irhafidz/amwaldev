import { createFileRoute } from '@tanstack/react-router';
import { UserShell } from '@/components/user-shell';
import { WaqfDonorsView } from '@/components/wakaf/waqf-donors-view';

export const Route = createFileRoute('/wakaf/$programId/donatur')({
  component: WaqfDonorsPage,
});

function WaqfDonorsPage() {
  const { programId } = Route.useParams();
  const { user } = Route.useRouteContext();

  return (
    <UserShell frame="catalog" showNav={false} user={user}>
      <WaqfDonorsView programId={programId} user={user} />
    </UserShell>
  );
}
