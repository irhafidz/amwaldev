import { moduleFromOrderId } from '@amwal/core/payment/order-id';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { UserShell } from '@/components/user-shell';
import { WaqfOrderStatusView } from '@/components/wakaf/waqf-order-status';

/**
 * Tautan status tunggal untuk semua modul (QA-03, D2): kode transaksi yang
 * disalin donatur selalu `/transaksi/<orderId>`. Wakaf tampil di sini; infaq,
 * zakat, dan qurban diteruskan ke halaman status modulnya.
 */
const MODULE_STATUS_PATH = {
  INFAQ: '/infaq/status',
  ZAKAT: '/zakat/status',
  QURBAN: '/qurban/status',
} as const;

export const Route = createFileRoute('/transaksi/$orderId')({
  beforeLoad: ({ params }) => {
    const module = moduleFromOrderId(params.orderId);
    if (module && module !== 'WAQF') {
      throw redirect({
        replace: true,
        to: MODULE_STATUS_PATH[module],
        search: { orderId: params.orderId },
      });
    }
  },
  component: TransaksiOrderPage,
});

function TransaksiOrderPage() {
  const { user } = Route.useRouteContext();
  const { orderId } = Route.useParams();

  return (
    <UserShell showNav={false} user={user}>
      <WaqfOrderStatusView orderId={orderId} />
    </UserShell>
  );
}
