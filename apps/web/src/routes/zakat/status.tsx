import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { UserShell } from '@/components/user-shell';
import { ZakatOrderStatusView } from '@/components/zakat/zakat-order-status';

export const Route = createFileRoute('/zakat/status')({
  validateSearch: z.object({
    // Order IDs are 12-digit numerics; the default search parser would
    // otherwise coerce them to numbers.
    orderId: z.coerce.string().optional(),
  }),
  component: ZakatStatusPage,
});

function ZakatStatusPage() {
  const { user } = Route.useRouteContext();
  const { orderId } = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <ZakatOrderStatusView orderId={orderId} />
    </UserShell>
  );
}
