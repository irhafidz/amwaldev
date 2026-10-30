import { createFileRoute } from '@tanstack/react-router';
import { NadzirDashboardView } from '@/components/nadzir/nadzir-dashboard-view';

export const Route = createFileRoute('/nadzir/dashboard')({
  component: NadzirDashboardView,
});
