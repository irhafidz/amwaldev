'use client';

import type { AkadAcceptanceInput } from '@amwal/core/contracts/akad';
import {
  MIN_DONATION_LABEL,
  MIN_DONATION_RUPIAH,
} from '@amwal/core/payment/limits';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Landmark,
  LoaderCircle,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { AkadCheckbox } from '@/components/akad/akad-checkbox';
import { PaymentMethodSelector } from '@/components/payment/payment-method-selector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequiredMark } from '@/components/ui/required-mark';
import {
  createWaqfOrder,
  getMyDonorProfile,
  getWaqfProgram,
} from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type {
  CreateWaqfOrderResult,
  WaqfPaymentType,
  WaqfProgram,
} from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { rememberDeviceOrder } from '@/lib/payment/device-orders';
import { paymentNextUrl } from '@/lib/payment-next-url';

const PRESET_AMOUNTS = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

type DonateMode = 'anonymous' | 'guest' | 'authenticated';

function resolveDonorContact(
  resolvedMode: DonateMode,
  email: string,
  phone: string,
  existingPhone: string | null
): { donorEmail?: string; donorPhone?: string } {
  if (resolvedMode === 'authenticated') {
    return {
      donorEmail: email || undefined,
      donorPhone: (existingPhone ?? phone.trim()) || undefined,
    };
  }
  return {
    donorEmail: email.trim() || undefined,
    donorPhone: phone.trim() || undefined,
  };
}

function parseInitialAmount(
  initial?: number,
  nominal?: number
): { presetAmount: number; customAmount: string } {
  const starting = initial ?? nominal;
  if (starting === undefined) {
    return { presetAmount: 100_000, customAmount: '' };
  }
  if (starting === 0) {
    return { presetAmount: 0, customAmount: '' };
  }
  if (PRESET_AMOUNTS.includes(starting)) {
    return { presetAmount: starting, customAmount: '' };
  }
  return { presetAmount: 0, customAmount: starting.toLocaleString('id-ID') };
}

function validateWaqfInput(
  amount: number,
  isAnonymous: boolean,
  donorName: string
): string | null {
  if (amount < MIN_DONATION_RUPIAH) {
    return `Nominal wakaf minimal ${MIN_DONATION_LABEL}.`;
  }
  if (!isAnonymous && donorName.trim().length === 0) {
    return 'Nama wakif wajib diisi atau pilih opsi Hamba Allah.';
  }
  return null;
}

function cacheOrderMetadata(orderId: string, payload: Record<string, unknown>) {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`amwal_order_${orderId}`, JSON.stringify(payload));
      sessionStorage.setItem('amwal_last_order_id', orderId);
    }
  } catch {
    // Ignore storage errors
  }
}

async function submitWaqfOrder(params: {
  programId: string;
  programTitle: string;
  programCategory: string | null;
  amount: number;
  paymentType: WaqfPaymentType;
  isAnonymous: boolean;
  donorName: string;
  resolvedMode: DonateMode;
  email: string;
  phone: string;
  existingPhone: string | null;
  akadAcceptance: AkadAcceptanceInput | null;
  doaMessage?: string;
}): Promise<CreateWaqfOrderResult> {
  const { donorEmail, donorPhone } = resolveDonorContact(
    params.resolvedMode,
    params.email,
    params.phone,
    params.existingPhone
  );

  const result = await createWaqfOrder({
    programId: params.programId,
    amount: params.amount,
    paymentType: params.paymentType,
    donorName: params.isAnonymous ? 'Hamba Allah' : params.donorName.trim(),
    donorEmail,
    donorPhone,
    isAnonymous: params.isAnonymous,
    doa: params.doaMessage?.trim() || undefined,
    akadAcceptance: params.akadAcceptance ?? undefined,
  });

  cacheOrderMetadata(result.orderId, {
    orderId: result.orderId,
    programId: params.programId,
    amount: params.amount,
    payment: result.payment,
    programTitle: params.programTitle,
    programCategory: params.programCategory,
    donorName: params.isAnonymous ? 'Hamba Allah' : params.donorName.trim(),
    doaMessage: params.doaMessage?.trim() || undefined,
    createdAt: Date.now(),
  });
  rememberDeviceOrder({
    orderId: result.orderId,
    label: params.programTitle || 'Wakaf',
    amount: params.amount,
  });

  return result;
}

