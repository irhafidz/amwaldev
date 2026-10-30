'use client';

import type { AkadAcceptanceInput } from '@amwal/core/contracts/akad';
import type { PaymentMethodCode } from '@amwal/core/payment/methods';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  LoaderCircle,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
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
import { createZakatOrder, getMyDonorProfile } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { rememberDeviceOrder } from '@/lib/payment/device-orders';
import { paymentNextUrl } from '@/lib/payment-next-url';
import type { ZakatCheckoutSearch } from '@/routes/zakat/checkout';

function cacheOrder(orderId: string, payload: Record<string, unknown>) {
  try {
    sessionStorage.setItem(`amwal_order_${orderId}`, JSON.stringify(payload));
  } catch {
    // Storage is only an optimisation for the status page.
  }
}

export function ZakatCheckout({
  search,
  user,
}: {
  search: ZakatCheckoutSearch;
  user: SessionUser | null;
}) {
  const profile = useResource(getMyDonorProfile, { enabled: Boolean(user) });
  // Tamu (QA-04, D3): nama wajib untuk niat dan pencatatan amil; email/WA opsional.
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentMethodCode>('qris');
  const [doa, setDoa] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [akad, setAkad] = useState<AkadAcceptanceInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const invalid = guestNameError(Boolean(user), guestName);
    if (invalid) {
      setError(invalid);
      document.getElementById('zakat-guest-name')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const result = await createZakatOrder({
        programId: `ZAKAT_${search.jenis}`,
        amount: search.amount,
        paymentType,
        jenisZakat: search.jenis,
        isAnonymous: anonymous,
        akadAcceptance: akad ?? undefined,
        jumlahJiwa: search.jiwa,
        namaDizakatkan: search.names?.join(', ') || undefined,
        doa: doa.trim() || undefined,
        ...(user ? {} : guestIdentity(guestName, guestEmail, guestPhone)),
      });
      if (!('redirectUrl' in result)) {
        setError('Metode pembayaran ini memerlukan verifikasi manual.');
        return;
      }
      cacheOrder(result.orderId, {
        payment: result.payment,
        amount: search.amount,
      });
      rememberDeviceOrder({
        orderId: result.orderId,
        label: search.label,
        amount: search.amount,
      });
      window.location.assign(paymentNextUrl('zakat', result));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Gagal memproses pembayaran zakat. Coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const donor = profile.state.status === 'success' ? profile.state.data : null;

  return (
    <form className="w-full pb-28 lg:pb-12" onSubmit={submit}>
      <Button asChild className="mb-4" size="sm" type="button" variant="ghost">
        <Link to="/zakat/kalkulator">
          <ArrowLeft aria-hidden="true" className="mr-1.5 size-4" />
          Kembali ke Kalkulator
        </Link>
      </Button>
      <h1 className="mb-5 font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
        Pembayaran {search.label}
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
          <Section title="Data Muzakki">
            <MuzakkiFields
              donor={donor}
              email={guestEmail}
              name={guestName}
              onEmail={setGuestEmail}
              onName={setGuestName}
              onPhone={setGuestPhone}
              phone={guestPhone}
              signedIn={Boolean(user)}
            />
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-gray-700 text-sm dark:text-slate-300">
              <input
                checked={anonymous}
                className="size-4 accent-[#356152]"
                onChange={(e) => setAnonymous(e.target.checked)}
                type="checkbox"
              />
              Sembunyikan nama saya di publik (Hamba Allah)
            </label>
            <p className="mt-1.5 text-gray-500 text-xs dark:text-slate-400">
              Nama tetap tercatat untuk niat zakat dan pembukuan amil; hanya
              tampilan publik dan sertifikat publik yang disamarkan.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block font-semibold text-gray-900 text-sm dark:text-white">
                Doa &amp; harapan (opsional)
              </span>
              <textarea
                className="w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-[#356152] focus:ring-2 focus:ring-[#356152]/20 dark:border-slate-700 dark:bg-slate-900"
                maxLength={500}
                onChange={(e) => setDoa(e.target.value)}
                placeholder="Semoga zakat ini menjadi berkah..."
                rows={3}
                value={doa}
              />
            </label>
          </Section>

          <Section title="Metode Pembayaran">
            <PaymentMethodSelector
              amount={search.amount}
              onChange={setPaymentType}
              value={paymentType}
            />
          </Section>

          <Section title="Rincian Pesanan">
            <OrderRows search={search} />
          </Section>

          <Section title="Akad Zakat">
            <AkadCheckbox
              disabled={submitting}
              module="ZAKAT"
              onAccept={setAkad}
            />
          </Section>
        </div>

        <aside className="hidden lg:col-span-5 lg:block xl:col-span-4">
          <div className={`${CARD} sticky top-6`}>
            <span className="block font-bold text-[11px] text-gray-400 uppercase tracking-wider">
              RINGKASAN
            </span>
            <div className="mt-3">
              <OrderRows search={search} />
            </div>
            <p className="mt-4 rounded-xl bg-[#f2f6f4] p-3 text-[#1d352d] text-xs dark:bg-emerald-950/30 dark:text-emerald-300">
              Zakat disalurkan melalui lembaga amil Amwal kepada 8 asnaf yang
              berhak.
            </p>
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
              Total Zakat
            </span>
            <span className="font-extrabold text-[#356152] text-lg">
              {formatRupiah(search.amount)}
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
      Lanjutkan Pembayaran
    </>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300">
        {label}
      </span>
      <Input
        aria-label={label}
        className="bg-gray-50 text-gray-600"
        disabled
        value={value ?? '—'}
      />
    </div>
  );
}

function OrderRows({ search }: { search: ZakatCheckoutSearch }) {
  const rows: [string, string][] = [['Jenis zakat', search.label]];
  if (search.jiwa) {
    rows.push(['Jumlah jiwa', String(search.jiwa)]);
  }
  if (search.names?.length) {
    rows.push(['Atas nama', search.names.join(', ')]);
  }
  if (search.harta) {
    rows.push(['Harta kena zakat', formatRupiah(search.harta)]);
  }
  if (search.nisab) {
    rows.push(['Nisab (85 g emas)', formatRupiah(search.nisab)]);
  }
  rows.push(['Biaya layanan', 'Rp 0 (Gratis)']);

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
          Total Zakat
        </span>
        <span className="font-extrabold text-[#356152] text-lg">
          {formatRupiah(search.amount)}
        </span>
      </div>
    </div>
  );
}

