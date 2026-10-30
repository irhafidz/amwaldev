'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import {
  type OfflineZakatInput,
  submitOfflineZakat,
} from '@/lib/amwal-api/admin';
import { orpc } from '@/lib/orpc/client';

interface JenisOption {
  kode: OfflineZakatInput['jenisZakat'];
  label: string;
}

const emptyForm: OfflineZakatInput = {
  namaMuzakki: '',
  noTelepon: '',
  alamat: '',
  isAnonymous: false,
  jenisZakat: 'MAAL_PENGHASILAN',
  metodePembayaran: 'TUNAI',
};

function buildPayload(
  form: OfflineZakatInput,
  extra: {
    isBeras: boolean;
    nominal: string;
    berasKg: string;
    jiwa: string;
  }
): OfflineZakatInput {
  return {
    ...form,
    namaMuzakki: form.isAnonymous ? 'Hamba Allah' : form.namaMuzakki.trim(),
    noTelepon: form.noTelepon?.trim() || undefined,
    alamat: form.alamat?.trim() || undefined,
    nominal: extra.isBeras ? undefined : Number(extra.nominal),
    beratBerasKg: extra.isBeras ? Number(extra.berasKg) : undefined,
    jumlahJiwa: extra.jiwa ? Number(extra.jiwa) : undefined,
  };
}

