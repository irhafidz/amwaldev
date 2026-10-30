import { Bell, CreditCard, Lock, Settings, Sliders } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BADGE,
} from '@/components/admin/admin-primitives';
import { WaGatewayPairingCard } from '@/components/admin/wa-gateway-pairing';
import { useToast } from '@/components/ui/toast';
import {
  type AdminRuntimeSettings,
  disconnectWaGateway,
  getAdminRuntimeSettings,
  getWaGatewayStatus,
  type WaGatewayStatus,
} from '@/lib/amwal-api/admin';
import { useResource } from '@/lib/amwal-api/use-resource';

interface SettingsSectionProps {
  onNavigateTab?: (tab: string) => void;
}

type SettingsTab = 'rfmd' | 'payment' | 'notifications';

/**
 * Real scoring rules, mirrored from `@amwal/core/analytics/donor-segments`
 * (the single source of truth; unit-tested there). Shown for reference only:
 * changing a threshold means changing that file and deploying.
 */
const RFMD_RULES = [
  {
    label: 'Recency (R)',
    rule: '≤30 hari = 5 · ≤60 = 4 · ≤90 = 3 · ≤180 = 2 · lebih lama = 1',
  },
  {
    label: 'Frequency (F)',
    rule: '1× = 1 · 2× = 2 · 3–4× = 3 · 5–9× = 4 · 10×+ = 5',
  },
  {
    label: 'Monetary (M)',
    rule: '<Rp100rb = 1 · <500rb = 2 · <2,5jt = 3 · <10jt = 4 · ≥10jt = 5',
  },
  {
    label: 'Diversity (D)',
    rule: 'Satu poin per kategori akad berbeda (Wakaf, Zakat, Infaq, Sedekah, Qurban), maksimal 5',
  },
] as const;

const RFMD_SEGMENTS = [
  ['Lapsed', 'Tidak berdonasi lebih dari 180 hari'],
  ['Champion', 'R, F, dan M masing-masing ≥ 4'],
  ['Loyal', 'F ≥ 3, M ≥ 3, dan R ≥ 3'],
  ['New', 'Satu donasi dalam 60 hari terakhir'],
  ['At-Risk', 'F ≥ 3 namun R ≤ 2 (diam 91–180 hari)'],
  ['Situational', 'Selain di atas'],
] as const;

function ReadOnlyBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-bold text-[10px] text-slate-600"
      title="Dikelola lewat environment variable dan deploy server"
    >
      <Lock aria-hidden="true" size={10} />
      Read-only
    </span>
  );
}