const MIN_GUEST_NAME = 2;

function guestNameError(signedIn: boolean, name: string): string | null {
  return signedIn || name.trim().length >= MIN_GUEST_NAME
    ? null
    : 'Nama muzakki wajib diisi (minimal 2 karakter).';
}

function guestIdentity(name: string, email: string, phone: string) {
  return {
    donorName: name.trim(),
    donorEmail: email.trim() || undefined,
    donorPhone: phone.trim() || undefined,
  };
}

function MuzakkiFields({
  signedIn,
  donor,
  ...guest
}: {
  signedIn: boolean;
  donor: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  name: string;
  email: string;
  phone: string;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  if (!signedIn) {
    return <GuestFields {...guest} />;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ReadOnly label="Nama lengkap" value={donor?.name} />
      <ReadOnly label="Email" value={donor?.email} />
      <ReadOnly label="WhatsApp" value={donor?.phone} />
    </div>
  );
}

function GuestFields({
  name,
  email,
  phone,
  onName,
  onEmail,
  onPhone,
}: {
  name: string;
  email: string;
  phone: string;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label
          className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300"
          htmlFor="zakat-guest-name"
        >
          Nama muzakki <RequiredMark />
        </label>
        <Input
          autoComplete="name"
          id="zakat-guest-name"
          maxLength={100}
          onChange={(event) => onName(event.target.value)}
          placeholder="Nama lengkap pembayar zakat"
          required
          value={name}
        />
      </div>
      <div>
        <label
          className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300"
          htmlFor="zakat-guest-email"
        >
          Email (opsional)
        </label>
        <Input
          autoComplete="email"
          id="zakat-guest-email"
          onChange={(event) => onEmail(event.target.value)}
          placeholder="email@contoh.id"
          type="email"
          value={email}
        />
      </div>
      <div>
        <label
          className="mb-1.5 block font-semibold text-gray-700 text-xs dark:text-slate-300"
          htmlFor="zakat-guest-phone"
        >
          WhatsApp (opsional)
        </label>
        <Input
          autoComplete="tel"
          id="zakat-guest-phone"
          inputMode="tel"
          maxLength={20}
          onChange={(event) => onPhone(event.target.value)}
          placeholder="08xxxxxxxxxx"
          type="tel"
          value={phone}
        />
      </div>
      <p className="text-gray-500 text-xs sm:col-span-2 dark:text-slate-400">
        Tanpa akun pun transaksi tersimpan di perangkat ini dan bisa dibuka
        lewat tautan status. Isi WhatsApp agar bukti dan kabar penyaluran sampai
        ke Anda.
      </p>
    </div>
  );
}
