import { createFileRoute } from '@tanstack/react-router';
import { QurbanBatchDetailView } from '@/components/qurban/qurban-detail';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/qurban/$batchId')({
  component: QurbanDetailPage,
});

function QurbanDetailPage() {
  const { user } = Route.useRouteContext();
  const { batchId } = Route.useParams();

  return (
    <UserShell showNav={false} user={user}>
      <QurbanBatchDetailView batchId={batchId} />
    </UserShell>
  );
}
