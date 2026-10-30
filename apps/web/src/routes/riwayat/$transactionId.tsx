import { createFileRoute } from '@tanstack/react-router';
import { TransactionDetailView } from '@/components/history/transaction-detail';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/riwayat/$transactionId')({
  component: TransactionDetailPage,
});

function TransactionDetailPage() {
  const { user } = Route.useRouteContext();
  const { transactionId } = Route.useParams();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      showNav={false}
      user={user}
    >
      <TransactionDetailView transactionId={transactionId} user={user} />
    </UserShell>
  );
}
