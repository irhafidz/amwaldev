import { HandCoins, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useAdminToast } from '@/components/admin/admin-primitives';
import {
  type AsnafCategory,
  addAdminZakatDistribution,
  createAdminMustahiq,
  getAdminMustahiq,
  getAdminZakatDistributions,
} from '@/lib/amwal-api/admin';
import { formatRupiah } from '@/lib/amwal-api/format';
import { useResource } from '@/lib/amwal-api/use-resource';
import { formatWibDate } from '@/lib/format-wib';

const ASNAF_LABELS: Record<AsnafCategory, string> = {
  FAKIR: 'Fakir',
  MISKIN: 'Miskin',
  AMIL: 'Amil',
  MUALLAF: 'Muallaf',
  RIQAB: 'Riqab',
  GHARIMIN: 'Gharimin',
  FISABILILLAH: 'Fisabilillah',
  IBNU_SABIL: 'Ibnu Sabil',
};
const ASNAF_KEYS = Object.keys(ASNAF_LABELS) as AsnafCategory[];

const ZAKAT_TYPE_LABELS: Record<string, string> = {
  FITRAH: 'Zakat Fitrah',
  MAAL_PENGHASILAN: 'Zakat Maal / Penghasilan',
  FIDYAH: 'Fidyah',
  KAFARAT: 'Kafarat',
  EMAS: 'Zakat Emas',
  PERUSAHAAN: 'Zakat Perusahaan',
  PERTANIAN: 'Zakat Pertanian',
};

const INPUT =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30';

const asnafLabel = (value: string | null) =>
  value ? (ASNAF_LABELS[value as AsnafCategory] ?? value) : '—';

/**
 * Penyaluran zakat ke 8 asnaf: daftar catatan + tombol "Catat Penyaluran".
 * Backend (`admin.zakat.distributionsList/addDistribution/mustahiqList/
 * createMustahiq`) sudah ada; sebelumnya tidak ada layar yang
 * menampilkannya, sehingga amil tidak menemukan tempat mencatat penyaluran
 * (QA Test#1, Awan).
 */
