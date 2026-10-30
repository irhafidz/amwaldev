import { createFileRoute } from '@tanstack/react-router';
import { TermsModalView } from '@/components/auth/terms-modal-view';

export const Route = createFileRoute('/syarat-ketentuan')({
  component: SyaratKetentuanPage,
});

function SyaratKetentuanPage() {
  return <TermsModalView />;
}
