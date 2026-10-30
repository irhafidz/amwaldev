import {
  CheckCircle2,
  Loader2,
  LogOut,
  RefreshCw,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import type * as React from 'react';
import type { WaGatewayStatus } from '@/lib/amwal-api/admin';

interface WaGatewayPairingCardProps {
  error: string | null;
  isDisconnecting: boolean;
  isLoading: boolean;
  onDisconnect: () => void;
  onRefresh: () => void;
  status: WaGatewayStatus | null;
}

function StatusShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Smartphone className="shrink-0 text-emerald-700" size={18} />
        <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
      </div>
      {children}
    </div>
  );
}

export function WaGatewayPairingCard({
  error,
  isDisconnecting,
  isLoading,
  onDisconnect,
  onRefresh,
  status,
}: WaGatewayPairingCardProps) {
  if (isLoading && !status) {
    return (
      <StatusShell title="Pairing WhatsApp Baileys">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Memuat status gateway...
        </div>
      </StatusShell>
    );
  }

  if (error || status?.status === 'SERVICE_OFFLINE') {
    return (
      <StatusShell title="Pairing WhatsApp Baileys">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-bold">Service WA Bot belum aktif.</p>
            <p className="mt-1">
              Jalankan{' '}
              <code className="rounded bg-white/70 px-1">
                bun run --filter wa-bot dev
              </code>{' '}
              di terminal.
            </p>
            {status?.reason && (
              <p className="mt-1 text-[10px] opacity-75">
                Alasan: {status.reason}
              </p>
            )}
          </div>
        </div>
        <button
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 text-xs hover:bg-slate-100"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={isLoading ? 'size-4 animate-spin' : 'size-4'}
          />
          Coba Lagi
        </button>
      </StatusShell>
    );
  }

  if (status?.status === 'SCAN_QR' && status.qrCodeDataUrl) {
    return (
      <StatusShell title="Pairing WhatsApp Baileys">
        <div className="grid gap-4 md:grid-cols-[250px_1fr] md:items-center">
          {/* biome-ignore lint/performance/noImgElement: QR data URL berasal dari service internal wa-bot, bukan aset eksternal */}
          <img
            alt="QR Code pairing WhatsApp"
            className="mx-auto size-[250px] rounded-xl border border-white bg-white p-2 shadow-xs"
            src={status.qrCodeDataUrl}
          />
          <div className="space-y-3">
            <p className="font-bold text-slate-900 text-sm">
              Scan QR ini lewat WhatsApp
            </p>
            <ol className="list-decimal space-y-1 pl-4 text-slate-600 text-xs">
              <li>Buka WhatsApp di HP.</li>
              <li>Masuk ke Pengaturan → Tautkan Perangkat.</li>
              <li>Pilih Tautkan Perangkat, lalu scan QR ini.</li>
            </ol>
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800 text-xs">
              <span className="size-2 animate-pulse rounded-full bg-amber-500" />
              Menunggu scan...
            </p>
          </div>
        </div>
      </StatusShell>
    );
  }

  if (status?.status === 'CONNECTED') {
    return (
      <StatusShell title="Pairing WhatsApp Baileys">
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2
              aria-hidden="true"
              className="size-6 shrink-0 text-emerald-600"
            />
            <div>
              <p className="font-bold text-emerald-800 text-sm">
                WhatsApp terhubung
              </p>
              <p className="text-emerald-700 text-xs">
                Nomor: {status.phone ?? 'Tersambung'}
              </p>
            </div>
          </div>
          <button
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 font-bold text-white text-xs hover:bg-rose-700 disabled:opacity-50"
            disabled={isDisconnecting}
            onClick={onDisconnect}
            type="button"
          >
            {isDisconnecting ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <LogOut aria-hidden="true" className="size-4" />
            )}
            Putuskan Koneksi / Ganti Nomor
          </button>
        </div>
      </StatusShell>
    );
  }

  return (
    <StatusShell title="Pairing WhatsApp Baileys">
      <p className="text-slate-600 text-xs">
        Gateway belum terhubung ke perangkat WhatsApp. Muat ulang status untuk
        menghasilkan QR pairing baru.
      </p>
      <button
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 text-xs hover:bg-slate-100"
        disabled={isLoading}
        onClick={onRefresh}
        type="button"
      >
        <RefreshCw
          aria-hidden="true"
          className={isLoading ? 'size-4 animate-spin' : 'size-4'}
        />
        Muat Status
      </button>
    </StatusShell>
  );
}
