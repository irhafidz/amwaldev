import { createFileRoute } from '@tanstack/react-router';
import { AdminGuideView } from '@/components/admin/admin-guide-view';

export const Route = createFileRoute('/admin/panduan')({
  component: AdminGuideView,
});
