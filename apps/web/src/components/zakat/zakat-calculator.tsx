'use client';

import {
  calculateZakatMaal,
  DEFAULT_FITRAH_PRICE_PER_PERSON,
} from '@amwal/core/zakat/calculator';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  Coins,
  HeartHandshake,
  Lock,
  Users,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GreenPatternOverlay } from '@/components/ui/green-pattern-overlay';
import { Input } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { calculateZakat, getLiveGoldPrice } from '@/lib/amwal-api';
import { formatRupiah } from '@/lib/amwal-api/format';
import type { LiveGoldPrice } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';

type Tab = 'FITRAH' | 'MAAL';
type MaalType = 'PENGHASILAN' | 'PERUSAHAAN' | 'PERDAGANGAN' | 'EMAS';

const NON_DIGITS = /\D/g;
const LEADING_ZEROES = /^0+/;
const MAX_JIWA = 50;

const PILL_ACTIVE = 'border-[#356152] bg-[#356152] text-white shadow-xs';
const PILL_IDLE =
  'border-gray-200 bg-white text-gray-600 hover:border-[#356152]/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
const CARD =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900';

interface Field {
  key: string;
  label: string;
  hint: string;
  kind: 'rupiah' | 'gram';
}

interface MaalConfig {
  label: string;
  /** DB enum has no PERDAGANGAN; trade zakat is booked as PERUSAHAAN. */
  jenisZakat: 'MAAL_PENGHASILAN' | 'PERUSAHAAN' | 'EMAS';
  title: string;
  fields: Field[];
  /** Net zakatable wealth, annual basis, in whole rupiah. */
  wealth: (v: Record<string, string>, goldPrice: number) => number;
}

const rupiah = (v: string) => Number(v.replace(NON_DIGITS, '')) || 0;
const gram = (v: string) => Number.parseFloat(v.replace(',', '.')) || 0;

const MAAL_TYPES: Record<MaalType, MaalConfig> = {
  PENGHASILAN: {
    label: 'Penghasilan / Profesi',
    jenisZakat: 'MAAL_PENGHASILAN',
    title: 'Zakat Penghasilan',
    fields: [
      {
        key: 'gaji',
        label: 'Gaji per bulan (dihitung ×12 setahun)',
        hint: 'Masukkan gaji atau penghasilan bersih bulanan Anda',
        kind: 'rupiah',
      },
      {
        key: 'bonus',
        label: 'Bonus / THR (per tahun)',
        hint: 'Opsional (ditambahkan ke total akumulasi tahunan)',
        kind: 'rupiah',
      },
    ],
    wealth: (v) => rupiah(v.gaji ?? '') * 12 + rupiah(v.bonus ?? ''),
  },
  PERUSAHAAN: {
    label: 'Perusahaan',
    jenisZakat: 'PERUSAHAAN',
    title: 'Zakat Perusahaan',
    fields: [
      {
        key: 'asetLancar',
        label: 'Total aset lancar',
        hint: 'Kas, piutang lancar, persediaan',
        kind: 'rupiah',
      },
      {
        key: 'kewajiban',
        label: 'Kewajiban jatuh tempo',
        hint: 'Utang yang harus dibayar dalam waktu dekat',
        kind: 'rupiah',
      },
    ],
    wealth: (v) =>
      Math.max(0, rupiah(v.asetLancar ?? '') - rupiah(v.kewajiban ?? '')),
  },
  PERDAGANGAN: {
    label: 'Perdagangan',
    jenisZakat: 'PERUSAHAAN',
    title: 'Zakat Perdagangan',
    fields: [
      {
        key: 'modalStok',
        label: 'Modal / stok dagang',
        hint: 'Nilai barang dagangan saat ini',
        kind: 'rupiah',
      },
      {
        key: 'labaBersih',
        label: 'Keuntungan bersih',
        hint: 'Setelah biaya operasional',
        kind: 'rupiah',
      },
      {
        key: 'utangDagang',
        label: 'Utang jatuh tempo',
        hint: 'Dikurangkan dari total',
        kind: 'rupiah',
      },
    ],
    wealth: (v) =>
      Math.max(
        0,
        rupiah(v.modalStok ?? '') +
          rupiah(v.labaBersih ?? '') -
          rupiah(v.utangDagang ?? '')
      ),
  },
  EMAS: {
    label: 'Emas / Logam Mulia',
    jenisZakat: 'EMAS',
    title: 'Zakat Emas',
    fields: [
      {
        key: 'beratEmas',
        label: 'Berat emas (gram)',
        hint: 'Wajib jika mencapai 85 gram',
        kind: 'gram',
      },
    ],
    wealth: (v, price) => Math.round(gram(v.beratEmas ?? '') * price),
  },
};

