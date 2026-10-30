import QRCode from 'qrcode';
import type { PaymentInstructions } from './types';

/**
 * Instruksi bayar yang dikembalikan Mayar v2 langsung di respons
 * `POST /payments/create` (`data.paymentDetail`), sehingga Amwal bisa
 * menampilkannya sendiri dan donatur tidak perlu membuka halaman Mayar lalu
 * memilih metode untuk kedua kalinya. Bentuk (diamati pada akun live):
 *
 * - QRIS    `qr_code.channel_properties.{qr_string, expires_at}`
 * - VA      `virtual_account.channel_properties.{virtual_account_number, expires_at}`,
 *           `virtual_account.channel_code` = bank
 * - E-wallet `actions[]` dengan `{ action: 'AUTH', url, url_type: DEEPLINK|WEB }`,
 *           `ewallet.channel_code` = dompet
 *
 * Semua dibaca defensif: bila bentuknya berubah atau datanya tidak ada, hasilnya
 * `undefined` dan pemanggil jatuh ke tautan halaman Mayar — pembayaran tidak
 * pernah gagal hanya karena instruksi tidak bisa dibaca.
 */

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const QR_IMAGE_WIDTH = 360;

async function qrImage(qrString: string): Promise<string | undefined> {
  try {
    return await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: QR_IMAGE_WIDTH,
    });
  } catch {
    return;
  }
}

function walletAction(actions: unknown): Json | undefined {
  if (!Array.isArray(actions)) {
    return;
  }
  return actions.find(
    (action): action is Json => isRecord(action) && Boolean(str(action.url))
  );
}

/**
 * Instruksi tersimpan (`transactions.payment_instructions`) tidak memuat
 * gambar QR — PNG ±10 KB per baris tidak perlu ada di database. Gambar dibuat
 * ulang dari `qrString` saat instruksi dibaca kembali (QA-02).
 */
export function withoutQrImage(
  instructions: PaymentInstructions | undefined
): PaymentInstructions | null {
  if (!instructions) {
    return null;
  }
  if (instructions.type !== 'qris') {
    return instructions;
  }
  const { qrImage: _image, ...rest } = instructions;
  return rest;
}

export async function withQrImage(
  instructions: PaymentInstructions | null
): Promise<PaymentInstructions | null> {
  if (!instructions || instructions.type !== 'qris' || instructions.qrImage) {
    return instructions;
  }
  return { ...instructions, qrImage: await qrImage(instructions.qrString) };
}

export async function instructionsFromPaymentDetail(
  detail: unknown
): Promise<PaymentInstructions | undefined> {
  if (!isRecord(detail)) {
    return;
  }

  const qr = isRecord(detail.qr_code) ? detail.qr_code : undefined;
  const qrProps = isRecord(qr?.channel_properties)
    ? qr.channel_properties
    : undefined;
  const qrString = str(qrProps?.qr_string);
  if (qrString) {
    return {
      type: 'qris',
      qrString,
      qrImage: await qrImage(qrString),
      expiresAt: str(qrProps?.expires_at),
    };
  }

  const va = isRecord(detail.virtual_account)
    ? detail.virtual_account
    : undefined;
  const vaProps = isRecord(va?.channel_properties)
    ? va.channel_properties
    : undefined;
  const accountNumber = str(vaProps?.virtual_account_number);
  if (accountNumber) {
    return {
      type: 'virtual_account',
      bank: str(va?.channel_code) ?? '',
      accountNumber,
      expiresAt: str(vaProps?.expires_at),
    };
  }

  const ewallet = isRecord(detail.ewallet) ? detail.ewallet : undefined;
  const action = walletAction(detail.actions);
  const actionUrl = str(action?.url);
  if (ewallet && actionUrl) {
    return {
      type: 'ewallet',
      wallet: str(ewallet.channel_code) ?? '',
      actionUrl,
      actionType: action?.url_type === 'DEEPLINK' ? 'DEEPLINK' : 'WEB',
    };
  }

  return;
}
