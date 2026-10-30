import { createFileRoute } from '@tanstack/react-router';
import { UsersManagementView } from '@/components/admin/users-management-view';

export const Route = createFileRoute('/admin/users')({
  component: () => <UsersManagementView />,
});
