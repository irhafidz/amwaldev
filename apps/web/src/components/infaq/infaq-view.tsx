'use client';

import type { AkadAcceptanceInput } from '@amwal/core/contracts/akad';
import {
  MIN_DONATION_LABEL,
  MIN_DONATION_RUPIAH,
} from '@amwal/core/payment/limits';
import type { PaymentMethodCode } from '@amwal/core/payment/methods';
import {
  AlertCircle,
  HandHeart,
  LoaderCircle,
  Quote,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { AkadCheckbox } from '@/components/akad/akad-checkbox';
import {
  CARD,
  CheckoutSection,
  CTA,
} from '@/components/payment/checkout-layout';
import { PaymentMethodSelector } from '@/components/payment/payment-method-selector';
import { ShareButton } from '@/components/share/share-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequiredMark } from '@/components/ui/required-mark';
import { createInfaqOrder, getMyDonorProfile } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { CreateInfaqOrderInput, InfaqJenis } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { rememberDeviceOrder } from '@/lib/payment/device-orders';
import { paymentNextUrl } from '@/lib/payment-next-url';
import { InfaqDonorsTable } from './infaq-donors-table';
import { INFAQ_PROGRAMS, infaqLabel } from './infaq-programs';

const PRESETS = [10_000, 25_000, 50_000, 100_000, 250_000];
const INPUT_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-[#356152] focus:ring-2 focus:ring-[#356152]/20 dark:border-slate-700 dark:bg-slate-900';

function cacheOrder(orderId: string, payload: Record<string, unknown>) {
  try {
    sessionStorage.setItem(`amwal_order_${orderId}`, JSON.stringify(payload));
  } catch {
    // Storage is only an optimisation for the status page.
  }
}

function parseNominal(custom: string, preset: number | null): number {
  return preset ?? Number(custom.replace(/\D/g, ''));
}

function validate(nominal: number, anonymous: boolean, name: string) {
  if (!Number.isSafeInteger(nominal) || nominal < MIN_DONATION_RUPIAH) {
    return `Nominal infaq minimal ${MIN_DONATION_LABEL}.`;
  }
  if (!(anonymous || name.trim())) {
    return 'Nama donatur wajib diisi atau pilih opsi Hamba Allah.';
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Pesanan infaq belum dapat diproses. Coba lagi.';
}

function buildInput(f: {
  nominal: number;
  jenis: InfaqJenis;
  name: string;
  phone: string;
  email: string;
  doa: string;
  akad: AkadAcceptanceInput | null;
  anonymous: boolean;
  paymentType: PaymentMethodCode;
}): CreateInfaqOrderInput {
  return {
    nominal: f.nominal,
    jenis: f.jenis,
    namaPenginfaq: f.name.trim() || 'Hamba Allah',
    teleponPenginfaq: f.phone.trim() || undefined,
    emailPenginfaq: f.email.trim() || undefined,
    doa: f.doa.trim() || undefined,
    akadAcceptance: f.akad ?? undefined,
    paymentType: f.paymentType,
    isAnonymous: f.anonymous,
  };
}

export function InfaqView({ user }: { user: SessionUser | null }) {
  const profile = useResource(getMyDonorProfile, { enabled: Boolean(user) });
  const donor = profile.state.status === 'success' ? profile.state.data : null;

  const [jenis, setJenis] = useState<InfaqJenis>('INFAQ_UMUM');
  const [preset, setPreset] = useState<number | null>(50_000);
  const [custom, setCustom] = useState('');
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [doa, setDoa] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentMethodCode>('qris');
  const [akad, setAkad] = useState<AkadAcceptanceInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = nameInput ?? donor?.name ?? '';
  const phone = phoneInput ?? donor?.phone ?? '';
  const email = emailInput ?? donor?.email ?? '';
  const nominal = parseNominal(custom, preset);
  const akadModule = jenis.startsWith('SEDEKAH_') ? 'SEDEKAH' : 'INFAQ';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validate(nominal, anonymous, name);
    if (invalid) {
      setError(invalid);
      if (!Number.isSafeInteger(nominal) || nominal < MIN_DONATION_RUPIAH) {
        document.getElementById('infaq-custom')?.focus();
      } else if (!(anonymous || name.trim())) {
        document.getElementById('infaq-name')?.focus();
      }
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input = buildInput({
        nominal,
        jenis,
        name,
        phone,
        email,
        doa,
        akad,
        anonymous,
        paymentType,
      });
      const result = await createInfaqOrder(input);
      cacheOrder(result.orderId, { payment: result.payment, amount: nominal });
      rememberDeviceOrder({
        orderId: result.orderId,
        label: infaqLabel(jenis),
        amount: nominal,
      });
      window.location.assign(
        paymentNextUrl('infaq', {
          orderId: result.orderId,
          redirectUrl: result.snapRedirectUrl,
          payment: result.payment,
        })
      );
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full pb-28 lg:pb-12">
      <form onSubmit={submit}>
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
              Infaq &amp; Sedekah Berkah
            </h1>
            <p className="mt-1.5 max-w-2xl text-gray-500 text-sm">
              Alirkan sedekah jariyah secara rutin untuk kebaikan umat dan
              pendidikan santri.
            </p>
          </div>
          <ShareButton
            category="INFAQ"
            title="Infaq & Sedekah"
            url={typeof window === 'undefined' ? '' : window.location.href}
          />
        </header>

        {error && (
          <div
            className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
            role="alert"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-8">
            <CheckoutSection title="Alokasi Program Infaq">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {INFAQ_PROGRAMS.map((program) => {
                  const active = jenis === program.id;
                  return (
                    <button
                      aria-pressed={active}
                      className={`cursor-pointer rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? 'border-[#356152] bg-[#f2f6f4] ring-2 ring-[#356152]/20'
                          : 'border-[#e2ece8] bg-white hover:border-[#356152]/40'
                      }`}
                      key={program.id}
                      onClick={() => {
                        setJenis(program.id);
                        setAkad(null);
                      }}
                      type="button"
                    >
                      <span className="block font-bold text-gray-900 text-sm">
                        {program.title}
                      </span>
                      <span className="mt-1 block text-gray-500 text-xs">
                        {program.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CheckoutSection>

            <CheckoutSection title="Pilihan Nominal">
              <div className="flex flex-wrap gap-2.5">
                {PRESETS.map((value) => (
                  <button
                    aria-pressed={preset === value}
                    className={`cursor-pointer rounded-full border px-4 py-2 font-bold text-sm transition-all ${
                      preset === value
                        ? 'border-[#356152] bg-[#356152] text-white'
                        : 'border-[#e2ece8] bg-white text-gray-700 hover:border-[#356152]/40'
                    }`}
                    key={value}
                    onClick={() => {
                      setPreset(value);
                      setCustom('');
                    }}
                    type="button"
                  >
                    {formatRupiah(value)}
                  </button>
                ))}
              </div>
              <label
                className="mt-4 mb-1.5 block font-semibold text-gray-700 text-xs"
                htmlFor="infaq-custom"
              >
                Nominal lain (Rp)
              </label>
              <Input
                id="infaq-custom"
                inputMode="numeric"
                onChange={(e) => {
                  setCustom(e.target.value.replace(/\D/g, ''));
                  setPreset(null);
                }}
                placeholder="Contoh: 150000"
                value={custom}
              />
            </CheckoutSection>

            <CheckoutSection title="Data Donatur / Munfiq">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  htmlFor="infaq-name"
                  label={
                    <span>Nama donatur {!anonymous && <RequiredMark />}</span>
                  }
                >
                  <Input
                    disabled={anonymous}
                    id="infaq-name"
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Nama lengkap"
                    value={anonymous ? 'Hamba Allah' : name}
                  />
                </Field>
                <Field
                  htmlFor="infaq-phone"
                  label="No. WhatsApp (disarankan untuk bukti & tautan status)"
                >
                  <Input
                    autoComplete="tel"
                    id="infaq-phone"
                    inputMode="tel"
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="081211004001"
                    type="tel"
                    value={phone}
                  />
                </Field>
                <Field htmlFor="infaq-email" label="Email">
                  <Input
                    autoComplete="email"
                    id="infaq-email"
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="nama@email.com"
                    type="email"
                    value={email}
                  />
                </Field>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-gray-700 text-sm">
                <input
                  checked={anonymous}
                  className="mt-0.5 size-4 accent-[#356152]"
                  onChange={(e) => setAnonymous(e.target.checked)}
                  type="checkbox"
                />
                <div>
                  <span className="font-semibold text-gray-900 text-sm dark:text-white">
                    Sembunyikan identitas saya (Hamba Allah)
                  </span>
                  <p className="mt-0.5 text-gray-500 text-xs dark:text-slate-400">
                    Nama Anda akan tampil di daftar donatur publik kecuali
                    memilih opsi Hamba Allah ini.
                  </p>
                </div>
              </label>
              <Field
                className="mt-4"
                htmlFor="infaq-doa"
                label="Doa & harapan kebaikan (opsional)"
              >
                <textarea
                  className={`${INPUT_CLASS} resize-none`}
                  id="infaq-doa"
                  maxLength={500}
                  onChange={(e) => setDoa(e.target.value)}
                  placeholder="Semoga sedekah ini menjadi amal jariyah..."
                  rows={3}
                  value={doa}
                />
              </Field>
            </CheckoutSection>

            <CheckoutSection title="Metode Pembayaran">
              <PaymentMethodSelector
                amount={nominal}
                onChange={setPaymentType}
                value={paymentType}
              />
            </CheckoutSection>

            <AkadCheckbox
              disabled={submitting}
              key={akadModule}
              module={akadModule}
              onAccept={setAkad}
            />
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-span-4">
            <div className={`${CARD} hidden lg:block`}>
              <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
                RINGKASAN INFAQ
              </span>
              <div className="mt-3 space-y-2.5 text-sm">
                <Row label="Alokasi terpilih" value={infaqLabel(jenis)} />
                <Row
                  label="Nominal infaq"
                  value={nominal > 0 ? formatRupiah(nominal) : '—'}
                />
                <Row label="Biaya layanan" value="Rp 0 (Gratis)" />
                <div className="flex justify-between border-gray-100 border-t pt-3">
                  <span className="font-bold text-gray-900">Total Donasi</span>
                  <span className="font-extrabold text-[#356152] text-lg">
                    {nominal > 0 ? formatRupiah(nominal) : '—'}
                  </span>
                </div>
              </div>
              <Button
                className={`${CTA} mt-5 rounded-xl`}
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

            <div className="rounded-2xl border border-[#e2ece8] bg-[#f2f6f4] p-5">
              <Quote aria-hidden="true" className="size-5 text-[#356152]" />
              <p className="mt-2 font-medium text-[#1d352d] text-sm leading-relaxed">
                “Sedekah tidak akan mengurangi harta.”
              </p>
              <p className="mt-1.5 text-gray-500 text-xs">HR. Muslim</p>
            </div>
          </aside>
        </div>

        <div className="fixed right-0 bottom-0 left-0 z-30 border-gray-200 border-t bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div>
              <span className="block font-medium text-[11px] text-gray-400 uppercase">
                Total Donasi
              </span>
              <span className="font-extrabold text-[#356152] text-lg">
                {nominal > 0 ? formatRupiah(nominal) : '—'}
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
      <InfaqDonorsTable />
    </div>
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
      <HandHeart aria-hidden="true" className="size-4" />
      Salurkan Infaq Sekarang
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        className="mb-1.5 block font-semibold text-gray-700 text-xs"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
