import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { QurbanOrderStatusView } from '@/components/qurban/qurban-order-status';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/qurban/status')({
  validateSearch: z.object({
    // Order IDs are 12-digit numerics; the default search parser would
    // otherwise coerce them to numbers.
    orderId: z.coerce.string().optional(),
  }),
  component: QurbanStatusPage,
});

function QurbanStatusPage() {
  const { user } = Route.useRouteContext();
  const { orderId } = Route.useSearch();

  return (
    <UserShell showNav={false} user={user}>
      <QurbanOrderStatusView orderId={orderId} />
    </UserShell>
  );
}