function RfmdTab() {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
            <Sliders className="shrink-0 text-emerald-800" size={20} />
            Aturan Penilaian RFM-D yang Berlaku
          </h3>
          <ReadOnlyBadge />
        </div>
        <p className="mt-1 text-slate-500 text-xs">
          Ambang batas tetap (bukan kuintil) agar segmentasi stabil pada basis
          donatur yang masih kecil. Aturan ini dipakai oleh analitik segmentasi
          donor dan tidak dapat diubah dari halaman ini.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RFMD_RULES.map((item) => (
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            key={item.label}
          >
            <dt className="font-bold text-slate-800 text-xs">{item.label}</dt>
            <dd className="mt-1 text-slate-600 text-xs leading-relaxed">
              {item.rule}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <h4 className="mb-2 font-bold text-slate-500 text-xs uppercase tracking-wider">
          Penentuan Segmen (urutan evaluasi, kecocokan pertama berlaku)
        </h4>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">
          {RFMD_SEGMENTS.map(([segment, rule]) => (
            <li className="flex gap-3 px-4 py-2.5" key={segment}>
              <span className="w-24 shrink-0 font-bold text-slate-800">
                {segment}
              </span>
              <span className="text-slate-600">{rule}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <dt className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="mt-1 break-all font-semibold text-slate-900 text-sm">
        {value}
      </dd>
    </div>
  );
}

function PaymentTab() {
  const resource = useResource(getAdminRuntimeSettings, {
    key: 'admin.settings.runtime',
  });
  const state = resource.state;
  const runtime: AdminRuntimeSettings | null =
    state.status === 'success' ? state.data : null;

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
            <CreditCard className="shrink-0 text-emerald-800" size={20} />
            Pembayaran &amp; Lingkungan Server
          </h3>
          <ReadOnlyBadge />
        </div>
        <p className="mt-1 text-slate-500 text-xs">
          Penyedia pembayaran, rekening, dan kunci API dikelola lewat
          environment variable pada deployment server dan tidak disimpan di
          basis data. Nilai di bawah dibaca langsung dari server yang sedang
          berjalan.
        </p>
      </div>

      {state.status === 'loading' && (
        <p className="text-slate-500 text-xs">Membaca konfigurasi server...</p>
      )}
      {state.status === 'error' && (
        <p className="text-rose-600 text-xs" role="alert">
          Gagal membaca konfigurasi server.
        </p>
      )}
      {runtime && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RuntimeRow
            label="Penyedia pembayaran"
            value={`${runtime.paymentProvider}${runtime.isSandbox ? ' (sandbox / uji)' : ''}`}
          />
          <RuntimeRow label="Lingkungan" value={runtime.nodeEnv} />
          <RuntimeRow
            label="URL publik aplikasi"
            value={runtime.publicAppUrl ?? 'BELUM DIISI (set PUBLIC_APP_URL)'}
          />
          <RuntimeRow
            label="Cron job (rekonsiliasi & streak)"
            value={runtime.cronConfigured ? 'Terkonfigurasi' : 'Belum diatur'}
          />
        </dl>
      )}
    </div>
  );
}

function NotificationsTab() {
  const { showToast } = useToast();
  const [waGateway, setWaGateway] = useState<WaGatewayStatus | null>(null);
  const [waGatewayError, setWaGatewayError] = useState<string | null>(null);
  const [isLoadingWaGateway, setIsLoadingWaGateway] = useState(false);
  const [isDisconnectingWa, setIsDisconnectingWa] = useState(false);

  const loadWaGateway = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoadingWaGateway(true);
    }
    setWaGatewayError(null);

    try {
      setWaGateway(await getWaGatewayStatus());
    } catch (error) {
      setWaGatewayError(
        error instanceof Error
          ? error.message
          : 'Gagal membaca status gateway WhatsApp.'
      );
    } finally {
      if (!options?.silent) {
        setIsLoadingWaGateway(false);
      }
    }
  }, []);

  const handleDisconnectWa = async () => {
    setIsDisconnectingWa(true);
    setWaGatewayError(null);

    try {
      setWaGateway(await disconnectWaGateway());
      showToast({
        title: 'Koneksi WhatsApp diputus',
        description: 'Sesi lokal dihapus dan QR pairing baru sedang disiapkan.',
        type: 'success',
      });
    } catch (error) {
      setWaGatewayError(
        error instanceof Error
          ? error.message
          : 'Gagal memutuskan koneksi WhatsApp.'
      );
    } finally {
      setIsDisconnectingWa(false);
    }
  };

  useEffect(() => {
    loadWaGateway().catch(() => null);
    const interval = window.setInterval(() => {
      loadWaGateway({ silent: true }).catch(() => null);
    }, 3500);

    return () => window.clearInterval(interval);
  }, [loadWaGateway]);

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-base text-slate-900">
          <Bell className="shrink-0 text-emerald-800" size={20} />
          Gateway WhatsApp
        </h3>
        <p className="mt-1 text-slate-500 text-xs">
          Status koneksi nyata layanan WhatsApp yang mengirim notifikasi
          transaksi dan Akta Ikrar Wakaf (AIW) ke nomor HP donatur.
        </p>
      </div>

      <WaGatewayPairingCard
        error={waGatewayError}
        isDisconnecting={isDisconnectingWa}
        isLoading={isLoadingWaGateway}
        onDisconnect={() => {
          handleDisconnectWa().catch(() => null);
        }}
        onRefresh={() => {
          loadWaGateway().catch(() => null);
        }}
        status={waGateway}
      />
    </div>
  );
}

const SETTINGS_TABS = [
  { id: 'rfmd', label: 'Aturan RFM-D', icon: <Sliders size={16} /> },
  {
    id: 'payment',
    label: 'Pembayaran & Server',
    icon: <CreditCard size={16} />,
  },
  { id: 'notifications', label: 'Gateway WhatsApp', icon: <Bell size={16} /> },
] as const;

// `onNavigateTab` dipertahankan di kontrak props (dipakai shell backoffice
// nanti), tetapi belum dibaca komponen ini — prefiks `_` menandainya sengaja.
export function SettingsView(_props: SettingsSectionProps = {}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('rfmd');

  return (
    <div className="space-y-6">
      <AdminPageHeader
        badge={
          <span
            className={HERO_BADGE}
            title="Dikelola lewat environment variable dan deploy server"
          >
            <Lock aria-hidden="true" size={10} />
            Read-only
          </span>
        }
        description="Halaman ini menampilkan konfigurasi yang sedang berlaku. Pengaturan sistem dikelola lewat environment variable dan deployment server, bukan dari panel ini, sehingga tidak ada tombol simpan."
        icon={<Settings />}
        title="Pengaturan Sistem & Konfigurasi Platform"
      />

      <AdminTabs
        label="Bagian pengaturan"
        onChange={setActiveTab}
        tabs={SETTINGS_TABS}
        value={activeTab}
      />

      {activeTab === 'rfmd' && <RfmdTab />}
      {activeTab === 'payment' && <PaymentTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
    </div>
  );
}

export default SettingsView;
