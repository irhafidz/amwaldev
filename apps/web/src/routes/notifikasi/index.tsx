import { createFileRoute } from '@tanstack/react-router';
import { NotificationsView } from '@/components/user-area/notifications-view';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/notifikasi/')({
  component: NotifikasiIndexPage,
});

function NotifikasiIndexPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      user={user}
    >
      <NotificationsView user={user} />
    </UserShell>
  );
}