export function ZakatDistributionPanel({
  onChanged,
}: {
  /** Dipanggil setelah catatan baru tersimpan (mis. memuat ulang hitungan mustahik). */
  onChanged?: () => void;
}) {
  const distributions = useResource(getAdminZakatDistributions);
  const [open, setOpen] = useState(false);
  const rows =
    distributions.state.status === 'success' ? distributions.state.data : [];

  return (
    <section aria-labelledby="zakat-distribution-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            className="font-extrabold text-base text-gray-900"
            id="zakat-distribution-heading"
          >
            Penyaluran Zakat ke 8 Asnaf
          </h2>
          <p className="text-gray-500 text-xs">
            Catat setiap penyaluran dari kas zakat kepada mustahik. Mustahik
            baru bisa ditambahkan langsung dari formulir.
          </p>
        </div>
        <button
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1B5E20] px-4 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#144718]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          Catat Penyaluran
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-card">
        {distributions.state.status === 'loading' && (
          <p className="p-8 text-center text-gray-400 text-xs">
            Memuat catatan penyaluran…
          </p>
        )}
        {distributions.state.status === 'error' && (
          <p className="p-8 text-center text-rose-600 text-xs" role="alert">
            Catatan penyaluran belum dapat dimuat.
          </p>
        )}
        {distributions.state.status === 'success' && rows.length === 0 && (
          <div className="p-10 text-center text-gray-500 text-xs">
            <HandCoins
              aria-hidden="true"
              className="mx-auto mb-2 size-9 text-emerald-500"
            />
            Belum ada penyaluran tercatat. Klik{' '}
            <strong>Catat Penyaluran</strong> untuk memulai.
          </div>
        )}
        {rows.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Tanggal
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Penerima
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Asnaf
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Jenis Zakat
                </th>
                <th className="px-4 py-3 text-right font-semibold" scope="col">
                  Jumlah
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Catatan
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatWibDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {row.namaMustahiq ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {asnafLabel(row.kategoriAsnaf)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {ZAKAT_TYPE_LABELS[row.jenisZakat] ?? row.jenisZakat}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-[#1B5E20] tabular-nums">
                    {row.nominal
                      ? formatRupiah(Number(row.nominal))
                      : `${Number(row.beratBerasKg ?? 0).toLocaleString('id-ID')} kg beras`}
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-gray-500">
                    {row.notes || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <DistributionModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            distributions.reload();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function DistributionModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useAdminToast();
  const mustahiq = useResource(getAdminMustahiq);
  const people = mustahiq.state.status === 'success' ? mustahiq.state.data : [];

  const [mustahiqId, setMustahiqId] = useState('');
  const [newPerson, setNewPerson] = useState(false);
  const [nama, setNama] = useState('');
  const [asnaf, setAsnaf] = useState<AsnafCategory>('FAKIR');
  const [telepon, setTelepon] = useState('');
  const [jenis, setJenis] = useState('FITRAH');
  const [bentuk, setBentuk] = useState<'uang' | 'beras'>('uang');
  const [jumlah, setJumlah] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(jumlah);
    if (!(amount > 0)) {
      setError('Isi jumlah penyaluran (uang atau kilogram beras).');
      return;
    }
    if (newPerson ? nama.trim().length < 2 : !mustahiqId) {
      setError(
        newPerson
          ? 'Nama mustahik wajib diisi.'
          : 'Pilih mustahik penerima, atau tambahkan mustahik baru.'
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let targetId = mustahiqId;
      if (newPerson) {
        const created = await createAdminMustahiq({
          namaMustahiq: nama.trim(),
          kategoriAsnaf: asnaf,
          noTelepon: telepon.trim() || undefined,
        });
        targetId = created.id;
      }
      await addAdminZakatDistribution({
        mustahiqId: targetId,
        jenisZakat: jenis,
        ...(bentuk === 'uang' ? { nominal: amount } : { beratBerasKg: amount }),
        notes: notes.trim() || undefined,
      });
      toast.ok('Penyaluran zakat tercatat');
      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : 'Gagal mencatat penyaluran'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <form
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between border-gray-100 border-b pb-4">
          <h3 className="font-bold text-base text-gray-900">
            Catat Penyaluran Zakat
          </h3>
          <button
            aria-label="Tutup"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 py-4 text-xs">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="font-bold text-gray-900" htmlFor="zd-mustahiq">
                Penerima (Mustahik)
              </label>
              <button
                className="inline-flex cursor-pointer items-center gap-1 font-bold text-[#1B5E20] hover:underline"
                onClick={() => setNewPerson((value) => !value)}
                type="button"
              >
                <UserPlus aria-hidden="true" className="size-3.5" />
                {newPerson ? 'Pilih dari daftar' : 'Mustahik baru'}
              </button>
            </div>
            {newPerson ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  aria-label="Nama mustahik"
                  className={INPUT}
                  id="zd-mustahiq"
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Nama mustahik"
                  type="text"
                  value={nama}
                />
                <select
                  aria-label="Kategori asnaf"
                  className={INPUT}
                  onChange={(e) => setAsnaf(e.target.value as AsnafCategory)}
                  value={asnaf}
                >
                  {ASNAF_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {ASNAF_LABELS[key]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Nomor telepon (opsional)"
                  className={`${INPUT} sm:col-span-2`}
                  onChange={(e) => setTelepon(e.target.value)}
                  placeholder="Nomor telepon (opsional)"
                  type="tel"
                  value={telepon}
                />
              </div>
            ) : (
              <select
                className={INPUT}
                id="zd-mustahiq"
                onChange={(e) => setMustahiqId(e.target.value)}
                value={mustahiqId}
              >
                <option value="">
                  {mustahiq.state.status === 'loading'
                    ? 'Memuat daftar…'
                    : 'Pilih mustahik'}
                </option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.namaMustahiq} · {asnafLabel(person.kategoriAsnaf)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                className="mb-1 block font-bold text-gray-900"
                htmlFor="zd-jenis"
              >
                Jenis zakat
              </label>
              <select
                className={INPUT}
                id="zd-jenis"
                onChange={(e) => setJenis(e.target.value)}
                value={jenis}
              >
                {Object.entries(ZAKAT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="mb-1 block font-bold text-gray-900"
                htmlFor="zd-bentuk"
              >
                Bentuk
              </label>
              <select
                className={INPUT}
                id="zd-bentuk"
                onChange={(e) => setBentuk(e.target.value as 'uang' | 'beras')}
                value={bentuk}
              >
                <option value="uang">Uang (Rp)</option>
                <option value="beras">Beras (kg)</option>
              </select>
            </div>
          </div>

          <div>
            <label
              className="mb-1 block font-bold text-gray-900"
              htmlFor="zd-jumlah"
            >
              {bentuk === 'uang' ? 'Nominal (Rp)' : 'Berat beras (kg)'}
            </label>
            <input
              className={INPUT}
              id="zd-jumlah"
              inputMode="decimal"
              min="0"
              onChange={(e) => setJumlah(e.target.value)}
              type="number"
              value={jumlah}
            />
          </div>

          <div>
            <label
              className="mb-1 block font-bold text-gray-900"
              htmlFor="zd-notes"
            >
              Catatan (opsional)
            </label>
            <textarea
              className={`${INPUT} resize-none`}
              id="zd-notes"
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              value={notes}
            />
          </div>

          {error && (
            <p className="text-rose-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-gray-100 border-t pt-3">
          <button
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#1B5E20] font-bold text-white text-xs shadow-xs hover:bg-[#144718] disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            {saving && (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            )}
            Simpan Penyaluran
          </button>
          <button
            className="h-11 cursor-pointer rounded-xl border border-gray-200 px-4 font-bold text-gray-700 text-xs hover:bg-gray-50"
            onClick={onClose}
            type="button"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
