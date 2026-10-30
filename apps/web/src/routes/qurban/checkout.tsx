import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { QurbanCheckout } from '@/components/qurban/qurban-checkout';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/qurban/checkout')({
  validateSearch: z.object({
    // Batch IDs may be numeric-looking; keep them as strings.
    batchId: z.coerce.string().optional(),
  }),
  component: QurbanCheckoutPage,
});

function QurbanCheckoutPage() {
  const { user } = Route.useRouteContext();
  const { batchId } = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <QurbanCheckout batchId={batchId} user={user} />
    </UserShell>
  );
}
