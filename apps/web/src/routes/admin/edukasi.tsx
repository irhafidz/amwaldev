import { createFileRoute } from '@tanstack/react-router';
import { EducationManagementView } from '@/components/admin/education-management-view';

/**
 * `?kategori=artikel|video` membuka pengelola kategori edukasi pada tab itu;
 * dipakai pintasan di halaman Master Data.
 */
export const Route = createFileRoute('/admin/edukasi')({
  validateSearch: (search: Record<string, unknown>) => ({
    kategori:
      search.kategori === 'artikel' || search.kategori === 'video'
        ? (search.kategori as 'artikel' | 'video')
        : undefined,
  }),
  component: EducationManagementView,
});
