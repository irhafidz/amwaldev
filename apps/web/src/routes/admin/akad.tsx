import { createFileRoute } from '@tanstack/react-router';
import { AkadManagementView } from '@/components/admin/akad/akad-management-view';

export const Route = createFileRoute('/admin/akad')({
  component: AkadManagementView,
});
