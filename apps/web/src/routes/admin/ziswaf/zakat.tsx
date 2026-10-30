import { createFileRoute } from '@tanstack/react-router';
import { ZakatModuleView } from '@/components/admin/zakat-module-view';

export const Route = createFileRoute('/admin/ziswaf/zakat')({
  component: ZakatModuleView,
});
