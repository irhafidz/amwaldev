import { createFileRoute } from '@tanstack/react-router';
import { NotificationsManagementView } from '@/components/admin/notifications-management-view';

export const Route = createFileRoute('/admin/notifikasi')({
  component: () => <NotificationsManagementView />,
});
