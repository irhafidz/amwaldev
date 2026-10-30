'use client';

import type { AkadAcceptanceInput } from '@amwal/core/contracts/akad';
import type { PaymentMethodCode } from '@amwal/core/payment/methods';
import { isWholeCow, MAX_SHOHIBUL_PER_COW } from '@amwal/core/qurban/shohibul';
import {
  formatIndonesianPhone,
  isValidIndonesianPhone,
} from '@amwal/core/whatsapp/phone';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ChevronLeft,
  LoaderCircle,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { AkadCheckbox } from '@/components/akad/akad-checkbox';
import {
  CARD,
  CTA,
  CheckoutSection as Section,
} from '@/components/payment/checkout-layout';
import { PaymentMethodSelector } from '@/components/payment/payment-method-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequiredMark } from '@/components/ui/required-mark';
import {
  createQurbanOrder,
  getMyDonorProfile,
  getQurbanBatchDetail,
} from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type {
  CreateQurbanOrderInput,
  QurbanBatch,
  QurbanBatchDetail,
} from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { rememberDeviceOrder } from '@/lib/payment/device-orders';
import { paymentNextUrl } from '@/lib/payment-next-url';
import { batchTitle, isKolektif } from './qurban-shared';

const MAX_NAMES = MAX_SHOHIBUL_PER_COW;
const MIN_NAME_LENGTH = 2;
const WAKALAH_TEXT =
  'Saya mewakilkan kepada panitia Qurban Amwal untuk membeli, menyembelih, dan mendistribusikan hewan qurban atas nama shohibul yang tertera, sesuai syariat Islam.';

interface NameField {
  id: number;
  value: string;
}

function cacheOrder(orderId: string, payload: Record<string, unknown>) {
  try {
    sessionStorage.setItem(`amwal_order_${orderId}`, JSON.stringify(payload));
  } catch {
    // Storage is only an optimisation for the status page.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Pesanan qurban belum dapat diproses. Coba lagi.';
}

/**
 * One slot per shohibul name, except a whole cow: one slot holds 1-7 names.
 * The server reserves the slots atomically.
 */
function buildOrderInput({
  batch,
  names,
  phone,
  distributeAll,
  paymentType,
  akad,
  guestName,
}: {
  batch: QurbanBatch;
  names: string[];
  phone: string;
  distributeAll: boolean;
  paymentType: PaymentMethodCode;
  akad: AkadAcceptanceInput | null;
  /** Nama pemesan tamu; kosong/undefined bila donatur login. */
  guestName?: string;
}): CreateQurbanOrderInput {
  return {
    hewanBatchId: batch.id,
    jumlahSlotDiminta: isWholeCow(batch) ? 1 : names.length,
    teleponPengqurban: phone,
    tipeKepemilikan: isKolektif(batch) ? 'KOLEKTIF' : 'INDIVIDU',
    opsiPesan: distributeAll ? 'PASRAH' : 'AMBIL_SENDIRI',
    paymentType,
    namaShohibul: names,
    akadWakalahAccepted: true,
    akadAcceptance: akad ?? undefined,
    donorName: guestName,
  };
}

/** Masalah pertama pada formulir checkout qurban, dan isian yang perlu difokuskan. */
function checkoutProblem(state: {
  availableSlots: number;
  guestReady: boolean;
  names: NameField[];
  phoneValid: boolean;
  wakalah: boolean;
}): { message: string; focusId?: string } | null {
  if (state.availableSlots <= 0) {
    return {
      message: 'Paket ini sudah penuh. Silakan pilih paket qurban lain.',
    };
  }
  if (!state.guestReady) {
    return {
      message: 'Nama lengkap pemesan wajib diisi (minimal 2 karakter).',
      focusId: 'qurban-pemesan',
    };
  }
  const empty = state.names.find(
    (n) => n.value.trim().length < MIN_NAME_LENGTH
  );
  if (empty) {
    return {
      message: `Nama shohibul qurban ke-${state.names.indexOf(empty) + 1} wajib diisi minimal 2 karakter.`,
      focusId: `shohibul-${empty.id}`,
    };
  }
  if (!state.phoneValid) {
    return {
      message:
        'Nomor WhatsApp aktif wajib diisi dengan format nomor yang valid (misal: 0812xxxxxxxx).',
      focusId: 'qurban-whatsapp',
    };
  }
  if (!state.wakalah) {
    return { message: 'Anda wajib menyetujui akad wakalah untuk melanjutkan.' };
  }
  return null;
}

export function QurbanCheckout({
  batchId,
  user,
}: {
  batchId?: string;
  user: SessionUser | null;
}) {
  const resource = useResource(() => getQurbanBatchDetail(batchId ?? ''), {
    enabled: Boolean(batchId),
  });

  if (!batchId) {
    return <Notice message="Paket qurban belum dipilih." />;
  }
  if (resource.state.status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <LoaderCircle
          aria-hidden="true"
          className="size-8 animate-spin text-[#356152]"
        />
      </div>
    );
  }
  if (resource.state.status === 'error') {
    return <Notice message={resource.state.error} />;
  }
  return <CheckoutForm detail={resource.state.data} user={user} />;
}

