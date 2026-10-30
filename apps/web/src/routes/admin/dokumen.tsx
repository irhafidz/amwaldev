import { createFileRoute } from '@tanstack/react-router';
import { DocumentsView } from '@/components/admin/documents-view';

export const Route = createFileRoute('/admin/dokumen')({
  component: DocumentsView,
});
