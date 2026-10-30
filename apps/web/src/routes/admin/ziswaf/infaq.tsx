import { createFileRoute } from '@tanstack/react-router';
import { InfaqModuleView } from '@/components/admin/infaq-module-view';

export const Route = createFileRoute('/admin/ziswaf/infaq')({
  component: InfaqModuleView,
});
