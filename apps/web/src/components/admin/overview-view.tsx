import { wibParts } from '@amwal/core/time/wib';
import { useNavigate } from '@tanstack/react-router';
import {
  Activity,
  BarChart2,
  Building2,
  ChevronRight,
  Layers,
  LayoutDashboard,
  PieChart as PieChartIcon,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { AdminPageHeader } from '@/components/admin/admin-primitives';
import {
  getAdminLedger,
  getAdminOverviewKpi,
  getAdminRfmSegments,
  getAnalyticsAccumulation,
  getAnalyticsComposition,
} from '@/lib/amwal-api/admin';
import {
  formatRupiah,
  formatRupiahCompact,
  toNumber,
} from '@/lib/amwal-api/format';
import { type ResourceState, useResource } from '@/lib/amwal-api/use-resource';
import { formatWibDateTime } from '@/lib/format-wib';

export interface AdminOverviewViewProps {
  onNavigateTab?: (tab: string) => void;
}

const SEGMENT_COLORS: Record<string, string> = {
  Champion: '#1B5E20',
  Loyal: '#2E7D32',
  New: '#4CAF50',
  'At-Risk': '#E65100',
  Lapsed: '#9E9E9E',
  Situational: '#90A4AE',
};

const MODULE_COLORS: Record<string, string> = {
  Wakaf: '#1B5E20',
  Zakat: '#2E7D32',
  Infaq: '#4CAF50',
  Sedekah: '#C8A415',
  Qurban: '#E65100',
};

const AKAD_LABELS: Record<string, string> = {
  WAKAF: 'Wakaf',
  ZAKAT: 'Zakat',
  INFAQ: 'Infaq',
  SEDEKAH: 'Sedekah',
  QURBAN: 'Qurban',
};

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agt',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  borderColor: '#cbd5e1',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: '600',
} as const;

type SegmentsState = ResourceState<
  Awaited<ReturnType<typeof getAdminRfmSegments>>
>;

const MONTH_LABEL = /^\d{4}-(\d{2})$/;

/** `2026-09` -> `Sep`; anything else (e.g. a day bucket) is shown as-is. */
function monthLabel(label: string): string {
  const month = MONTH_LABEL.exec(label)?.[1];
  return month ? (MONTH_SHORT[Number(month) - 1] ?? label) : label;
}

