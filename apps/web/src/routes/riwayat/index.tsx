import { createFileRoute } from '@tanstack/react-router';
import { TransactionHistory } from '@/components/history/transaction-history';
import { UserShell } from '@/components/user-shell';

export const Route = createFileRoute('/riwayat/')({
  component: RiwayatIndexPage,
});

function RiwayatIndexPage() {
  const { user } = Route.useRouteContext();

  return (
    <UserShell
      outerClassName="selection:bg-[#356152] selection:text-white"
      user={user}
    >
      <TransactionHistory user={user} />
    </UserShell>
  );
}
