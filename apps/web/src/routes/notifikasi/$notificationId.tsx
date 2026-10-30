import { createFileRoute } from '@tanstack/react-router';
import { NotificationDetailView } from '@/components/user-area/notification-detail-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/notifikasi/$notificationId')({
  component: NotificationDetailPage,
});

function NotificationDetailPage() {
  const { user } = Route.useRouteContext();
  const { notificationId } = Route.useParams();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      showNav={false}
      user={user}
    >
      <NotificationDetailView notificationId={notificationId} user={user} />
    </UserShell>
  );
}
