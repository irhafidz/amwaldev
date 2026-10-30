import { createFileRoute } from '@tanstack/react-router';
import { QurbanModuleView } from '@/components/admin/qurban-module-view';

export const Route = createFileRoute('/admin/ziswaf/qurban')({
  component: QurbanModuleView,
});
