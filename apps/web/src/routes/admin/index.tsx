import { createFileRoute } from '@tanstack/react-router';
import { AdminOverviewView } from '@/components/admin/overview-view';

export const Route = createFileRoute('/admin/')({
  component: AdminOverviewView,
});
