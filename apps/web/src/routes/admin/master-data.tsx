import { createFileRoute } from '@tanstack/react-router';
import { MasterDataManagementView } from '@/components/admin/master-data-management-view';

export const Route = createFileRoute('/admin/master-data')({
  component: () => <MasterDataManagementView />,
});
