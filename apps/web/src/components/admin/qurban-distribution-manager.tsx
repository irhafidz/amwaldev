import { Building, Loader2, Plus, RefreshCcw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  type AdminQurbanDistributionRow,
  createQurbanDistribution,
  getAdminQurbanDistributions,
} from '@/lib/amwal-api/admin';

export function QurbanDistributionManager() {
  const [data, setData] = useState<AdminQurbanDistributionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formHewanBatchId, setFormHewanBatchId] = useState('');
  const [formJumlahBagian, setFormJumlahBagian] = useState('');
  const [formTanggalSalur, setFormTanggalSalur] = useState('');

  const fetchData = () => {
    setIsLoading(true);
    getAdminQurbanDistributions()
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formHewanBatchId) return;

    setIsSubmitting(true);
    try {
      await createQurbanDistribution({
        hewanBatchId: formHewanBatchId,
        jumlahBagian: formJumlahBagian ? Number(formJumlahBagian) : undefined,
        tanggalSalur: formTanggalSalur || undefined,
      });
      setIsFormOpen(false);
      setFormHewanBatchId('');
      setFormJumlahBagian('');
      setFormTanggalSalur('');
      fetchData(); // Reload list
    } catch (err: any) {
      alert('Gagal menyimpan distribusi: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Building className="w-5 h-5 text-[#1B5E20]" />
            Manajemen Distribusi & RPH
          </h2>
          <p className="text-sm text-slate-500">
            Catat dan pantau penyaluran daging qurban ke mustahiq atau RPH
            rekanan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition"
            onClick={fetchData}
            title="Refresh Data"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
          <button
            className="px-4 py-2 bg-[#1B5E20] hover:bg-[#144716] text-white rounded-xl text-sm font-bold flex items-center gap-2 transition"
            onClick={() => setIsFormOpen(!isFormOpen)}
          >
            <Plus className="w-4 h-4" />
            Catat Distribusi Baru
          </button>
        </div>
      </div>

      {/* Form (Inline) */}
      {isFormOpen && (
        <form
          className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4"
          onSubmit={handleSubmit}
        >
          <h3 className="font-semibold text-slate-800 border-b border-slate-200 pb-2">
            Form Pencatatan Distribusi
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hewan Batch ID <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]"
                onChange={(e) => setFormHewanBatchId(e.target.value)}
                placeholder="HWB-01XX..."
                required
                type="text"
                value={formHewanBatchId}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Jumlah Bagian/Paket
              </label>
              <input
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]"
                onChange={(e) => setFormJumlahBagian(e.target.value)}
                placeholder="Contoh: 150"
                type="number"
                value={formJumlahBagian}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Disalurkan
              </label>
              <input
                className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]"
                onChange={(e) => setFormTanggalSalur(e.target.value)}
                type="date"
                value={formTanggalSalur}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              onClick={() => setIsFormOpen(false)}
              type="button"
            >
              Batal
            </button>
            <button
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-sm text-white transition hover:bg-emerald-700 disabled:opacity-50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                'Simpan Distribusi'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Table Data */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-5 py-4 font-semibold">Tgl Salur</th>
                <th className="px-5 py-4 font-semibold">Batch ID / Hewan</th>
                <th className="px-5 py-4 font-semibold">Wilayah</th>
                <th className="px-5 py-4 font-semibold text-center">
                  Jml Bagian
                </th>
                <th className="px-5 py-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td className="py-12 text-center text-slate-400" colSpan={5}>
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Memuat data distribusi...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="py-12 text-center text-red-500" colSpan={5}>
                    Gagal memuat: {error.message}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-slate-400" colSpan={5}>
                    Belum ada riwayat distribusi yang dicatat.
                  </td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr className="hover:bg-slate-50 transition" key={row.id}>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {row.tanggalSalur
                        ? new Date(row.tanggalSalur).toLocaleDateString('id-ID')
                        : '-'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-800">
                        {row.jenisHewan || 'Hewan Umum'}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {row.hewanBatchId}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {row.wilayahPenyaluran || '-'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-8 bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded-lg text-xs">
                        {row.jumlahBagian || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button className="text-xs font-semibold text-[#1B5E20] hover:underline">
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
