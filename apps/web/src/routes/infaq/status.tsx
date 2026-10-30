import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { InfaqOrderStatusView } from '@/components/infaq/infaq-order-status';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/infaq/status')({
  validateSearch: z.object({
    // Order IDs are 12-digit numerics; the default search parser would
    // otherwise coerce them to numbers.
    orderId: z.coerce.string().optional(),
  }),
  component: InfaqStatusPage,
});

function InfaqStatusPage() {
  const { user } = Route.useRouteContext();
  const { orderId } = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <InfaqOrderStatusView orderId={orderId} />
    </UserShell>
  );
}
