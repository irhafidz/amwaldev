import { createFileRoute } from '@tanstack/react-router';
import { RoleMatrixView } from '@/components/admin/role-matrix-view';

export const Route = createFileRoute('/admin/roles')({
  component: () => <RoleMatrixView />,
});
