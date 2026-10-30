'use client';

import type { PaymentInstructions } from '@amwal/core/payment/types';
import { Check, Copy, Download, ExternalLink, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const WALLET_LABEL: Record<string, string> = {
  GOPAY: 'GoPay',
  DANA: 'DANA',
  SHOPEEPAY: 'ShopeePay',
  LINKAJA: 'LinkAja',
};

const BANK_LABEL: Record<string, string> = {
  BSI: 'BSI',
  MANDIRI: 'Mandiri',
  BNI: 'BNI',
  BRI: 'BRI',
  PERMATA: 'Permata',
  CIMB: 'CIMB Niaga',
  BJB: 'BJB',
};

function formatExpiry(iso: string | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })} WIB`;
}

function Expiry({ iso }: { iso: string | undefined }) {
  const text = formatExpiry(iso);
  return text ? (
    <p className="mt-3 text-center text-gray-500 text-xs">
      Bayar sebelum <strong className="text-gray-800">{text}</strong>
    </p>
  ) : null;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context); the number stays selectable.
    }
  };

  return (
    <Button
      aria-label={`Salin ${label}`}
      className="h-11 shrink-0 gap-1.5 border-[#356152] text-[#356152] hover:bg-[#f2f6f4]"
      onClick={copy}
      type="button"
      variant="outline"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      <span aria-live="polite">{copied ? 'Tersalin' : 'Salin'}</span>
    </Button>
  );
}

function Qris({
  instructions,
  orderId,
}: {
  instructions: Extract<PaymentInstructions, { type: 'qris' }>;
  orderId: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="font-bold text-gray-900 text-lg">Scan QRIS</h2>
      <p className="mt-1 max-w-sm text-gray-500 text-xs">
        Buka aplikasi e-wallet atau mobile banking apa pun, pilih Scan/QRIS,
        lalu arahkan ke kode ini.
      </p>
      {instructions.qrImage ? (
        <>
          <div className="mt-4 rounded-3xl border-2 border-gray-100 bg-white p-3 shadow-sm">
            {/** biome-ignore lint/performance/noImgElement: QR is a generated data URL */}
            <img
              alt="Kode QRIS pembayaran"
              className="size-60 sm:size-64"
              height={360}
              src={instructions.qrImage}
              width={360}
            />
          </div>
          <Button
            asChild
            className="mt-3 gap-2 border-[#356152] text-[#356152] hover:bg-[#f2f6f4]"
            variant="outline"
          >
            <a
              download={`QRIS-Amwal-${orderId}.png`}
              href={instructions.qrImage}
            >
              <Download aria-hidden="true" className="size-4" />
              Simpan gambar QR
            </a>
          </Button>
        </>
      ) : (
        <p className="mt-4 break-all rounded-xl bg-gray-50 p-3 font-mono text-[10px] text-gray-600">
          {instructions.qrString}
        </p>
      )}
      <Expiry iso={instructions.expiresAt} />
    </div>
  );
}

function VirtualAccount({
  instructions,
}: {
  instructions: Extract<PaymentInstructions, { type: 'virtual_account' }>;
}) {
  const bank = BANK_LABEL[instructions.bank.toUpperCase()] ?? instructions.bank;
  return (
    <div>
      <h2 className="font-bold text-gray-900 text-lg">
        Transfer ke Virtual Account {bank}
      </h2>
      <p className="mt-1 text-gray-500 text-xs">Nomor Virtual Account</p>
      <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
        <output
          className="min-w-0 flex-1 select-all break-all font-bold font-mono text-gray-900 text-lg tracking-wider sm:text-xl"
          data-testid="va-number"
        >
          {instructions.accountNumber}
        </output>
        <CopyButton
          label="nomor Virtual Account"
          value={instructions.accountNumber}
        />
      </div>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-gray-600 text-xs">
        <li>Buka aplikasi mobile banking atau ATM {bank}.</li>
        <li>Pilih Transfer, lalu Virtual Account.</li>
        <li>Masukkan nomor di atas dan pastikan nominalnya sesuai.</li>
      </ol>
      <Expiry iso={instructions.expiresAt} />
    </div>
  );
}

function EWallet({
  instructions,
}: {
  instructions: Extract<PaymentInstructions, { type: 'ewallet' }>;
}) {
  const wallet =
    WALLET_LABEL[instructions.wallet.toUpperCase()] ||
    instructions.wallet ||
    'e-wallet';
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="font-bold text-gray-900 text-lg">Bayar dengan {wallet}</h2>
      <p className="mt-1 max-w-sm text-gray-500 text-xs">
        {instructions.actionType === 'DEEPLINK'
          ? `Tekan tombol di bawah untuk membuka aplikasi ${wallet} dan menyelesaikan pembayaran. Buka dari ponsel yang terpasang ${wallet}.`
          : `Tekan tombol di bawah untuk menyelesaikan pembayaran di ${wallet}.`}
      </p>
      <Button
        asChild
        className="mt-4 h-12 w-full max-w-sm gap-2 bg-[#356152] font-bold text-white hover:bg-[#2b4f43]"
      >
        <a href={instructions.actionUrl}>
          <Smartphone aria-hidden="true" className="size-4" />
          Buka {wallet}
        </a>
      </Button>
    </div>
  );
}

/**
 * Instruksi bayar yang ditampilkan langsung di Amwal. Tanpa `instructions`
 * (mis. dibuka dari perangkat lain), hanya tautan ke halaman pembayaran Mayar
 * yang tampil sebagai jalan keluar.
 */
export function PaymentInstructionsPanel({
  instructions,
  hostedUrl,
  orderId,
}: {
  instructions?: PaymentInstructions;
  hostedUrl?: string;
  orderId: string;
}) {
  return (
    <div className="space-y-4">
      {instructions?.type === 'qris' && (
        <Qris instructions={instructions} orderId={orderId} />
      )}
      {instructions?.type === 'virtual_account' && (
        <VirtualAccount instructions={instructions} />
      )}
      {instructions?.type === 'ewallet' && (
        <EWallet instructions={instructions} />
      )}
      {hostedUrl && (
        <Button
          asChild
          className="h-11 w-full gap-2"
          variant={instructions ? 'ghost' : 'default'}
        >
          <a href={hostedUrl}>
            <ExternalLink aria-hidden="true" className="size-4" />
            {instructions
              ? 'Buka halaman pembayaran Mayar'
              : 'Lanjutkan Pembayaran'}
          </a>
        </Button>
      )}
    </div>
  );
}