function toThousands(raw: string): string {
  const digits = raw.replace(NON_DIGITS, '').replace(LEADING_ZEROES, '');
  return digits ? Number(digits).toLocaleString('id-ID') : '';
}

export function ZakatCalculator() {
  const [tab, setTab] = useState<Tab>('FITRAH');
  const [showAsnafDialog, setShowAsnafDialog] = useState(false);

  return (
    <section className="w-full pb-28 lg:pb-12">
      <header className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
            <Calculator aria-hidden="true" className="size-6 text-[#356152]" />
            Kalkulator Zakat
          </h1>
          <p className="mt-1 text-gray-500 text-sm dark:text-slate-400">
            Hitung zakat fitrah dan zakat maal sesuai ketentuan syariah.
          </p>
        </div>
        <Button
          className="gap-1.5 self-start border-[#356152]/30 font-semibold text-[#356152] hover:bg-[#356152]/10 sm:self-auto dark:border-emerald-600 dark:text-emerald-400"
          onClick={() => setShowAsnafDialog(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <BookOpen aria-hidden="true" className="size-4" />
          Pelajari 8 Asnaf &amp; Syarat Zakat
        </Button>
      </header>

      <SegmentedTabs
        className="mb-5"
        label="Jenis zakat"
        onChange={setTab}
        tabs={[
          { id: 'FITRAH', label: 'Zakat Fitrah' },
          { id: 'MAAL', label: 'Zakat Maal' },
        ]}
        value={tab}
      />

      {tab === 'FITRAH' ? <FitrahCalculator /> : <MaalCalculator />}

      <AsnafAndSyaratDialog
        isOpen={showAsnafDialog}
        onClose={() => setShowAsnafDialog(false)}
      />
    </section>
  );
}

function SummaryCard({
  eyebrow,
  total,
  rows,
  cta,
  children,
}: {
  eyebrow: string;
  total: string;
  rows: [string, string][];
  cta: ReactNode;
  children?: ReactNode;
}) {
  return (
    <aside className="lg:col-span-5 xl:col-span-4">
      <div className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d352d] to-[#2b4f43] p-6 text-white shadow-sm lg:sticky lg:top-6">
        <GreenPatternOverlay size="md" />
        <span className="block font-bold text-[11px] text-white/60 uppercase tracking-wider">
          {eyebrow}
        </span>
        <p className="mt-1 font-extrabold text-3xl tracking-tight">{total}</p>
        {children}
        <dl className="mt-4 space-y-2 border-white/15 border-t pt-4 text-xs">
          {rows.map(([label, value]) => (
            <div className="flex justify-between gap-3" key={label}>
              <dt className="text-white/70">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5">{cta}</div>
      </div>
    </aside>
  );
}

const PAY_BUTTON =
  'h-12 w-full bg-white font-bold text-[#1d352d] hover:bg-[#e2ece8] disabled:opacity-50';

function FitrahCalculator() {
  const priceResource = useResource(() =>
    calculateZakat({ jenisZakat: 'FITRAH', jumlahJiwa: 1 })
  );
  const [jiwa, setJiwa] = useState(1);
  const [names, setNames] = useState<string[]>(['']);

  // Loading or a failed lookup shows the standard rate instead of an error.
  const pricePerJiwa =
    priceResource.state.status === 'success'
      ? Number(priceResource.state.data.hargaAcuan.fitrahPricePerJiwa ?? 0)
      : Number(DEFAULT_FITRAH_PRICE_PER_PERSON);
  const total = pricePerJiwa * jiwa;
  const filledNames = names.filter((n) => n.trim()).length;

  const changeJiwa = (next: number) => {
    const clamped = Math.min(MAX_JIWA, Math.max(1, next));
    setJiwa(clamped);
    setNames((prev) =>
      Array.from({ length: clamped }, (_, i) => prev[i] ?? '')
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
        <div className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d352d] to-[#2b4f43] p-6 text-white">
          <GreenPatternOverlay size="md" />
          <h2 className="font-extrabold text-xl">
            Tunaikan Zakat Tepat Sasaran bagi 8 Asnaf
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-white/75">
            Zakat fitrah wajib bagi setiap jiwa muslim dan disalurkan kepada
            delapan golongan yang berhak menerimanya.
          </p>
        </div>

        <div className={CARD}>
          <h3 className="font-bold text-gray-900 text-sm dark:text-white">
            Bentuk zakat fitrah
          </h3>
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-[#356152] bg-[#f2f6f4] p-4 ring-2 ring-[#356152]/15 dark:bg-emerald-950/30">
            <div>
              <p className="font-bold text-gray-900 text-sm dark:text-white">
                Uang tunai (setara beras)
              </p>
              <p className="text-gray-500 text-xs">
                Nilai ditetapkan lembaga amil per jiwa
              </p>
            </div>
            <p className="font-extrabold text-[#356152]">
              {formatRupiah(pricePerJiwa)}/jiwa
            </p>
          </div>
        </div>

        <div className={CARD}>
          <h3 className="mb-3 flex items-center gap-2 font-bold text-gray-900 text-sm dark:text-white">
            <Users aria-hidden="true" className="size-4 text-[#356152]" />
            Jumlah jiwa
          </h3>
          <p className="mb-3 text-gray-500 text-xs dark:text-slate-400">
            Satu jiwa = satu kuota zakat fitrah ({formatRupiah(pricePerJiwa)}).
            Tambahkan jiwa sebanyak anggota yang dizakatkan.
          </p>
          <div className="flex items-center gap-3">
            <Button
              aria-label="Kurangi jiwa"
              onClick={() => changeJiwa(jiwa - 1)}
              type="button"
              variant="outline"
            >
              −
            </Button>
            <span className="w-10 text-center font-extrabold text-xl">
              {jiwa}
            </span>
            <Button
              aria-label="Tambah jiwa"
              onClick={() => changeJiwa(jiwa + 1)}
              type="button"
              variant="outline"
            >
              +
            </Button>
            <span className="text-gray-500 text-xs dark:text-slate-400">
              {jiwa} jiwa × {formatRupiah(pricePerJiwa)} ={' '}
              <strong className="text-gray-900 dark:text-white">
                {formatRupiah(total)}
              </strong>
            </span>
          </div>

          <fieldset className="mt-5 border-gray-100 border-t pt-4 dark:border-slate-800">
            <legend className="font-bold text-gray-900 text-xs dark:text-white">
              Nama setiap jiwa (opsional)
            </legend>
            <p className="mt-1 mb-3 text-gray-500 text-xs dark:text-slate-400">
              {filledNames} dari {jiwa} nama terisi. Nama dicantumkan pada bukti
              zakat; boleh dikosongkan.
            </p>
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {names.map((name, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list keyed by position
                <li className="flex items-center gap-2.5" key={i}>
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e2ece8] font-bold text-[#1d352d] text-xs"
                  >
                    {i + 1}
                  </span>
                  <Input
                    aria-label={`Nama shohibul zakat ${i + 1}`}
                    onChange={(e) =>
                      setNames((prev) =>
                        prev.map((n, j) => (j === i ? e.target.value : n))
                      )
                    }
                    placeholder={`Nama jiwa ke-${i + 1}`}
                    value={name}
                  />
                </li>
              ))}
            </ol>
          </fieldset>
        </div>
      </div>

      <SummaryCard
        cta={
          <Button asChild className={PAY_BUTTON} disabled={total <= 0}>
            <Link
              search={{
                jenis: 'FITRAH',
                label: 'Zakat Fitrah',
                amount: total,
                jiwa,
                names: names.map((n) => n.trim()).filter(Boolean),
              }}
              to="/zakat/checkout"
            >
              <Lock aria-hidden="true" className="size-4" />
              Bayar Zakat
            </Link>
          </Button>
        }
        eyebrow="TOTAL ZAKAT FITRAH"
        rows={[
          ['Jumlah jiwa', String(jiwa)],
          ['Per jiwa', formatRupiah(pricePerJiwa)],
        ]}
        total={formatRupiah(total)}
      />
    </div>
  );
}

function getMaalStatus(wajib: boolean, wealth: number, nisab: number) {
  if (nisab <= 0) {
    // Harga emas belum ada: nisab tidak bisa dibandingkan, jangan menyimpulkan.
    return {
      label: 'Menunggu Harga Emas',
      badgeClass: 'bg-white/15 text-white/80',
    };
  }
  if (wajib) {
    return {
      label: 'Wajib Zakat',
      badgeClass: 'bg-emerald-300 font-bold text-slate-950',
    };
  }
  if (wealth > 0) {
    return {
      label: 'Belum Mencapai Nisab',
      badgeClass: 'bg-amber-300 font-bold text-slate-950',
    };
  }
  return {
    label: 'Belum Ada Harta',
    badgeClass: 'bg-white/15 text-white/80',
  };
}

function MaalCtaButton({
  wajib,
  wealth,
  zakat,
  config,
  nisab,
}: {
  wajib: boolean;
  wealth: number;
  zakat: number;
  config: MaalConfig;
  nisab: number;
}) {
  if (wajib && zakat > 0) {
    return (
      <Button asChild className={PAY_BUTTON}>
        <Link
          search={{
            jenis: config.jenisZakat,
            label: config.title,
            amount: zakat,
            harta: wealth,
            nisab,
          }}
          to="/zakat/checkout"
        >
          <Lock aria-hidden="true" className="size-4" />
          Bayar Zakat
        </Link>
      </Button>
    );
  }

  if (wealth > 0 && nisab > 0) {
    return (
      <div className="space-y-2.5">
        <div className="rounded-xl bg-white/10 p-3 text-white/90 text-xs">
          <p className="font-semibold text-amber-200">
            Belum Mencapai Nisab Zakat
          </p>
          <p className="mt-1 text-white/80 leading-relaxed">
            Harta Anda belum mencapai batas nisab (85 gram emas). Belum ada
            kewajiban zakat mal, namun Anda tetap dapat menyalurkan infaq
            sukarela untuk membersihkan harta.
          </p>
        </div>
        <Button
          asChild
          className="h-11 w-full bg-white font-bold text-[#1d352d] hover:bg-[#e2ece8]"
        >
          <Link to="/infaq">
            <HeartHandshake
              aria-hidden="true"
              className="size-4 text-[#356152]"
            />
            Tunaikan Infaq Sekarang
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <Button className={PAY_BUTTON} disabled type="button">
      {nisab > 0 ? 'Masukkan Nilai Harta' : 'Menunggu Harga Emas'}
    </Button>
  );
}

function MaalNisabProgress({
  wealth,
  nisab,
  wajib,
  diffNisab,
  progressPercent,
}: {
  wealth: number;
  nisab: number;
  wajib: boolean;
  diffNisab: number;
  progressPercent: number;
}) {
  if (wealth <= 0 || nisab <= 0) {
    return null;
  }

  const progressBarColor = wajib ? 'bg-emerald-300' : 'bg-amber-300';

  return (
    <div className="rounded-xl bg-white/10 p-2.5">
      <div className="flex items-center justify-between font-medium text-[11px] text-white/80">
        <span>Capaian Nisab</span>
        <span className="font-bold text-white">{progressPercent}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className={`h-full transition-all duration-300 ${progressBarColor}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {!wajib && (
        <p className="mt-1.5 text-[11px] text-amber-200/90 leading-tight">
          Kurang {formatRupiah(diffNisab)} untuk mencapai batas nisab wajib
          zakat.
        </p>
      )}
    </div>
  );
}

function MaalCalculator() {
  const goldResource = useResource(getLiveGoldPrice);
  const [type, setType] = useState<MaalType>('PENGHASILAN');
  const [values, setValues] = useState<Record<string, string>>({});

  const config = MAAL_TYPES[type];
  const goldPrice =
    goldResource.state.status === 'success'
      ? Number(goldResource.state.data.price)
      : 0;
  const wealth = config.wealth(values, goldPrice);
  const calc =
    goldPrice > 0
      ? calculateZakatMaal(BigInt(wealth), BigInt(Math.round(goldPrice)))
      : null;
  const wajib = Boolean(calc?.wajibZakat) && wealth > 0;
  const zakat = calc ? Number(calc.zakatAmount) : 0;
  const nisab = calc ? Number(calc.nisab) : 0;
  const diffNisab = Math.max(0, nisab - wealth);
  const progressPercent =
    nisab > 0 ? Math.min(100, Math.floor((wealth / nisab) * 100)) : 0;

  const setField = (field: Field, raw: string) =>
    setValues((prev) => ({
      ...prev,
      [field.key]:
        field.kind === 'rupiah'
          ? toThousands(raw)
          : raw.replace(/[^\d.,]/g, ''),
    }));

  const status = getMaalStatus(wajib, wealth, nisab);
  const rows: [string, string][] = [
    ['Harta dihitung', formatRupiah(wealth)],
    ['Nisab (85 g emas)', calc ? formatRupiah(nisab) : '—'],
  ];
  if (!wajib && wealth > 0 && nisab > 0) {
    rows.push(['Kurang dari nisab', `-${formatRupiah(diffNisab)}`]);
  }
  if (type === 'PENGHASILAN' && wajib) {
    rows.push(['≈ per bulan', formatRupiah(Math.ceil(zakat / 12))]);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <div className="flex flex-col gap-5 lg:col-span-7 xl:col-span-8">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MAAL_TYPES) as MaalType[]).map((key) => (
            <button
              aria-pressed={type === key}
              className={`cursor-pointer rounded-full border px-4 py-1.5 font-semibold text-xs transition-all ${
                type === key ? PILL_ACTIVE : PILL_IDLE
              }`}
              key={key}
              onClick={() => setType(key)}
              type="button"
            >
              {MAAL_TYPES[key].label}
            </button>
          ))}
        </div>

        <NisabCallout resource={goldResource} />

        <div className={`${CARD} space-y-4`}>
          {config.fields.map((field) => (
            <div key={field.key}>
              <label
                className="mb-1.5 block font-semibold text-gray-900 text-sm dark:text-white"
                htmlFor={`zakat-${field.key}`}
              >
                {field.label}
              </label>
              <Input
                id={`zakat-${field.key}`}
                inputMode={field.kind === 'rupiah' ? 'numeric' : 'decimal'}
                onChange={(e) => setField(field, e.target.value)}
                placeholder={field.kind === 'rupiah' ? 'Rp 0' : '0'}
                value={values[field.key] ?? ''}
              />
              <span className="mt-1 block text-gray-500 text-xs">
                {field.hint}
              </span>
            </div>
          ))}
        </div>
      </div>

      <SummaryCard
        cta={
          <MaalCtaButton
            config={config}
            nisab={nisab}
            wajib={wajib}
            wealth={wealth}
            zakat={zakat}
          />
        }
        eyebrow={config.title.toUpperCase()}
        rows={rows}
        total={formatRupiah(zakat)}
      >
        <div className="mt-3 space-y-2">
          <span
            className={`inline-block rounded-full px-3 py-1 font-bold text-[11px] uppercase tracking-wider ${status.badgeClass}`}
          >
            {status.label}
          </span>

          <MaalNisabProgress
            diffNisab={diffNisab}
            nisab={nisab}
            progressPercent={progressPercent}
            wajib={wajib}
            wealth={wealth}
          />
        </div>
      </SummaryCard>
    </div>
  );
}

function NisabCallout({
  resource,
}: {
  resource: ReturnType<typeof useResource<LiveGoldPrice>>;
}) {
  if (resource.state.status === 'error') {
    return <ErrorBox message={resource.state.error} />;
  }
  if (resource.state.status === 'loading') {
    return <div className="h-16 animate-pulse rounded-2xl bg-gray-200" />;
  }
  const price = Number(resource.state.data.price);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-amber-900">
      <Coins aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm">
        <p className="font-bold">
          Nisab: 85 gram emas = {formatRupiah(price * 85)}
        </p>
        <p className="mt-0.5 text-xs opacity-90">
          Harga emas {formatRupiah(price)}/gram · kadar zakat 2,5%
          {resource.state.data.isStale
            ? ' · harga terakhir tersimpan (penyedia sedang tidak tersedia)'
            : ''}
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
      role="alert"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function AsnafAndSyaratDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="asnaf-dialog-title"
      aria-modal="true"
      className="fade-in fixed inset-0 z-[60] flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150"
      role="dialog"
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-gray-100 border-b pb-4 dark:border-slate-800">
          <div>
            <h2
              className="font-bold text-gray-900 text-lg dark:text-white"
              id="asnaf-dialog-title"
            >
              Panduan 8 Asnaf &amp; Syarat Zakat Mal
            </h2>
            <p className="mt-0.5 text-gray-500 text-xs dark:text-slate-400">
              Ketentuan syariat penerima zakat (QS At-Taubah: 60) dan syarat
              wajibnya
            </p>
          </div>
          <button
            aria-label="Tutup dialog"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          <section>
            <h3 className="flex items-center gap-2 font-bold text-gray-900 text-sm dark:text-white">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-[#356152]"
              />
              Syarat Wajib Zakat Mal
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <p className="font-semibold text-gray-900 dark:text-white">
                  1. Islam &amp; Merdeka
                </p>
                <p className="mt-0.5 text-gray-500 dark:text-slate-400">
                  Kewajiban bagi setiap muslim yang merdeka.
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <p className="font-semibold text-gray-900 dark:text-white">
                  2. Milik Sempurna (Al-Milkut Taam)
                </p>
                <p className="mt-0.5 text-gray-500 dark:text-slate-400">
                  Harta berada di bawah kuasa penuh pemiliknya.
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <p className="font-semibold text-gray-900 dark:text-white">
                  3. Mencapai Nisab
                </p>
                <p className="mt-0.5 text-gray-500 dark:text-slate-400">
                  Batas minimal harta (setara 85 gram emas untuk zakat mal).
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                <p className="font-semibold text-gray-900 dark:text-white">
                  4. Mencapai Haul
                </p>
                <p className="mt-0.5 text-gray-500 dark:text-slate-400">
                  Telah dimiliki selama satu tahun penuh (12 bulan).
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-2 font-bold text-gray-900 text-sm dark:text-white">
              <Users aria-hidden="true" className="size-4 text-[#356152]" />8
              Asnaf (Golongan Penerima Zakat)
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                {
                  name: '1. Fakir',
                  desc: 'Tidak punya harta & penghasilan cukup untuk kebutuhan pokok.',
                },
                {
                  name: '2. Miskin',
                  desc: 'Punya sedikit harta/penghasilan tetapi belum mencukupi.',
                },
                {
                  name: '3. Amil',
                  desc: 'Petugas resmi pengumpul, pencatat, dan penyalur zakat.',
                },
                {
                  name: '4. Muallaf',
                  desc: 'Orang yang baru masuk Islam dan membutuhkan penguatan iman.',
                },
                {
                  name: '5. Riqab',
                  desc: 'Upaya membebaskan hamba sahaya atau korban eksploitasi.',
                },
                {
                  name: '6. Gharim',
                  desc: 'Orang yang berutang untuk memenuhi kebutuhan hidup mendesak.',
                },
                {
                  name: '7. Fisabilillah',
                  desc: 'Aktivitas dakwah, kebaikan, dan perjuangan di jalan Allah.',
                },
                {
                  name: '8. Ibnu Sabil',
                  desc: 'Musafir yang kehabisan bekal dalam perjalanan ketaatan.',
                },
              ].map((item) => (
                <div
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                  key={item.name}
                >
                  <p className="font-semibold text-[#356152] dark:text-emerald-400">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-gray-600 dark:text-slate-400">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-gray-100 border-t pt-4 dark:border-slate-800">
          <Link
            className="flex items-center gap-1.5 font-semibold text-[#356152] text-xs hover:underline dark:text-emerald-400"
            onClick={onClose}
            params={{ slug: '8-asnaf' }}
            to="/edukasi/$slug"
          >
            <BookOpen aria-hidden="true" className="size-4" />
            Buka Materi Edukasi Lengkap &amp; Ikuti Kuis 8 Asnaf →
          </Link>
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
