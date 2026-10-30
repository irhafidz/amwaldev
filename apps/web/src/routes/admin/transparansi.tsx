import { createFileRoute } from '@tanstack/react-router';
import { TransparencyView } from '@/components/admin/transparency-view';

export const Route = createFileRoute('/admin/transparansi')({
  component: TransparencyView,
});