function CheckoutForm({
  detail,
  user,
}: {
  detail: QurbanBatchDetail;
  user: SessionUser | null;
}) {
  const { batch, availableSlots } = detail;
  const kolektif = isKolektif(batch);
  const wholeCow = isWholeCow(batch);
  let maxNames = 1;
  if (wholeCow) {
    maxNames = MAX_NAMES;
  } else if (kolektif) {
    maxNames = Math.min(MAX_NAMES, availableSlots);
  }
  const profile = useResource(getMyDonorProfile, { enabled: Boolean(user) });
  const [guestName, setGuestName] = useState('');

  const nextId = useRef(1);
  const [names, setNames] = useState<NameField[]>([{ id: 0, value: '' }]);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const [distributeAll, setDistributeAll] = useState(true);
  const [paymentType, setPaymentType] = useState<PaymentMethodCode>('qris');
  const [wakalah, setWakalah] = useState(false);
  const [akad, setAkad] = useState<AkadAcceptanceInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const donor = profile.state.status === 'success' ? profile.state.data : null;
  const phone = phoneInput ?? donor?.phone ?? '';
  const phoneValid = isValidIndonesianPhone(phone);
  const cleanNames = names.map((n) => n.value.trim());
  const filled = cleanNames.filter((n) => n.length >= MIN_NAME_LENGTH).length;
  const total = Number(batch.hargaPerSlot) * (wholeCow ? 1 : names.length);
  const guestReady =
    Boolean(user) || guestName.trim().length >= MIN_NAME_LENGTH;

  const addName = () => {
    setNames((prev) => [...prev, { id: nextId.current, value: '' }]);
    nextId.current += 1;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const problem = checkoutProblem({
      availableSlots,
      guestReady,
      names,
      phoneValid,
      wakalah,
    });
    if (problem) {
      setError(problem.message);
      if (problem.focusId) {
        document.getElementById(problem.focusId)?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = await createQurbanOrder(
        buildOrderInput({
          batch,
          names: cleanNames,
          phone,
          distributeAll,
          paymentType,
          akad,
          guestName: user ? undefined : guestName.trim(),
        })
      );
      cacheOrder(result.orderId, { payment: result.payment, amount: total });
      rememberDeviceOrder({
        orderId: result.orderId,
        label: `Qurban ${batch.jenisHewan === 'SAPI' ? 'Sapi' : 'Kambing'}`,
        amount: total,
      });
      window.location.assign(paymentNextUrl('qurban', result));
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const summary = (
    <OrderRows
      distributeAll={distributeAll}
      kolektif={kolektif}
      names={cleanNames}
      price={Number(batch.hargaPerSlot)}
      title={batchTitle(batch)}
      total={total}
    />
  );

  return (
    <form className="w-full pb-28 lg:pb-12" onSubmit={submit}>
      <Link
        className="mb-4 inline-flex items-center gap-1 font-medium text-gray-500 text-sm hover:text-[#356152]"
        params={{ batchId: batch.id }}
        to="/qurban/$batchId"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Kembali ke Detail Paket
      </Link>
      <h1 className="mb-5 font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
        Pembayaran Qurban
      </h1>

      {error && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
          <Section title="Data Shohibul Qurban">
            <ShohibulFields
              filled={filled}
              kolektif={kolektif}
              maxNames={maxNames}
              names={names}
              onAdd={addName}
              onChange={(id, value) =>
                setNames((prev) =>
                  prev.map((n) => (n.id === id ? { ...n, value } : n))
                )
              }
              onRemove={(id) =>
                setNames((prev) => prev.filter((n) => n.id !== id))
              }
              slotTotal={batch.totalSlot}
              wholeCow={wholeCow}
            />
            <PhoneField
              donorName={donor?.name}
              guestName={user ? undefined : guestName}
              onChange={setPhoneInput}
              onGuestName={setGuestName}
              phone={phone}
              phoneValid={phoneValid}
            />
          </Section>

          <Section title="Penyaluran Daging">
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="block font-bold text-gray-900 text-sm dark:text-white">
                  Disalurkan 100%?
                </span>
                <span className="mt-0.5 block text-gray-500 text-xs">
                  Aktifkan jika disalurkan 100%, nonaktifkan jika hak 1/3 bagian
                  diambil.
                </span>
              </span>
              <input
                checked={distributeAll}
                className="peer sr-only"
                onChange={(e) => setDistributeAll(e.target.checked)}
                type="checkbox"
              />
              <span
                aria-hidden="true"
                className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-gray-300 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[#356152] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-[#356152]/40"
              />
            </label>
          </Section>

          <Section title="Metode Pembayaran">
            <PaymentMethodSelector
              amount={total}
              onChange={setPaymentType}
              value={paymentType}
            />
          </Section>

          <Section title="Akad Wakalah">
            <p className="rounded-xl bg-[#f2f6f4] p-4 text-gray-700 text-sm leading-relaxed dark:bg-slate-800 dark:text-slate-300">
              {WAKALAH_TEXT}
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-gray-900 text-sm dark:text-white">
              <input
                checked={wakalah}
                className="mt-0.5 size-4 accent-[#356152]"
                onChange={(e) => setWakalah(e.target.checked)}
                type="checkbox"
              />
              <span className="font-semibold">
                Saya memahami dan menyetujui akad wakalah di atas
              </span>
            </label>
            <AkadCheckbox
              className="mt-4"
              disabled={submitting}
              module="QURBAN"
              onAccept={(acceptance) => {
                setAkad(acceptance);
                if (acceptance) {
                  setWakalah(true);
                }
              }}
            />
          </Section>
        </div>

        <aside className="hidden lg:col-span-5 lg:block xl:col-span-4">
          <div className={`${CARD} sticky top-6`}>
            <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
              RINGKASAN
            </span>
            <div className="mt-3">{summary}</div>
            <Button
              className={`${CTA} mt-5`}
              disabled={submitting}
              type="submit"
            >
              <SubmitLabel submitting={submitting} />
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-gray-400 text-xs">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-[#356152]"
              />
              Pembayaran Aman &amp; Sesuai Syariah
            </p>
          </div>
        </aside>
      </div>

      <div className="fixed right-0 bottom-0 left-0 z-30 border-gray-200 border-t bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-md items-center justify-between gap-4">
          <div>
            <span className="block font-medium text-[11px] text-gray-400 uppercase">
              Total Pembayaran
            </span>
            <span className="font-extrabold text-[#356152] text-lg">
              {formatRupiah(total)}
            </span>
          </div>
          <Button
            className="bg-[#356152] px-6 font-bold text-white hover:bg-[#2b4f43]"
            disabled={submitting}
            type="submit"
          >
            <SubmitLabel submitting={submitting} />
          </Button>
        </div>
      </div>
    </form>
  );
}

function SubmitLabel({ submitting }: { submitting: boolean }) {
  return submitting ? (
    <>
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      Memproses...
    </>
  ) : (
    <>
      <Lock aria-hidden="true" className="size-4" />
      Bayar Sekarang
    </>
  );
}

function ShohibulFields({
  names,
  kolektif,
  maxNames,
  slotTotal,
  filled,
  onAdd,
  onChange,
  onRemove,
  wholeCow,
}: {
  names: NameField[];
  kolektif: boolean;
  /** Sapi utuh: satu slot, 1-7 nama. */
  wholeCow: boolean;
  maxNames: number;
  slotTotal: number;
  filled: number;
  onAdd: () => void;
  onChange: (id: number, value: string) => void;
  onRemove: (id: number) => void;
}) {
  const multi = kolektif || wholeCow;
  return (
    <div>
      {wholeCow && (
        <p className="mb-4 rounded-xl bg-[#f2f6f4] p-3 text-[#1d352d] text-xs">
          Satu ekor sapi sah untuk 1 sampai {maxNames} orang. Tambahkan nama
          setiap shohibul; harga tetap satu ekor.
        </p>
      )}
      {kolektif && (
        <div className="mb-4">
          <div className="flex justify-between text-gray-500 text-xs">
            <span>
              {filled} dari {slotTotal} nama terisi
            </span>
            <span>Maks. {maxNames} nama pada pesanan ini</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#356152] transition-all"
              style={{ width: `${(filled / slotTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        {names.map((field, index) => (
          <div key={field.id}>
            <label
              className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300"
              htmlFor={`shohibul-${field.id}`}
            >
              {multi
                ? `Nama Shohibul Qurban ${index + 1}`
                : 'Nama Shohibul Qurban'}{' '}
              <RequiredMark />
            </label>
            <div className="flex gap-2">
              <Input
                id={`shohibul-${field.id}`}
                maxLength={100}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder="Contoh: Ahmad bin Abdullah"
                required
                value={field.value}
              />
              {names.length > 1 && (
                <Button
                  aria-label={`Hapus nama ${index + 1}`}
                  onClick={() => onRemove(field.id)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {multi && names.length < maxNames && (
        <Button
          className="mt-3 gap-1.5"
          onClick={onAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" className="size-4" />
          Tambah Nama
        </Button>
      )}
    </div>
  );
}

function PhoneField({
  donorName,
  guestName,
  onGuestName,
  phone,
  phoneValid,
  onChange,
}: {
  donorName?: string;
  /** Terisi (string) hanya untuk tamu: nama pemesan bisa diketik. */
  guestName?: string;
  onGuestName?: (value: string) => void;
  phone: string;
  phoneValid: boolean;
  onChange: (value: string) => void;
}) {
  const showError = phone.trim().length > 0 && !phoneValid;
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 border-gray-100 border-t pt-5 sm:grid-cols-2 dark:border-slate-800">
      <div>
        <label
          className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300"
          htmlFor="qurban-pemesan"
        >
          Pemesan {guestName !== undefined && <RequiredMark />}
        </label>
        {guestName === undefined ? (
          <Input
            className="bg-gray-50 text-gray-600"
            disabled
            id="qurban-pemesan"
            value={donorName ?? '—'}
          />
        ) : (
          <Input
            autoComplete="name"
            id="qurban-pemesan"
            maxLength={100}
            onChange={(e) => onGuestName?.(e.target.value)}
            placeholder="Nama lengkap pemesan"
            required
            value={guestName}
          />
        )}
      </div>
      <div>
        <label
          className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300"
          htmlFor="qurban-whatsapp"
        >
          WhatsApp Aktif <RequiredMark />
        </label>
        <Input
          aria-invalid={showError}
          autoComplete="tel"
          id="qurban-whatsapp"
          inputMode="tel"
          maxLength={20}
          onChange={(e) => onChange(e.target.value)}
          placeholder="081211004001"
          required
          type="tel"
          value={phone}
        />
        <p
          className={`mt-1.5 text-[11px] ${showError ? 'font-semibold text-rose-600' : 'text-gray-400'}`}
        >
          {showError && 'Format nomor tidak valid. Contoh 08xx atau +62xx.'}
          {!showError &&
            phoneValid &&
            `Laporan dikirim ke ${formatIndonesianPhone(phone)}.`}
          {!(showError || phoneValid) &&
            'Laporan sembelih & sertifikat dikirim ke nomor ini.'}
        </p>
      </div>
    </div>
  );
}

function OrderRows({
  title,
  kolektif,
  price,
  names,
  distributeAll,
  total,
}: {
  title: string;
  kolektif: boolean;
  price: number;
  names: string[];
  distributeAll: boolean;
  total: number;
}) {
  const shown = names.filter(Boolean);
  const rows: [string, string][] = [
    ['Paket', title],
    ['Jenis', kolektif ? 'Kolektif (Patungan 1/7)' : 'Individu (1 Ekor)'],
    [kolektif ? 'Harga per 1/7 bagian' : 'Harga', formatRupiah(price)],
    ['Jumlah shohibul', String(names.length)],
  ];
  if (shown.length > 0) {
    rows.push(['Atas nama', shown.join(', ')]);
  }
  rows.push(
    ['Penyaluran', distributeAll ? '100% disalurkan' : 'Hak 1/3 diambil'],
    ['Biaya layanan', 'Rp 0 (Gratis)']
  );

  return (
    <div className="space-y-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div className="flex justify-between gap-4" key={label}>
          <span className="text-gray-500">{label}</span>
          <span className="text-right font-semibold text-gray-900 dark:text-white">
            {value}
          </span>
        </div>
      ))}
      <div className="flex justify-between border-gray-100 border-t pt-3 dark:border-slate-800">
        <span className="font-bold text-gray-900 dark:text-white">
          Total Pembayaran
        </span>
        <span className="font-extrabold text-[#356152] text-lg">
          {formatRupiah(total)}
        </span>
      </div>
    </div>
  );
}

function Notice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div
      className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-gray-200 border-dashed bg-white px-6 py-10 text-center"
      role="alert"
    >
      <p className="text-gray-600 text-sm">{message}</p>
      {action ?? (
        <Button asChild variant="outline">
          <Link to="/qurban">Ke Katalog Qurban</Link>
        </Button>
      )}
    </div>
  );
}