function SectionCard({
  icon,
  title,
  subtitle,
  className = '',
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-card ${className}`}
    >
      <div className="mb-4 border-slate-100 border-b pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-slate-200 border-dashed bg-slate-50 px-4 py-8 text-center text-slate-500 text-xs">
      {children}
    </p>
  );
}

/** Loading / error / content switch shared by every panel. */
function Resource<T>({
  state,
  reload,
  children,
}: {
  state: ResourceState<T>;
  reload: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') {
    return <EmptyNote>Memuat data...</EmptyNote>;
  }
  if (state.status === 'error') {
    return (
      <div
        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center"
        role="alert"
      >
        <p className="text-rose-700 text-xs">Gagal memuat data.</p>
        <button
          className="mt-2 cursor-pointer rounded-lg bg-rose-100 px-3 py-1.5 font-bold text-rose-800 text-xs hover:bg-rose-200"
          onClick={reload}
          type="button"
        >
          Coba Lagi
        </button>
      </div>
    );
  }
  return children(state.data);
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="font-bold text-[11px] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="mt-2 font-black text-2xl text-slate-900">{value}</div>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function KpiGrid({ segments }: { segments: SegmentsState }) {
  const kpi = useResource(getAdminOverviewKpi, { key: 'admin.overview.kpi' });

  const kpiData = kpi.state.status === 'success' ? kpi.state.data : null;
  const segmentData = segments.status === 'success' ? segments.data : null;
  const loading = '…';
  const lapsed = segmentData?.segmentCounts.Lapsed ?? 0;
  const activeDonors = segmentData ? segmentData.totalDonors - lapsed : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        hint="Σ transaksi berstatus lunas"
        icon={<Wallet size={14} />}
        label="Total Penghimpunan"
        value={kpiData ? formatRupiah(kpiData.totalFundsCollected) : loading}
      />
      <KpiCard
        hint={
          segmentData
            ? `dari ${segmentData.totalDonors.toLocaleString('id-ID')} donatur tercatat (tidak termasuk yang tidak aktif >180 hari)`
            : 'Donatur dengan donasi dalam 180 hari terakhir'
        }
        icon={<Users size={14} />}
        label="Donatur Aktif"
        value={
          activeDonors === null ? loading : activeDonors.toLocaleString('id-ID')
        }
      />
      <KpiCard
        hint="Program wakaf berstatus LIVE"
        icon={<Building2 size={14} />}
        label="Program Berjalan"
        value={
          kpiData ? kpiData.activePrograms.toLocaleString('id-ID') : loading
        }
      />
      <KpiCard
        hint="Transaksi lunas dibanding seluruh transaksi"
        icon={<Layers size={14} />}
        label="Transaksi Lunas"
        value={
          kpiData
            ? `${kpiData.paidTransactions.toLocaleString('id-ID')} / ${kpiData.totalTransactions.toLocaleString('id-ID')}`
            : loading
        }
      />
    </div>
  );
}

function AccumulationChart({ year }: { year: number }) {
  const { state, reload } = useResource(() => getAnalyticsAccumulation(year), {
    key: `admin.analytics.accumulation:${year}`,
  });

  return (
    <SectionCard
      icon={<BarChart2 className="shrink-0 text-emerald-800" size={16} />}
      subtitle={`Nominal donasi lunas per bulan, tahun ${year} (WIB)`}
      title="Tren Penghimpunan"
    >
      <Resource reload={reload} state={state}>
        {(points) => {
          const total = points.reduce((sum, point) => sum + point.amount, 0);
          if (total === 0) {
            return (
              <EmptyNote>Belum ada donasi lunas pada tahun {year}.</EmptyNote>
            );
          }
          const data = points.map((point) => ({
            month: monthLabel(point.label),
            total: point.amount,
          }));
          return (
            <div className="h-64">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={data}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    axisLine={false}
                    dataKey="month"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(val: number) => formatRupiahCompact(val)}
                    tickLine={false}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(val?: ValueType) => [
                      formatRupiah(toNumber(val as number | string)),
                      'Total Donasi',
                    ]}
                  />
                  <Bar dataKey="total" fill="#2E7D32" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      </Resource>
    </SectionCard>
  );
}

function Donut({
  data,
  colors,
}: {
  data: { name: string; value: number }[];
  colors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={48}
              nameKey="name"
              outerRadius={78}
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell fill={colors[entry.name] ?? '#94a3b8'} key={entry.name} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-xs">
        {data.map((entry) => (
          <li className="flex items-center gap-2" key={entry.name}>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[entry.name] ?? '#94a3b8' }}
            />
            <span className="font-semibold text-slate-700">{entry.name}</span>
            <span className="ml-auto text-slate-500">
              {entry.value.toLocaleString('id-ID')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompositionPanel({ year }: { year: number }) {
  const { state, reload } = useResource(() => getAnalyticsComposition(year), {
    key: `admin.analytics.composition:${year}`,
  });

  return (
    <SectionCard
      icon={<PieChartIcon className="shrink-0 text-emerald-800" size={16} />}
      subtitle={`Komposisi nominal per akad, tahun ${year} (dalam Rupiah)`}
      title="Komposisi Penghimpunan"
    >
      <Resource reload={reload} state={state}>
        {(points) => {
          const data = points
            .filter((point) => point.amount > 0)
            .map((point) => ({ name: point.module, value: point.amount }));
          return data.length === 0 ? (
            <EmptyNote>Belum ada donasi lunas pada tahun {year}.</EmptyNote>
          ) : (
            <Donut colors={MODULE_COLORS} data={data} />
          );
        }}
      </Resource>
    </SectionCard>
  );
}

function SegmentPanel({
  state,
  reload,
  onOpen,
}: {
  state: SegmentsState;
  reload: () => void;
  onOpen: () => void;
}) {
  return (
    <SectionCard
      icon={<Users className="shrink-0 text-emerald-800" size={16} />}
      subtitle="Sebaran donatur berdasarkan skor RFM-D"
      title="Segmen Donatur"
    >
      <Resource reload={reload} state={state}>
        {(result) => {
          const data = Object.entries(result.segmentCounts)
            .filter(([, count]) => count > 0)
            .map(([name, value]) => ({ name, value }));
          return (
            <div className="space-y-3">
              {data.length === 0 ? (
                <EmptyNote>Belum ada donatur dengan donasi lunas.</EmptyNote>
              ) : (
                <Donut colors={SEGMENT_COLORS} data={data} />
              )}
              <button
                className="flex cursor-pointer items-center gap-1 font-bold text-emerald-800 text-xs hover:underline"
                onClick={onOpen}
                type="button"
              >
                Lihat segmentasi lengkap
                <ChevronRight size={14} />
              </button>
            </div>
          );
        }}
      </Resource>
    </SectionCard>
  );
}

function AllocationPanel({
  allocations,
}: {
  allocations: { label: string; total: number; share: number }[];
}) {
  if (allocations.length === 0) {
    return <EmptyNote>Belum ada dana yang dihimpun.</EmptyNote>;
  }
  return (
    <ul className="space-y-3">
      {allocations.map((allocation) => (
        <li key={allocation.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-semibold text-slate-800">
              {allocation.label}
            </span>
            <span className="shrink-0 text-slate-500">
              {formatRupiah(allocation.total)} · {allocation.share}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#2E7D32]"
              style={{ width: `${Math.min(100, allocation.share)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecentActivityList({
  items,
}: {
  items: {
    id: string;
    donorName: string;
    amount: number;
    akad: string;
    program: string;
    createdAt: string;
  }[];
}) {
  if (items.length === 0) {
    return <EmptyNote>Belum ada transaksi lunas.</EmptyNote>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li className="flex items-center gap-3 py-2.5" key={item.id}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 font-bold text-[10px] text-emerald-800">
            {(AKAD_LABELS[item.akad] ?? item.akad).slice(0, 3)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-800 text-xs">
              {item.donorName} · {item.program}
            </p>
            <p className="text-[11px] text-slate-500">
              {formatWibDateTime(item.createdAt)}
            </p>
          </div>
          <span className="shrink-0 font-bold text-slate-900 text-xs">
            {formatRupiah(item.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LedgerPanels({ onOpenLedger }: { onOpenLedger: () => void }) {
  const { state, reload } = useResource(
    () => getAdminLedger({ page: 1, limit: 8 }),
    {
      key: 'admin.ledger:8',
    }
  );

  return (
    <>
      <SectionCard
        icon={<Layers className="shrink-0 text-emerald-800" size={16} />}
        subtitle="Dana terhimpun per program dan akad (lunas)"
        title="Ringkasan Alokasi Dana"
      >
        <Resource reload={reload} state={state}>
          {(ledger) => <AllocationPanel allocations={ledger.allocations} />}
        </Resource>
      </SectionCard>

      <SectionCard
        className="lg:col-span-2"
        icon={<Activity className="shrink-0 text-emerald-800" size={16} />}
        subtitle="Transaksi lunas terbaru; nama donatur anonim disamarkan"
        title="Aktivitas Terkini"
      >
        <Resource reload={reload} state={state}>
          {(ledger) => (
            <div className="space-y-2">
              <RecentActivityList items={ledger.items} />
              <button
                className="flex cursor-pointer items-center gap-1 font-bold text-emerald-800 text-xs hover:underline"
                onClick={onOpenLedger}
                type="button"
              >
                Buka buku besar transparansi
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </Resource>
      </SectionCard>
    </>
  );
}

const ROUTES: Record<string, string> = {
  transparency: '/admin/transparansi',
  segmentation: '/admin/segmentasi',
};

export function AdminOverviewView({ onNavigateTab }: AdminOverviewViewProps) {
  const navigate = useNavigate();
  const year = wibParts(new Date()).year;
  const segments = useResource(
    () => getAdminRfmSegments({ page: 1, limit: 1 }),
    {
      key: 'admin.rfm.summary',
    }
  );

  const open = (tab: keyof typeof ROUTES) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
      return;
    }
    const to = ROUTES[tab];
    if (to) {
      navigate({ to });
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Seluruh angka dibaca langsung dari basis data transaksi yang terverifikasi (status lunas)."
        icon={<LayoutDashboard />}
        title="Ringkasan Operasional Amwal"
      />

      <KpiGrid segments={segments.state} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccumulationChart year={year} />
        <CompositionPanel year={year} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SegmentPanel
          onOpen={() => open('segmentation')}
          reload={segments.reload}
          state={segments.state}
        />
        <LedgerPanels onOpenLedger={() => open('transparency')} />
      </div>
    </div>
  );
}
