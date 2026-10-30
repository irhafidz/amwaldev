import { createFileRoute } from '@tanstack/react-router';
import { NewsManagementView } from '@/components/admin/news-management-view';

export const Route = createFileRoute('/admin/berita')({
  component: NewsManagementView,
});