export function OfflineZakatView() {
  const { showToast } = useToast();
  const [form, setForm] = useState<OfflineZakatInput>(emptyForm);
  const [nominal, setNominal] = useState('');
  const [berasKg, setBerasKg] = useState('');
  const [jiwa, setJiwa] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastKwitansi, setLastKwitansi] = useState<string | null>(null);
  // Jenis zakat aktif dari Master Data admin.
  const [jenisOptions, setJenisOptions] = useState<JenisOption[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch-once on mount
  useEffect(() => {
    orpc.amil
      .jenisZakatOptions()
      .then((res) => {
        setJenisOptions(res.data);
        const first = res.data[0];
        setForm((prev) =>
          first && !res.data.some((o) => o.kode === prev.jenisZakat)
            ? { ...prev, jenisZakat: first.kode }
            : prev
        );
      })
      .catch(() =>
        showToast({
          title: 'Gagal memuat jenis zakat',
          description: 'Daftar jenis zakat dari Master Data tidak tersedia.',
          type: 'error',
        })
      );
  }, []);
  const jenisLabel =
    jenisOptions.find((o) => o.kode === form.jenisZakat)?.label ??
    form.jenisZakat;

  const set = <K extends keyof OfflineZakatInput>(
    key: K,
    value: OfflineZakatInput[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const isBeras = form.metodePembayaran === 'BERAS';

  const openConfirm = () => {
    if (form.namaMuzakki.trim().length < 2 && !form.isAnonymous) {
      showToast({ title: 'Nama muzakki wajib diisi.', type: 'error' });
      return;
    }
    if (isBeras ? !(Number(berasKg) > 0) : !(Number(nominal) > 0)) {
      showToast({
        title: isBeras
          ? 'Berat beras (kg) wajib diisi.'
          : 'Nominal (Rp) wajib diisi.',
        type: 'error',
      });
      return;
    }
    setConfirm(true);
  };

  const resetForm = () => {
    setForm({
      ...emptyForm,
      jenisZakat: jenisOptions[0]?.kode ?? emptyForm.jenisZakat,
    });
    setNominal('');
    setBerasKg('');
    setJiwa('');
    setConfirm(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = await submitOfflineZakat(
        buildPayload(form, { isBeras, nominal, berasKg, jiwa })
      );
      setLastKwitansi(result.nomorKwitansi);
      showToast({
        title: `Tercatat. Kwitansi ${result.nomorKwitansi}`,
        type: 'success',
      });
      resetForm();
    } catch (error) {
      showToast({
        title: error instanceof Error ? error.message : 'Gagal menyimpan.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 font-jakarta">
      <div className="mx-auto max-w-lg">
        <h1 className="font-extrabold text-slate-900 text-xl">
          Entri Zakat Offline (Amil)
        </h1>
        <p className="mt-1 mb-5 text-slate-500 text-sm">
          Catat setoran zakat tunai / beras yang diterima langsung. Order dibuat
          tanpa transaksi payment gateway (<code>transaction_id = NULL</code>)
          dan langsung berstatus TERVERIFIKASI.
        </p>

        {lastKwitansi && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 text-xs">
            Entri terakhir tersimpan: <b>{lastKwitansi}</b>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="flex items-center gap-2 text-slate-700 text-xs">
            <input
              checked={form.isAnonymous}
              onChange={(e) => set('isAnonymous', e.target.checked)}
              type="checkbox"
            />
            Donasi anonim (Hamba Allah)
          </label>

          <Field label="Nama Muzakki">
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm disabled:bg-slate-100"
              disabled={form.isAnonymous}
              onChange={(e) => set('namaMuzakki', e.target.value)}
              value={form.isAnonymous ? 'Hamba Allah' : form.namaMuzakki}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="No. Telepon">
              <input
                className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                onChange={(e) => set('noTelepon', e.target.value)}
                value={form.noTelepon ?? ''}
              />
            </Field>
            <Field label="Jumlah Jiwa (fitrah)">
              <input
                className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                inputMode="numeric"
                onChange={(e) => setJiwa(e.target.value)}
                value={jiwa}
              />
            </Field>
          </div>

          <Field label="Alamat">
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              onChange={(e) => set('alamat', e.target.value)}
              value={form.alamat ?? ''}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis Zakat">
              <SelectField
                className="w-full"
                onChange={(e) =>
                  set(
                    'jenisZakat',
                    e.target.value as OfflineZakatInput['jenisZakat']
                  )
                }
                value={form.jenisZakat}
              >
                {jenisOptions.map((j) => (
                  <option key={j.kode} value={j.kode}>
                    {j.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Metode">
              <SelectField
                className="w-full"
                onChange={(e) =>
                  set('metodePembayaran', e.target.value as 'TUNAI' | 'BERAS')
                }
                value={form.metodePembayaran}
              >
                <option value="TUNAI">TUNAI</option>
                <option value="BERAS">BERAS</option>
              </SelectField>
            </Field>
          </div>

          {isBeras ? (
            <Field label="Berat Beras (kg)">
              <input
                className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                inputMode="decimal"
                onChange={(e) => setBerasKg(e.target.value)}
                placeholder="2.5"
                value={berasKg}
              />
            </Field>
          ) : (
            <Field label="Nominal (Rp)">
              <input
                className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                inputMode="numeric"
                onChange={(e) => setNominal(e.target.value)}
                placeholder="500000"
                value={nominal}
              />
            </Field>
          )}

          <button
            className="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-sm text-white hover:bg-emerald-700"
            onClick={openConfirm}
            type="button"
          >
            Catat Setoran
          </button>
        </div>
      </div>

      <ConfirmationModal
        confirmLabel="Ya, Catat Setoran"
        isLoading={busy}
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={submit}
        title="Konfirmasi Entri Zakat Offline"
      >
        <p className="text-slate-600">
          Muzakki: <b>{form.isAnonymous ? 'Hamba Allah' : form.namaMuzakki}</b>
        </p>
        <p className="text-slate-600">
          {jenisLabel} ·{' '}
          <b>{isBeras ? `${berasKg} kg beras` : `Rp ${nominal}`}</b> (
          {form.metodePembayaran})
        </p>
        <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
          Modal ini tidak dapat dilewati — pastikan uang/beras sudah diterima
          sebelum mengonfirmasi.
        </p>
      </ConfirmationModal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children are always a single input/select control at every call site
    <label className="block">
      <span className="mb-1 block font-semibold text-slate-700 text-xs">
        {label}
      </span>
      {children}
    </label>
  );
}
