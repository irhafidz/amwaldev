import { ArrowLeft, Loader2, Package, Plus, Search, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type {
  AdminHewanBatchRow,
  AdminHewanBatchSlotRow,
} from '@/lib/amwal-api/admin';
import { getAdminHewanBatches } from '@/lib/amwal-api/admin';

/**
 * The batch + slot handed to the shohibul registration modal, which locks the
 * animal choice so the order cannot be filed against a different animal
 * (issue #49) and reserves a real slot of this batch (issue #54).
 */
export interface SlotRegistrationTarget {
  batchId: string;
  nomorSlot: number;
  label: string;
}

function slotTarget(
  batch: AdminHewanBatchRow,
  nomorSlot: number
): SlotRegistrationTarget {
  const batchLabel = batch.namaBatch ?? batch.ras ?? batch.id;
  return {
    batchId: batch.id,
    nomorSlot,
    label: `Slot ${nomorSlot}/${batch.slotTotal} ${batch.jenisHewan} (${batchLabel})`,
  };
}

export function QurbanStockWorkbench({
  isOpen,
  onClose,
  onRegisterShohibul,
}: {
  isOpen: boolean;
  onClose: () => void;
  onRegisterShohibul: (target: SlotRegistrationTarget) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState<AdminHewanBatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<AdminHewanBatchRow | null>(
    null
  );

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getAdminHewanBatches()
        .then(setData)
        .catch(setError)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const closeWorkbench = () => {
    setSelectedBatch(null);
    setSearchTerm('');
    onClose();
  };

  const filteredData = data.filter(
    (batch) =>
      batch.jenisHewan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-slate-100 border-b bg-slate-50 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            {selectedBatch ? (
              <button
                aria-label="Kembali ke daftar batch"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 font-bold text-slate-700 transition hover:bg-slate-300"
                onClick={() => setSelectedBatch(null)}
                type="button"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-800">
                <Package className="h-5 w-5" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-extrabold text-slate-800">
                {selectedBatch
                  ? `${selectedBatch.jenisHewan} • ${selectedBatch.namaBatch ?? selectedBatch.ras ?? selectedBatch.id}`
                  : 'Workbench Kelola Stok Qurban'}
              </h3>
              <p className="text-xs text-slate-500">
                {selectedBatch
                  ? `Batch ${selectedBatch.id} — peta slot & pendaftaran shohibul`
                  : 'Data real-time dari database Amwal'}
              </p>
            </div>
          </div>
          <button
            aria-label="Tutup Workbench"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition hover:bg-red-100 hover:text-red-600"
            onClick={closeWorkbench}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50 p-4 sm:p-6">
          {selectedBatch ? (
            <BatchSlotMap
              batch={selectedBatch}
              onRegisterShohibul={onRegisterShohibul}
            />
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari berdasarkan jenis hewan atau status..."
                    type="text"
                    value={searchTerm}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
                {isLoading ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm font-medium">
                      Memuat data stok...
                    </span>
                  </div>
                ) : error ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-red-500">
                    <span className="text-sm font-medium">
                      Gagal memuat data: {error.message}
                    </span>
                  </div>
                ) : filteredData.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
                    <span className="text-sm font-medium">
                      Tidak ada data batch hewan.
                    </span>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-700">
                      <tr>
                        <th className="px-4 py-3 font-semibold">
                          Batch ID / Jenis
                        </th>
                        <th className="px-4 py-3 font-semibold">Harga Slot</th>
                        <th className="px-4 py-3 font-semibold text-center">
                          Terpakai
                        </th>
                        <th className="px-4 py-3 font-semibold text-center">
                          Status
                        </th>
                        <th className="px-4 py-3 font-semibold text-right">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredData.map((batch) => (
                        <tr
                          className="transition hover:bg-slate-50"
                          key={batch.id}
                        >
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">
                              {batch.namaBatch ?? batch.jenisHewan}
                            </div>
                            <div className="font-mono text-xs text-slate-400">
                              {batch.id}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono">
                            Rp{' '}
                            {Number(batch.hargaPerSlot).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                              {batch.slotTerpakai} / {batch.slotTotal}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${batchStatusClass(batch.status)}`}
                            >
                              {batch.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-sm transition hover:bg-blue-50"
                              onClick={() => setSelectedBatch(batch)}
                              type="button"
                            >
                              Detail Slot
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Slot-level workbench for one batch: every slot that is not yet taken carries
 * a "Daftarkan Shohibul" quick action, so registration happens in the context
 * of the animal/slot the admin is actually working on (issue #54).
 */
function BatchSlotMap({
  batch,
  onRegisterShohibul,
}: {
  batch: AdminHewanBatchRow;
  onRegisterShohibul: (target: SlotRegistrationTarget) => void;
}) {
  const availableCount = batch.slots.filter(
    (slot) => slot.status === 'TERSEDIA'
  ).length;

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BatchStat label="Total Slot" value={String(batch.slotTotal)} />
        <BatchStat label="Terpakai" value={String(batch.slotTerpakai)} />
        <BatchStat label="Belum Terisi" value={String(availableCount)} />
        <BatchStat
          label="Harga / Slot"
          value={`Rp ${Number(batch.hargaPerSlot).toLocaleString('id-ID')}`}
        />
      </div>

      {batch.slots.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
          <span className="text-sm font-medium">
            Batch ini belum memiliki slot hewan.
          </span>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-700">
              Peta Slot Hewan
            </h4>
            <span className="text-xs text-slate-500">
              Klik slot yang belum terisi untuk mendaftarkan shohibul
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {batch.slots.map((slot) => (
              <SlotCard
                batch={batch}
                key={slot.id}
                onRegisterShohibul={onRegisterShohibul}
                slot={slot}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SlotCard({
  batch,
  onRegisterShohibul,
  slot,
}: {
  batch: AdminHewanBatchRow;
  onRegisterShohibul: (target: SlotRegistrationTarget) => void;
  slot: AdminHewanBatchSlotRow;
}) {
  if (slot.status !== 'TERSEDIA') {
    return (
      <div className="flex min-h-[86px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-3 text-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-700">
          {slot.nomorSlot}
        </span>
        <span className="text-xs font-bold text-slate-500">{slot.status}</span>
      </div>
    );
  }

  return (
    <button
      className="group flex min-h-[86px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center transition hover:border-emerald-400 hover:bg-emerald-50/60"
      onClick={() => onRegisterShohibul(slotTarget(batch, slot.nomorSlot))}
      type="button"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 group-hover:bg-emerald-200 group-hover:text-emerald-900">
        {slot.nomorSlot}
      </span>
      <span className="flex items-center gap-1 text-xs font-bold text-slate-500 group-hover:text-emerald-800">
        <Plus className="h-3 w-3" />
        Daftarkan Shohibul
      </span>
    </button>
  );
}

function BatchStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="font-mono text-sm font-bold text-slate-800">
        {value}
      </span>
    </div>
  );
}

function batchStatusClass(status: string): string {
  if (status === 'TERSEDIA') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (status === 'PENUH') {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-slate-100 text-slate-700';
}