interface WaqfDonateFormProps {
  programId: string;
  mode?: 'anonymous' | 'guest';
  nominal?: number;
  initialNominal?: number;
  user: SessionUser | null;
}

export function WaqfDonateForm({
  programId,
  mode,
  nominal,
  initialNominal,
  user,
}: WaqfDonateFormProps) {
  const resolvedMode: DonateMode = user ? 'authenticated' : (mode ?? 'guest');

  const programResource = useResource(() => getWaqfProgram(programId));
  const profileResource = useResource(getMyDonorProfile, {
    enabled: resolvedMode === 'authenticated',
  });

  const initial = parseInitialAmount(initialNominal, nominal);
  const [amount, setAmount] = useState<number>(initial.presetAmount);
  const [customAmount, setCustomAmount] = useState<string>(
    initial.customAmount
  );
  const [doaMessage, setDoaMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(resolvedMode === 'anonymous');
  const [donorName, setDonorName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [existingPhone, setExistingPhone] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<WaqfPaymentType>('qris');
  const [akadAcceptance, setAkadAcceptance] =
    useState<AkadAcceptanceInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (initialNominal !== undefined || nominal !== undefined) {
      const parsed = parseInitialAmount(initialNominal, nominal);
      setAmount(parsed.presetAmount);
      setCustomAmount(parsed.customAmount);
    }
  }, [initialNominal, nominal]);

  useEffect(() => {
    if (
      resolvedMode !== 'authenticated' ||
      profileResource.state.status !== 'success'
    ) {
      return;
    }
    const profile = profileResource.state.data;
    setDonorName(profile.name);
    setEmail(profile.email ?? '');
    setExistingPhone(profile.phone);
    setPhone(profile.phone ?? '');
  }, [resolvedMode, profileResource.state]);

  const isLoadingProfile =
    resolvedMode === 'authenticated' &&
    profileResource.state.status === 'loading';

  if (programResource.state.status === 'loading' || isLoadingProfile) {
    return <DonateFormLoading />;
  }

  if (programResource.state.status === 'error') {
    return <DonateFormError error={programResource.state.error} />;
  }

  const program = programResource.state.data;
  const effectiveAmount = customAmount
    ? Number(customAmount.replace(/\D/g, '')) || 0
    : amount;

  const selectPreset = (value: number) => {
    setAmount(value);
    setCustomAmount('');
  };

  const changeCustom = (value: string) => {
    const digits = value.replace(/\D/g, '');
    setCustomAmount(digits ? Number(digits).toLocaleString('id-ID') : '');
    if (digits) {
      setAmount(0);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateWaqfInput(
      effectiveAmount,
      isAnonymous,
      donorName
    );
    if (validationError) {
      setError(validationError);
      if (effectiveAmount < MIN_DONATION_RUPIAH) {
        document.getElementById('wakaf-custom-amount')?.focus();
      } else if (!isAnonymous && donorName.trim().length === 0) {
        document.getElementById('wakaf-donor-name')?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitWaqfOrder({
        programId: program.id,
        programTitle: program.judul,
        programCategory: program.kategori,
        amount: effectiveAmount,
        paymentType,
        isAnonymous,
        donorName,
        resolvedMode,
        email,
        phone,
        existingPhone,
        akadAcceptance,
        doaMessage,
      });

      setSuccess(
        `Order ${result.orderId} berhasil dibuat. Mengarahkan ke halaman pembayaran...`
      );
      window.setTimeout(() => {
        window.location.assign(paymentNextUrl('wakaf', result));
      }, 600);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Gagal memproses donasi. Coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="w-full pb-28 lg:pb-12" onSubmit={handleSubmit}>
      <CheckoutHeader
        nazhirName={
          program.nadzirProfile?.namaLembaga || 'Badan Pengelola Wakaf'
        }
        programId={program.id}
        programTitle={program.judul}
      />

      {error && <DonateErrorAlert message={error} />}
      {success && <DonateSuccessAlert message={success} />}

      {/* Responsive 2-Column Grid */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* LEFT COLUMN: Form Fields */}
        <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
          <NominalSection
            amount={amount}
            customAmount={customAmount}
            onChangeCustom={changeCustom}
            onSelectPreset={selectPreset}
          />

          <IdentitySection
            donorName={donorName}
            email={email}
            existingPhone={existingPhone}
            isAnonymous={isAnonymous}
            mode={resolvedMode === 'authenticated' ? 'authenticated' : 'guest'}
            onDonorNameChange={setDonorName}
            onEmailChange={setEmail}
            onIsAnonymousChange={setIsAnonymous}
            onPhoneChange={setPhone}
            phone={phone}
          />

          <DoaMessageSection onChange={setDoaMessage} value={doaMessage} />

          <PaymentMethodSection
            amount={effectiveAmount}
            onChange={setPaymentType}
            value={paymentType}
          />

          <OrderBreakdownSection amount={effectiveAmount} />

          <AkadSection onAccept={setAkadAcceptance} submitting={submitting} />
        </div>

        {/* RIGHT COLUMN: Desktop Sticky Summary */}
        <DesktopSummaryCard
          amount={effectiveAmount}
          program={program}
          submitting={submitting}
        />
      </div>

      {/* MOBILE FIXED BOTTOM CTA BAR */}
      <MobileStickyBottomBar amount={effectiveAmount} submitting={submitting} />
    </form>
  );
}

const CHECKOUT_STEPS = ['Hitung / Nominal', 'Konfirmasi', 'Bayar'] as const;
/** Langkah aktif (indeks 0): pengguna sedang di formulir konfirmasi. */
const ACTIVE_STEP = 1;

/**
 * Indikator tahapan donasi: lingkaran bernomor yang disambung garis. Langkah
 * selesai berisi centang, langkah aktif solid zamrud, langkah berikutnya
 * hanya garis tepi. Bukan lagi kapsul yang berjejer.
 */
function CheckoutStepper() {
  return (
    <nav aria-label="Tahapan Donasi" className="py-1">
      <ol className="flex items-center">
        {CHECKOUT_STEPS.map((label, index) => {
          const done = index < ACTIVE_STEP;
          const active = index === ACTIVE_STEP;
          const last = index === CHECKOUT_STEPS.length - 1;
          let circle =
            'border-gray-300 bg-white text-gray-400 dark:border-slate-600 dark:bg-slate-900';
          if (done) {
            circle = 'border-[#356152] bg-[#356152] text-white';
          } else if (active) {
            circle =
              'border-[#356152] bg-white text-[#356152] ring-4 ring-[#356152]/15 dark:bg-slate-900';
          }
          return (
            <li
              aria-current={active ? 'step' : undefined}
              className={`flex items-center ${last ? '' : 'flex-1'}`}
              key={label}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-bold text-xs ${circle}`}
              >
                {done ? (
                  <Check aria-hidden="true" className="size-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`ml-2 whitespace-nowrap text-xs ${active ? 'font-bold text-gray-900 dark:text-white' : 'hidden font-medium text-gray-500 sm:inline dark:text-slate-400'}`}
              >
                {label}
              </span>
              {!last && (
                <span
                  aria-hidden="true"
                  className={`mx-3 h-0.5 min-w-4 flex-1 rounded-full ${done ? 'bg-[#356152]' : 'bg-gray-200 dark:bg-slate-700'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CheckoutHeader({
  programTitle,
  nazhirName,
  programId,
}: {
  programTitle: string;
  nazhirName: string;
  programId: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-gray-500 text-xs dark:text-slate-400"
      >
        <Link
          className="flex items-center gap-1 font-medium transition-colors hover:text-[#356152]"
          to="/wakaf"
        >
          Wakaf
        </Link>
        <ChevronRight aria-hidden="true" className="size-3.5 text-gray-400" />
        <Link
          className="max-w-[200px] truncate font-medium transition-colors hover:text-[#356152] sm:max-w-[320px]"
          params={{ programId }}
          to="/wakaf/$programId"
        >
          {programTitle}
        </Link>
        <ChevronRight aria-hidden="true" className="size-3.5 text-gray-400" />
        <span className="font-semibold text-gray-900 dark:text-white">
          Checkout
        </span>
      </nav>

      {/* Title & Subtitle */}
      <div>
        <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
          Konfirmasi Wakaf Uang
        </h1>
        <p className="mt-1 text-gray-500 text-xs sm:text-sm dark:text-slate-400">
          <span className="font-semibold text-gray-700 dark:text-slate-300">
            {programTitle}
          </span>{' '}
          • Akad &amp; penyaluran via {nazhirName}
        </p>
      </div>

      {/* Stepper Pills */}
      <CheckoutStepper />
    </div>
  );
}

function NominalSection({
  amount,
  customAmount,
  onSelectPreset,
  onChangeCustom,
}: {
  amount: number;
  customAmount: string;
  onSelectPreset: (preset: number) => void;
  onChangeCustom: (value: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f6f4] font-bold text-[#356152] text-xs dark:bg-emerald-950 dark:text-emerald-300">
          1
        </span>
        <div>
          <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
            Pilih Nominal Wakaf
          </h2>
          <p className="text-gray-500 text-xs dark:text-slate-400">
            Tentukan nilai wakaf uang yang ingin Anda tunaikan
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {PRESET_AMOUNTS.map((preset) => {
          const active = !customAmount && amount === preset;
          return (
            <button
              className={`cursor-pointer rounded-2xl border px-3 py-3.5 text-center font-bold text-sm transition-all active:scale-95 ${
                active
                  ? 'border-[#356152] bg-[#f2f6f4] text-[#1d352d] shadow-xs ring-2 ring-[#356152]/20 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-[#356152]/50 hover:bg-[#f2f6f4]/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
              key={preset}
              onClick={() => onSelectPreset(preset)}
              type="button"
            >
              {formatRupiah(preset)}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <label
          className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
          htmlFor="wakaf-custom-amount"
        >
          Atau nominal lain (Rp)
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 font-bold text-gray-400 text-sm">
            Rp
          </span>
          <Input
            className="pl-10 font-semibold text-base focus-visible:ring-[#356152]"
            id="wakaf-custom-amount"
            inputMode="numeric"
            onChange={(event) => onChangeCustom(event.target.value)}
            placeholder="0"
            type="text"
            value={customAmount}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          Minimal nominal wakaf adalah {MIN_DONATION_LABEL}.
        </p>
      </div>
    </section>
  );
}

function AuthenticatedIdentityFields({
  donorName,
  email,
  existingPhone,
  phone,
  isAnonymous,
  onPhoneChange,
}: {
  donorName: string;
  email: string;
  existingPhone: string | null;
  phone: string;
  isAnonymous: boolean;
  onPhoneChange: (val: string) => void;
}) {
  return (
    <>
      <label
        className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
        htmlFor="wakaf-donor-name"
      >
        Nama Lengkap (Akun Terverifikasi)
        <Input
          className="mt-1.5 bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-slate-300"
          disabled
          id="wakaf-donor-name"
          value={isAnonymous ? 'Hamba Allah' : donorName}
        />
      </label>
      {email && (
        <label
          className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
          htmlFor="wakaf-donor-email"
        >
          Email
          <Input
            className="mt-1.5 bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-slate-300"
            disabled
            id="wakaf-donor-email"
            type="email"
            value={email}
          />
        </label>
      )}
      {existingPhone ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60">
          <span className="text-gray-500 dark:text-slate-400">
            Nomor WhatsApp terdaftar:{' '}
          </span>
          <span className="font-bold text-gray-900 dark:text-white">
            {existingPhone}
          </span>
        </div>
      ) : (
        <label
          className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
          htmlFor="wakaf-donor-phone"
        >
          Nomor WhatsApp (opsional)
          <Input
            className="mt-1.5 focus-visible:ring-[#356152]"
            id="wakaf-donor-phone"
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="08xxxxxxxxxx"
            type="tel"
            value={phone}
          />
        </label>
      )}
    </>
  );
}

function GuestIdentityFields({
  donorName,
  email,
  phone,
  isAnonymous,
  onDonorNameChange,
  onEmailChange,
  onPhoneChange,
}: {
  donorName: string;
  email: string;
  phone: string;
  isAnonymous: boolean;
  onDonorNameChange: (val: string) => void;
  onEmailChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
}) {
  return (
    <>
      <label
        className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
        htmlFor="wakaf-donor-name"
      >
        Nama Lengkap (sesuai KTP) {!isAnonymous && <RequiredMark />}
        <Input
          className="mt-1.5 focus-visible:ring-[#356152]"
          disabled={isAnonymous}
          id="wakaf-donor-name"
          onChange={(event) => onDonorNameChange(event.target.value)}
          placeholder="Contoh: Fulan bin Fulan"
          value={isAnonymous ? 'Hamba Allah' : donorName}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
          htmlFor="wakaf-donor-email"
        >
          Email (opsional)
          <Input
            className="mt-1.5 focus-visible:ring-[#356152]"
            id="wakaf-donor-email"
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="email@contoh.id"
            type="email"
            value={email}
          />
        </label>
        <label
          className="block font-semibold text-gray-700 text-xs sm:text-sm dark:text-slate-300"
          htmlFor="wakaf-donor-phone"
        >
          Nomor WhatsApp (opsional)
          <Input
            className="mt-1.5 focus-visible:ring-[#356152]"
            id="wakaf-donor-phone"
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="08xxxxxxxxxx"
            type="tel"
            value={phone}
          />
        </label>
      </div>
      <GuestTrackingHint />
    </>
  );
}

/** D2: tamu boleh tanpa kontak, tetapi didorong mengisi WhatsApp. */
function GuestTrackingHint() {
  return (
    <p className="mt-3 rounded-xl bg-[#f2f6f4] px-3 py-2 text-[#1d352d] text-xs leading-relaxed dark:bg-emerald-950/30 dark:text-emerald-200">
      Isi WhatsApp agar bukti dan kabar penyaluran bisa kami kirim. Tanpa kontak
      pun transaksi tetap tersimpan di perangkat ini dan bisa dibuka lewat
      tautan status.
    </p>
  );
}

function IdentityCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5 transition-all hover:bg-gray-100/70 dark:border-slate-800 dark:bg-slate-800/40">
      <input
        checked={checked}
        className="mt-0.5 size-4 cursor-pointer accent-[#356152]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="flex min-w-0 items-start gap-2.5">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-[#356152] dark:text-emerald-400"
        />
        <span>
          <span className="block font-semibold text-gray-900 text-xs sm:text-sm dark:text-white">
            Sembunyikan identitas saya (Hamba Allah)
          </span>
          <span className="mt-0.5 block text-gray-500 text-xs dark:text-slate-400">
            Nama Anda akan disamarkan pada daftar donatur publik, namun tetap
            tercatat sah pada sistem &amp; akad wakaf.
          </span>
        </span>
      </span>
    </label>
  );
}

function IdentitySection({
  mode,
  donorName,
  email,
  phone,
  existingPhone,
  isAnonymous,
  onDonorNameChange,
  onEmailChange,
  onPhoneChange,
  onIsAnonymousChange,
}: {
  mode: 'guest' | 'authenticated';
  donorName: string;
  email: string;
  phone: string;
  existingPhone: string | null;
  isAnonymous: boolean;
  onDonorNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onIsAnonymousChange: (checked: boolean) => void;
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f6f4] font-bold text-[#356152] text-xs dark:bg-emerald-950 dark:text-emerald-300">
          2
        </span>
        <div>
          <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
            Identitas Wakif
          </h2>
          <p className="text-gray-500 text-xs dark:text-slate-400">
            Data diri untuk penerbitan Akta Ikrar Wakaf (AIW) digital
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {mode === 'authenticated' ? (
          <AuthenticatedIdentityFields
            donorName={donorName}
            email={email}
            existingPhone={existingPhone}
            isAnonymous={isAnonymous}
            onPhoneChange={onPhoneChange}
            phone={phone}
          />
        ) : (
          <GuestIdentityFields
            donorName={donorName}
            email={email}
            isAnonymous={isAnonymous}
            onDonorNameChange={onDonorNameChange}
            onEmailChange={onEmailChange}
            onPhoneChange={onPhoneChange}
            phone={phone}
          />
        )}

        <IdentityCheckbox
          checked={isAnonymous}
          onChange={onIsAnonymousChange}
        />
      </div>
    </section>
  );
}

/** Sama dengan batas `doa` di kontrak `waqf.createOrder`. */
const DOA_MAX_LENGTH = 500;

const DOA_PRESETS = [
  'Semoga menjadi amal jariyah yang pahalanya mengalir abadi untuk kedua orang tua.',
  'Semoga Allah melimpahkan keberkahan rezeki, kesehatan, dan ketenangan keluarga.',
  'Niat ikhlas karena Allah demi kemaslahatan dan kemandirian umat.',
];

function DoaMessageSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-[#356152]/20 bg-gradient-to-br from-[#f2f6f4]/60 via-white to-[#f2f6f4]/30 p-5 shadow-xs sm:p-6 dark:border-emerald-950/60 dark:from-emerald-950/20 dark:via-slate-900 dark:to-emerald-950/10">
      <div className="mb-4 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#356152] font-bold text-white text-xs dark:bg-emerald-700">
            3
          </span>
          <div>
            <h2 className="flex items-center gap-1.5 font-bold text-base text-gray-900 sm:text-lg dark:text-white">
              Doa &amp; Harapan Kebaikan
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-[#356152] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
                Opsional
              </span>
            </h2>
            <p className="text-gray-500 text-xs dark:text-slate-400">
              Tuliskan niat atau doa kebaikan yang ingin Anda sampaikan
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <textarea
          className="w-full rounded-2xl border border-gray-200 bg-white p-3.5 text-gray-900 text-sm placeholder:text-gray-400 focus:border-[#356152] focus:outline-none focus:ring-2 focus:ring-[#356152]/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          id="wakaf-doa-message"
          maxLength={DOA_MAX_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Tuliskan niat atau doa kebaikan Anda (misal: pahala jariyah untuk orang tua tercinta)..."
          rows={3}
          value={value}
        />

        <div>
          <span className="block font-medium text-[11px] text-gray-500 dark:text-slate-400">
            Inspirasi Doa Singkat (klik untuk menambahkan):
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DOA_PRESETS.map((preset) => (
              <button
                className="cursor-pointer rounded-xl border border-[#356152]/20 bg-white px-2.5 py-1 text-left text-[#356152] text-[11px] transition-colors hover:bg-[#f2f6f4] dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-300 dark:hover:bg-slate-700"
                key={preset}
                onClick={() =>
                  onChange(
                    (value.trim() ? `${value.trim()} ${preset}` : preset).slice(
                      0,
                      DOA_MAX_LENGTH
                    )
                  )
                }
                type="button"
              >
                "{preset}"
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PaymentMethodSection({
  value,
  onChange,
  amount,
}: {
  value: WaqfPaymentType;
  onChange: (type: WaqfPaymentType) => void;
  amount: number;
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f6f4] font-bold text-[#356152] text-xs dark:bg-emerald-950 dark:text-emerald-300">
          4
        </span>
        <div>
          <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
            Metode Pembayaran
          </h2>
          <p className="text-gray-500 text-xs dark:text-slate-400">
            Pembayaran resmi dan otomatis terverifikasi
          </p>
        </div>
      </div>

      <PaymentMethodSelector
        amount={amount}
        onChange={onChange}
        value={value}
      />
    </section>
  );
}

function OrderBreakdownSection({ amount }: { amount: number }) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f6f4] font-bold text-[#356152] text-xs dark:bg-emerald-950 dark:text-emerald-300">
          5
        </span>
        <div>
          <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
            Rincian Pesanan
          </h2>
          <p className="text-gray-500 text-xs dark:text-slate-400">
            Transparansi rincian pembayaran donasi wakaf
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl bg-gray-50 p-4 text-xs sm:text-sm dark:bg-slate-800/60">
        <div className="flex items-center justify-between text-gray-600 dark:text-slate-300">
          <span>Nominal Wakaf</span>
          <span className="font-bold text-gray-900 dark:text-white">
            {formatRupiah(amount)}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-600 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <span>Biaya Layanan</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-[#1d352d] text-[10px] dark:bg-emerald-950 dark:text-emerald-300">
              100% Tersalurkan
            </span>
          </div>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            Rp 0 (Gratis)
          </span>
        </div>
        <div className="border-gray-200 border-t pt-3 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-900 dark:text-white">
              Total Pembayaran
            </span>
            <span className="font-extrabold text-[#356152] text-base sm:text-lg dark:text-emerald-400">
              {formatRupiah(amount)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function AkadSection({
  submitting,
  onAccept,
}: {
  submitting: boolean;
  onAccept: (acceptance: AkadAcceptanceInput | null) => void;
}) {
  return (
    <section className="rounded-3xl border border-emerald-100 bg-[#f2f6f4]/40 p-5 shadow-xs sm:p-6 dark:border-emerald-950/60 dark:bg-emerald-950/20">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#356152] font-bold text-white text-xs">
          6
        </span>
        <div>
          <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
            Akad Wakaf Digital
          </h2>
          <p className="text-gray-500 text-xs dark:text-slate-400">
            Persetujuan ikrar wakaf sesuai syariah Islam &amp; UU No. 41 Tahun
            2004
          </p>
        </div>
      </div>

      <AkadCheckbox disabled={submitting} module="WAKAF" onAccept={onAccept} />
    </section>
  );
}

export function DesktopSummaryCard({
  program,
  amount,
  submitting,
}: {
  program: WaqfProgram;
  amount: number;
  submitting: boolean;
}) {
  return (
    // Aside-nya sendiri yang sticky, seperti ringkasan infaq. Grid induk
    // `items-start` membuat aside setinggi isinya, jadi `sticky` pada div di
    // dalamnya tidak punya ruang bergerak dan kartu ikut tergulir (QA-18).
    <aside
      className="hidden lg:sticky lg:top-24 lg:col-span-5 lg:block xl:col-span-4"
      data-testid="waqf-summary-aside"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
            RINGKASAN
          </span>

          {/* Program Card */}
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-gray-50 p-3.5 dark:bg-slate-800/60">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#356152] text-white">
              <Landmark aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-bold text-[#356152] text-[10px] uppercase tracking-wider dark:text-emerald-400">
                {program.kategori || 'Wakaf Produktif'}
              </span>
              <p className="line-clamp-2 font-bold text-gray-900 text-xs dark:text-white">
                {program.judul}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-slate-400">
                {program.nadzirProfile?.namaLembaga || 'Badan Pengelola Wakaf'}
              </p>
            </div>
          </div>

          <div className="my-4 border-gray-100 border-t dark:border-slate-800" />

          {/* Breakdown Items */}
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between text-gray-500 dark:text-slate-400">
              <span>Nominal Wakaf</span>
              <span className="font-semibold text-gray-800 dark:text-slate-200">
                {formatRupiah(amount)}
              </span>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-slate-400">
              <span>Biaya Layanan</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Rp 0 (Gratis)
              </span>
            </div>
          </div>

          <div className="my-4 border-gray-100 border-t dark:border-slate-800" />

          {/* Total Metric */}
          <div>
            <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
              TOTAL WAKAF
            </span>
            <div className="mt-1">
              <span className="font-extrabold text-2xl text-[#356152] tracking-tight xl:text-3xl dark:text-emerald-400">
                {formatRupiah(amount)}
              </span>
            </div>
          </div>

          {/* Action CTA */}
          <div className="mt-5">
            <Button
              className="h-12 w-full bg-[#356152] font-bold text-base text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.99] disabled:opacity-50"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Lock aria-hidden="true" className="size-4" />
                  <span>Lanjutkan Pembayaran</span>
                </>
              )}
            </Button>
          </div>

          {/* Trust Seal */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-gray-400 text-xs">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 text-[#356152] dark:text-emerald-400"
            />
            <span>Pembayaran Aman &amp; Sesuai Syariah</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileStickyBottomBar({
  amount,
  submitting,
}: {
  amount: number;
  submitting: boolean;
}) {
  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 border-gray-200 border-t bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-md items-center justify-between gap-4">
        <div>
          <span className="block font-medium text-[11px] text-gray-400 uppercase tracking-wider dark:text-slate-400">
            Total Pembayaran
          </span>
          <span className="font-extrabold text-[#356152] text-lg dark:text-emerald-400">
            {formatRupiah(amount)}
          </span>
        </div>
        <Button
          className="bg-[#356152] px-6 py-3 font-bold text-sm text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.98] disabled:opacity-50"
          disabled={submitting}
          type="submit"
        >
          {submitting ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              <span>Memproses...</span>
            </>
          ) : (
            <>
              <Lock aria-hidden="true" className="size-4" />
              <span>Bayar Sekarang</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function DonateFormLoading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20">
      <LoaderCircle
        aria-hidden="true"
        className="mb-3 size-8 animate-spin text-[#356152]"
      />
      <p className="text-gray-500 text-xs">Menyiapkan formulir donasi...</p>
    </div>
  );
}

function DonateFormError({ error }: { error?: string }) {
  return (
    <div
      aria-live="polite"
      className="mx-auto my-8 flex max-w-md flex-col items-center rounded-3xl border border-rose-200 bg-rose-50 px-6 py-10 text-center dark:border-rose-900/50 dark:bg-rose-950/20"
      role="alert"
    >
      <AlertCircle
        aria-hidden="true"
        className="mb-3 size-10 text-rose-500 dark:text-rose-400"
      />
      <p className="font-bold text-gray-900 text-lg dark:text-white">
        Program tidak ditemukan
      </p>
      <p className="mt-1 text-gray-500 text-xs dark:text-slate-400">{error}</p>
      <Button asChild className="mt-5" type="button" variant="outline">
        <Link to="/wakaf">Kembali ke katalog</Link>
      </Button>
    </div>
  );
}

function DonateErrorAlert({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      className="mb-6 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-xs sm:text-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function DonateSuccessAlert({ message }: { message: string }) {
  return (
    <output
      aria-live="polite"
      className="mb-6 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-[#f2f6f4] p-4 font-medium text-emerald-800 text-xs sm:text-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
    >
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </output>
  );
}
