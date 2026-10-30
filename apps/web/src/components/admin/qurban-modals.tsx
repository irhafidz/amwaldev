import {
  formatIndonesianPhone,
  normalizeIndonesianPhone,
} from '@amwal/core/whatsapp/phone';
import {
  AlertTriangle,
  Award,
  Camera,
  FileImage,
  Film,
  Link2,
  LoaderCircle,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { SelectField } from '@/components/ui/select-field';
import { useDirtyGuard } from '@/components/ui/use-dirty-guard';
import type { orpc } from '@/lib/orpc/client';
import { QurbanPhotoField } from './qurban-photo-field';

export type QurbanBatch = Awaited<
  ReturnType<typeof orpc.admin.qurban.batchesList>
>['data'][number];
export type QurbanOrder = Awaited<
  ReturnType<typeof orpc.admin.qurban.ordersList>
>['data'][number];

export interface DokumentasiMedia {
  url: string;
  label: string;
  type: 'image' | 'video';
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  BELUM_BAYAR: 'Belum Bayar',
  DP: 'DP',
  LUNAS: 'Lunas',
};

export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  BELUM_BAYAR: 'bg-rose-100 text-rose-800',
  DP: 'bg-amber-100 text-amber-800',
  LUNAS: 'bg-emerald-100 text-emerald-800',
};

export const OPSI_PESAN_LABELS: Record<string, string> = {
  PASRAH: 'Disalurkan 100% oleh Amil',
  AMBIL_SENDIRI: 'Ambil Hak 1/3 Bagian',
};

export const METODE_LABELS: Record<string, string> = {
  TUNAI: 'Tunai',
  TRANSFER: 'Transfer',
  QRIS: 'QRIS',
  VA: 'Virtual Account',
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  TERSEDIA: 'Tersedia',
  PENUH: 'Penuh',
  SELESAI: 'Selesai',
};

export function rupiah(value: number | string | null | undefined): string {
  return `Rp ${Number(value ?? 0).toLocaleString('id-ID')}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Nama tampilan hewan/kelompok: nama batch, lalu ras, lalu ID. */
export function batchLabel(batch: {
  id: string;
  namaBatch: string | null;
  ras: string | null;
  jenisHewan: string;
}): string {
  return (
    batch.namaBatch ||
    (batch.ras ? `${batch.jenisHewan} ${batch.ras}` : batch.id)
  );
}

export function batchCategory(batch: {
  jenisHewan: string;
  totalSlot: number;
}): string {
  if (batch.jenisHewan === 'KAMBING') {
    return 'Kambing / Domba';
  }
  return batch.totalSlot > 1
    ? `Sapi Patungan 1/${batch.totalSlot}`
    : 'Sapi Utuh';
}

export function isPatungan(batch: { jenisHewan: string; totalSlot: number }) {
  return batch.jenisHewan === 'SAPI' && batch.totalSlot > 1;
}

export function shohibulName(order: {
  namaShohibul: string | null;
  namaShohibulList?: string[] | null;
  namaPengqurban: string;
}): string {
  if (order.namaShohibulList?.length) {
    return order.namaShohibulList.join(', ');
  }
  return order.namaShohibul || order.namaPengqurban;
}

export function readDokumentasiMedia(value: unknown): DokumentasiMedia[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is DokumentasiMedia =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as DokumentasiMedia).url === 'string'
  );
}

export function firstFoto(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs transition focus:border-[#1B5E20] focus:bg-white focus:ring-1 focus:ring-[#1B5E20] disabled:cursor-not-allowed disabled:opacity-60';

function Field({
  id,
  label,
  children,
  hint,
  required,
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  const renderLabel = () => {
    if (typeof label === 'string' && label.endsWith('*')) {
      const base = label.slice(0, -1).trim();
      return (
        <>
          {base} <span className="text-red-500">*</span>
        </>
      );
    }
    return (
      <>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </>
    );
  };

  return (
    <div>
      <label
        className="mb-1 block font-semibold text-slate-700 text-xs"
        htmlFor={id}
      >
        {renderLabel()}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Modal tindakan. Bila `guardValue` (state form) diberikan, modal ini adalah
 * form: klik di latar tidak menutupnya, dan Esc / tombol tutup bertanya dulu
 * setelah isiannya diubah (UAT #4: isian hilang karena klik nyasar).
 */
function ModalShell({
  icon,
  title,
  subtitle,
  onClose,
  footer,
  children,
  wide,
  guardValue,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  wide?: boolean;
  guardValue?: unknown;
}) {
  const guarded = guardValue !== undefined;
  const { requestClose } = useDirtyGuard({ value: guardValue, onClose });
  const close = guarded ? requestClose : onClose;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150"
      onClick={(e) => {
        if (!guarded && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
      >
        <div className="flex shrink-0 items-center justify-between border-slate-100 border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 font-bold text-emerald-800">
              {icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
              {subtitle && <p className="text-slate-500 text-xs">{subtitle}</p>}
            </div>
          </div>
          <button
            aria-label="Tutup"
            className="cursor-pointer p-1 text-slate-400 hover:text-slate-600"
            onClick={close}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto py-3 text-xs">{children}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-slate-100 border-t pt-3">
          {footer}
        </div>
      </div>
    </div>
  );
}

function FooterButtons({
  onCancel,
  onSubmit,
  isSaving,
  submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  isSaving: boolean;
  submitLabel: string;
}) {
  return (
    <>
      <button
        className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-2 font-semibold text-slate-700 text-xs hover:bg-slate-200"
        onClick={onCancel}
        type="button"
      >
        Batal
      </button>
      <button
        className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716] disabled:opacity-50"
        disabled={isSaving}
        onClick={onSubmit}
        type="button"
      >
        {isSaving ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>Menyimpan...</span>
          </>
        ) : (
          submitLabel
        )}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Batch (hewan) form

export interface BatchFormState {
  jenisHewan: 'SAPI' | 'KAMBING';
  totalSlot: string;
  hargaPerSlot: string;
  namaBatch: string;
  ras: string;
  kelasGrade: string;
  estimasiBeratKg: string;
  wilayahPenyaluran: string;
  targetPenerimaManfaat: string;
  lokasiRph: string;
  timJuleha: string;
  fotoUrl: string;
  tanggalPenyembelihanEstimasi: string;
  status: 'TERSEDIA' | 'PENUH' | 'SELESAI';
}

export const EMPTY_BATCH_FORM: BatchFormState = {
  jenisHewan: 'SAPI',
  totalSlot: '7',
  hargaPerSlot: '',
  namaBatch: '',
  ras: '',
  kelasGrade: '',
  estimasiBeratKg: '',
  wilayahPenyaluran: '',
  targetPenerimaManfaat: '',
  lokasiRph: '',
  timJuleha: '',
  fotoUrl: '',
  tanggalPenyembelihanEstimasi: '',
  status: 'TERSEDIA',
};

export function batchFormFrom(batch: QurbanBatch): BatchFormState {
  return {
    jenisHewan: batch.jenisHewan,
    totalSlot: String(batch.totalSlot),
    hargaPerSlot: String(Number(batch.hargaPerSlot)),
    namaBatch: batch.namaBatch ?? '',
    ras: batch.ras ?? '',
    kelasGrade: batch.kelasGrade ?? '',
    estimasiBeratKg: batch.estimasiBeratKg
      ? String(Number(batch.estimasiBeratKg))
      : '',
    wilayahPenyaluran: batch.wilayahPenyaluran ?? '',
    targetPenerimaManfaat: batch.targetPenerimaManfaat
      ? String(batch.targetPenerimaManfaat)
      : '',
    lokasiRph: batch.lokasiRph ?? '',
    timJuleha: batch.timJuleha ?? '',
    fotoUrl: firstFoto(batch.galeriFotoUrls) ?? '',
    tanggalPenyembelihanEstimasi: batch.tanggalPenyembelihanEstimasi ?? '',
    status: batch.status,
  };
}

export function BatchFormModal({
  mode,
  form,
  hasTakenSlots,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  form: BatchFormState;
  /** Harga dikunci bila sudah ada slot yang dipesan. */
  hasTakenSlots: boolean;
  isSaving: boolean;
  onChange: (form: BatchFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof BatchFormState>(
    key: K,
    value: BatchFormState[K]
  ) => onChange({ ...form, [key]: value });
  return (
    <ModalShell
      footer={
        <FooterButtons
          isSaving={isSaving}
          onCancel={onClose}
          onSubmit={onSubmit}
          submitLabel={mode === 'create' ? 'Simpan Hewan' : 'Simpan Perubahan'}
        />
      }
      guardValue={form}
      icon={<Plus className="h-5 w-5" />}
      onClose={onClose}
      subtitle="Katalog hewan, kuota slot, dan data RPH"
      title={
        mode === 'create' ? 'Tambah Paket Hewan Qurban' : 'Edit Hewan Qurban'
      }
      wide
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="batch-jenis" label="Jenis Hewan *">
          <SelectField
            className="w-full"
            disabled={mode === 'edit'}
            id="batch-jenis"
            onChange={(e) => {
              const jenis = e.target.value as 'SAPI' | 'KAMBING';
              onChange({
                ...form,
                jenisHewan: jenis,
                totalSlot: jenis === 'KAMBING' ? '1' : form.totalSlot,
              });
            }}
            value={form.jenisHewan}
          >
            <option value="SAPI">Sapi</option>
            <option value="KAMBING">Kambing / Domba</option>
          </SelectField>
        </Field>
        {form.jenisHewan === 'KAMBING' ? (
          <Field id="batch-slot" label="Jumlah Slot">
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-600 text-sm">
              1 ekor = 1 slot (otomatis)
            </p>
          </Field>
        ) : (
          <Field
            hint={mode === 'edit' ? 'Tidak dapat diubah' : '7 = patungan 1/7'}
            id="batch-slot"
            label="Jumlah Slot *"
          >
            <SelectField
              className="w-full"
              disabled={mode === 'edit'}
              id="batch-slot"
              onChange={(e) => set('totalSlot', e.target.value)}
              value={form.totalSlot}
            >
              <option value="1">1 (utuh)</option>
              <option value="7">7 (patungan)</option>
            </SelectField>
          </Field>
        )}
        <Field
          hint={hasTakenSlots ? 'Terkunci: sudah ada pemesan' : undefined}
          id="batch-harga"
          label="Harga per Slot (Rp) *"
        >
          <RupiahInput
            className={`${inputClass} font-mono`}
            disabled={hasTakenSlots}
            id="batch-harga"
            onChange={(digits) => set('hargaPerSlot', digits)}
            placeholder="2.950.000"
            value={form.hargaPerSlot}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="batch-nama" label="Nama / Tag Hewan">
          <input
            className={inputClass}
            id="batch-nama"
            onChange={(e) => set('namaBatch', e.target.value)}
            placeholder="Sapi 01 (PO Sukabumi)"
            type="text"
            value={form.namaBatch}
          />
        </Field>
        <Field id="batch-ras" label="Ras">
          <input
            className={inputClass}
            id="batch-ras"
            onChange={(e) => set('ras', e.target.value)}
            placeholder="Peranakan Ongole (PO)"
            type="text"
            value={form.ras}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field id="batch-grade" label="Kelas / Grade">
          <input
            className={inputClass}
            id="batch-grade"
            onChange={(e) => set('kelasGrade', e.target.value)}
            placeholder="Grade B"
            type="text"
            value={form.kelasGrade}
          />
        </Field>
        <Field id="batch-berat" label="Estimasi Berat (kg)">
          <input
            className={`${inputClass} font-mono`}
            id="batch-berat"
            onChange={(e) => set('estimasiBeratKg', e.target.value)}
            type="number"
            value={form.estimasiBeratKg}
          />
        </Field>
        <Field id="batch-target" label="Target Penerima Manfaat">
          <input
            className={`${inputClass} font-mono`}
            id="batch-target"
            onChange={(e) => set('targetPenerimaManfaat', e.target.value)}
            type="number"
            value={form.targetPenerimaManfaat}
          />
        </Field>
      </div>
      <Field id="batch-wilayah" label="Wilayah Penyaluran">
        <input
          className={inputClass}
          id="batch-wilayah"
          onChange={(e) => set('wilayahPenyaluran', e.target.value)}
          placeholder="Pelosok Sukabumi & Cianjur Selatan"
          type="text"
          value={form.wilayahPenyaluran}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="batch-rph" label="Lokasi RPH">
          <input
            className={inputClass}
            id="batch-rph"
            onChange={(e) => set('lokasiRph', e.target.value)}
            placeholder="RPH Cisaat, Kab. Sukabumi"
            type="text"
            value={form.lokasiRph}
          />
        </Field>
        <Field id="batch-juleha" label="Tim Juleha">
          <input
            className={inputClass}
            id="batch-juleha"
            onChange={(e) => set('timJuleha', e.target.value)}
            placeholder="Ust. Ridwan & Tim Juleha"
            type="text"
            value={form.timJuleha}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="batch-foto" label="Foto Katalog">
          <QurbanPhotoField
            id="batch-foto"
            onChange={(url) => set('fotoUrl', url)}
            value={form.fotoUrl}
          />
        </Field>
        <Field id="batch-tanggal" label="Estimasi Tanggal Sembelih">
          <input
            className={inputClass}
            id="batch-tanggal"
            onChange={(e) =>
              set('tanggalPenyembelihanEstimasi', e.target.value)
            }
            type="date"
            value={form.tanggalPenyembelihanEstimasi}
          />
        </Field>
      </div>
      {mode === 'edit' && (
        <Field id="batch-status" label="Status">
          <SelectField
            className="w-full"
            id="batch-status"
            onChange={(e) =>
              set('status', e.target.value as BatchFormState['status'])
            }
            value={form.status}
          >
            {Object.entries(BATCH_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </Field>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Shohibul (order) form

export interface ShohibulFormState {
  hewanBatchId: string;
  namaPengqurban: string;
  namaShohibul: string;
  teleponPengqurban: string;
  alamatPengqurban: string;
  opsiPesan: 'PASRAH' | 'AMBIL_SENDIRI';
  metodePembayaran: 'TUNAI' | 'TRANSFER';
  statusPembayaran: 'BELUM_BAYAR' | 'DP' | 'LUNAS';
  nominalDibayar: string;
}

export const EMPTY_SHOHIBUL_FORM: ShohibulFormState = {
  hewanBatchId: '',
  namaPengqurban: '',
  namaShohibul: '',
  teleponPengqurban: '',
  alamatPengqurban: '',
  opsiPesan: 'PASRAH',
  metodePembayaran: 'TUNAI',
  statusPembayaran: 'LUNAS',
  nominalDibayar: '',
};

export function shohibulFormFrom(order: QurbanOrder): ShohibulFormState {
  return {
    hewanBatchId: order.hewanBatchId ?? '',
    namaPengqurban: order.namaPengqurban,
    namaShohibul: order.namaShohibul ?? order.namaPengqurban,
    teleponPengqurban: order.teleponPengqurban ?? '',
    alamatPengqurban: order.alamatPengqurban ?? '',
    opsiPesan: order.opsiPesan,
    metodePembayaran: order.metodePembayaran === 'TUNAI' ? 'TUNAI' : 'TRANSFER',
    statusPembayaran: order.statusPembayaran,
    nominalDibayar: String(Number(order.nominalDibayar)),
  };
}

export function ShohibulFormModal({
  mode,
  form,
  batches,
  lockedBatch,
  isGateway,
  akadText,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  form: ShohibulFormState;
  /** Hewan yang masih punya slot kosong (untuk pendaftaran baru). */
  batches: QurbanBatch[];
  /** Diisi saat dibuka dari slot tertentu — pilihan hewan dikunci. */
  lockedBatch: QurbanBatch | null;
  /** Pesanan online: pembayaran mengikuti gateway. */
  isGateway: boolean;
  akadText: string | null;
  isSaving: boolean;
  onChange: (form: ShohibulFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof ShohibulFormState>(
    key: K,
    value: ShohibulFormState[K]
  ) => onChange({ ...form, [key]: value });
  const phone = form.teleponPengqurban.trim();
  const isPhoneInvalid = phone !== '' && !normalizeIndonesianPhone(phone);
  const selectedBatch =
    lockedBatch ?? batches.find((b) => b.id === form.hewanBatchId) ?? null;

  return (
    <ModalShell
      footer={
        <FooterButtons
          isSaving={isSaving || isPhoneInvalid}
          onCancel={onClose}
          onSubmit={onSubmit}
          submitLabel={
            mode === 'create' ? 'Daftarkan & Catat Akad' : 'Simpan Perubahan'
          }
        />
      }
      guardValue={form}
      icon={<Plus className="h-5 w-5" />}
      onClose={onClose}
      subtitle="Pencatatan akad wakalah dan alokasi slot hewan"
      title={
        mode === 'create' ? 'Pendaftaran Shohibul Qurban' : 'Edit Data Shohibul'
      }
    >
      {mode === 'create' && (
        <Field id="shohibul-batch" label="Hewan / Slot *">
          <SelectField
            className="w-full"
            disabled={Boolean(lockedBatch)}
            id="shohibul-batch"
            onChange={(e) => set('hewanBatchId', e.target.value)}
            value={lockedBatch?.id ?? form.hewanBatchId}
          >
            <option value="">-- Pilih hewan --</option>
            {(lockedBatch ? [lockedBatch] : batches).map((b) => (
              <option key={b.id} value={b.id}>
                {batchLabel(b)} • {batchCategory(b)} • sisa{' '}
                {b.slotTotal - b.slotTerpakai} slot • {rupiah(b.hargaPerSlot)}
              </option>
            ))}
          </SelectField>
          {batches.length === 0 && !lockedBatch && (
            <p className="mt-1 text-xs text-amber-700">
              Tidak ada hewan dengan slot kosong. Tambahkan hewan di tab
              Katalog.
            </p>
          )}
        </Field>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="shohibul-pemesan" label="Nama Pemesan *">
          <input
            className={inputClass}
            id="shohibul-pemesan"
            onChange={(e) => set('namaPengqurban', e.target.value)}
            placeholder="H. Danang Wijaya"
            type="text"
            value={form.namaPengqurban}
          />
        </Field>
        <Field id="shohibul-nama" label="Lafazh Nama Shohibul (bin/binti) *">
          <input
            className={inputClass}
            id="shohibul-nama"
            onChange={(e) => set('namaShohibul', e.target.value)}
            placeholder="Danang Wijaya bin H. Wijaya"
            type="text"
            value={form.namaShohibul}
          />
        </Field>
      </div>
      <Field
        hint={
          isPhoneInvalid
            ? 'Nomor tidak valid. Gunakan format 08xx atau +62xx.'
            : phone
              ? `Laporan dikirim ke ${formatIndonesianPhone(normalizeIndonesianPhone(phone) ?? phone)}`
              : 'Opsional — tanpa nomor, laporan WhatsApp tidak dapat dikirim.'
        }
        id="shohibul-wa"
        label="Nomor WhatsApp"
      >
        <input
          className={`${inputClass} font-mono ${isPhoneInvalid ? 'border-red-400 bg-red-50' : ''}`}
          id="shohibul-wa"
          inputMode="tel"
          onChange={(e) => set('teleponPengqurban', e.target.value)}
          placeholder="081211004001"
          type="tel"
          value={form.teleponPengqurban}
        />
      </Field>
      <Field id="shohibul-alamat" label="Alamat">
        <input
          className={inputClass}
          id="shohibul-alamat"
          onChange={(e) => set('alamatPengqurban', e.target.value)}
          type="text"
          value={form.alamatPengqurban}
        />
      </Field>
      <Field id="shohibul-opsi" label="Opsi Distribusi Daging *">
        <SelectField
          className="w-full"
          id="shohibul-opsi"
          onChange={(e) =>
            set('opsiPesan', e.target.value as ShohibulFormState['opsiPesan'])
          }
          value={form.opsiPesan}
        >
          {Object.entries(OPSI_PESAN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </Field>
      {isGateway ? (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Pesanan online — status pembayaran mengikuti payment gateway.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {mode === 'create' && (
            <Field id="shohibul-metode" label="Metode *">
              <SelectField
                className="w-full"
                id="shohibul-metode"
                onChange={(e) =>
                  set(
                    'metodePembayaran',
                    e.target.value as ShohibulFormState['metodePembayaran']
                  )
                }
                value={form.metodePembayaran}
              >
                <option value="TUNAI">Tunai</option>
                <option value="TRANSFER">Transfer</option>
              </SelectField>
            </Field>
          )}
          <Field id="shohibul-status" label="Status Bayar *">
            <SelectField
              className="w-full"
              id="shohibul-status"
              onChange={(e) =>
                set(
                  'statusPembayaran',
                  e.target.value as ShohibulFormState['statusPembayaran']
                )
              }
              value={form.statusPembayaran}
            >
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </Field>
          {form.statusPembayaran === 'DP' && (
            <Field id="shohibul-dp" label="Nominal DP (Rp) *">
              <RupiahInput
                className={`${inputClass} font-mono`}
                id="shohibul-dp"
                onChange={(digits) => set('nominalDibayar', digits)}
                value={form.nominalDibayar}
              />
            </Field>
          )}
        </div>
      )}
      {mode === 'create' && selectedBatch && (
        <p className="text-xs text-slate-500">
          Total: <strong>{rupiah(selectedBatch.hargaPerSlot)}</strong> (1 slot).
        </p>
      )}
      {mode === 'create' && akadText && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="mb-1 block font-bold text-emerald-950">
            Iqrar Akad Wakalah Qurban:
          </span>
          <p className="font-serif text-xs text-emerald-900 italic leading-relaxed">
            &quot;{akadText}&quot;
          </p>
        </div>
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Documentation (links) per batch

export function DocumentationModal({
  batch,
  orders,
  isSaving,
  onClose,
  onSave,
}: {
  batch: QurbanBatch;
  orders: QurbanOrder[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    data: { videoUrl: string; media: DokumentasiMedia[] },
    sendAfterSave: boolean
  ) => void;
}) {
  const [videoUrl, setVideoUrl] = useState(batch.dokumentasiVideoUrl ?? '');
  const [media, setMedia] = useState<DokumentasiMedia[]>(
    readDokumentasiMedia(batch.dokumentasiMedia)
  );
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'image' | 'video'>('image');
  const withPhone = orders.filter((o) => o.teleponPengqurban).length;

  const addMedia = () => {
    if (!(newUrl.trim() && newLabel.trim())) {
      return;
    }
    setMedia([
      ...media,
      { url: newUrl.trim(), label: newLabel.trim(), type: newType },
    ]);
    setNewUrl('');
    setNewLabel('');
  };

  return (
    <ModalShell
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">
            {withPhone}/{orders.length} shohibul punya nomor WhatsApp
          </span>
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100 px-3.5 py-2 font-semibold text-slate-700 text-xs hover:bg-slate-200 disabled:opacity-50"
            disabled={isSaving}
            onClick={() => onSave({ videoUrl, media }, false)}
            type="button"
          >
            {isSaving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            <span>Simpan</span>
          </button>
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716] disabled:opacity-50"
            disabled={isSaving || withPhone === 0}
            onClick={() => onSave({ videoUrl, media }, true)}
            type="button"
          >
            {isSaving ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              'Simpan & Kirim ke Shohibul'
            )}
          </button>
        </>
      }
      icon={<Camera className="h-5 w-5" />}
      onClose={onClose}
      subtitle={`${batchLabel(batch)}${batch.lokasiRph ? ` • ${batch.lokasiRph}` : ''}`}
      title="Dokumentasi & Laporan Sembelih"
      wide
    >
      <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <span className="font-bold text-slate-800">
          Shohibul ({orders.length} orang):
        </span>
        {orders.length === 0 ? (
          <p className="text-slate-500">Belum ada shohibul di hewan ini.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1 text-xs text-slate-700 sm:grid-cols-2">
            {orders.map((o) => (
              <span className="truncate" key={o.id}>
                • {shohibulName(o)}
                {o.teleponPengqurban ? '' : ' (tanpa WA)'}
              </span>
            ))}
          </div>
        )}
      </div>

      <Field id="doc-video" label="Tautan Video Penyembelihan (YouTube/Drive)">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 shrink-0 text-blue-700" />
          <input
            className={`${inputClass} font-mono`}
            id="doc-video"
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://…"
            type="url"
            value={videoUrl}
          />
        </div>
      </Field>

      <div className="space-y-2">
        <span className="block font-semibold text-slate-700">
          Tautan Foto / Video Tambahan
        </span>
        {media.map((item, index) => (
          <div
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2"
            key={`${item.url}-${index}`}
          >
            <a
              className="flex min-w-0 items-center gap-2 text-slate-700 hover:underline"
              href={item.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {item.type === 'video' ? (
                <Film className="h-4 w-4 shrink-0 text-blue-700" />
              ) : (
                <FileImage className="h-4 w-4 shrink-0 text-emerald-700" />
              )}
              <span className="truncate">{item.label}</span>
            </a>
            <button
              className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              onClick={() => setMedia(media.filter((_, i) => i !== index))}
              title="Hapus tautan"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input
            aria-label="Keterangan tautan"
            className={inputClass}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Keterangan, mis. Foto timbang karkas"
            type="text"
            value={newLabel}
          />
          <input
            aria-label="URL tautan"
            className={`${inputClass} font-mono`}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://…"
            type="url"
            value={newUrl}
          />
          <SelectField
            aria-label="Tipe tautan"
            className="w-full"
            onChange={(e) => setNewType(e.target.value as 'image' | 'video')}
            value={newType}
          >
            <option value="image">Foto</option>
            <option value="video">Video</option>
          </SelectField>
          <button
            className="cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 font-bold text-[#1B5E20] hover:bg-emerald-100 disabled:opacity-50"
            disabled={!(newUrl.trim() && newLabel.trim())}
            onClick={addMedia}
            type="button"
          >
            Tambah
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Certificate

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function certificateRows(order: QurbanOrder): [string, string][] {
  return [
    ['ID Pesanan', order.id],
    ['Atas Nama', shohibulName(order)],
    ...(order.namaShohibulList && order.namaShohibulList.length > 1
      ? [
          ['Jumlah Shohibul', String(order.namaShohibulList.length)] as [
            string,
            string,
          ],
        ]
      : []),
    ['Pemesan', order.namaPengqurban],
    [
      'Hewan',
      `${order.jenisHewan}${order.namaBatch ? ` - ${order.namaBatch}` : ''}${order.nomorSlot.length > 0 ? ` (slot ${order.nomorSlot.join(', ')})` : ''}`,
    ],
    [
      'Distribusi Daging',
      OPSI_PESAN_LABELS[order.opsiPesan] ?? order.opsiPesan,
    ],
    ['Lokasi RPH', order.lokasiRph ?? '—'],
    ['Akad Wakalah', formatDateTime(order.akadWakalahAcceptedAt)],
    [
      'Status Pembayaran',
      PAYMENT_STATUS_LABELS[order.statusPembayaran] ?? order.statusPembayaran,
    ],
  ];
}

function printCertificate(order: QurbanOrder) {
  const win = window.open('', '_blank', 'width=720,height=800');
  if (!win) {
    return;
  }
  const rows = certificateRows(order)
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )
    .join('');
  win.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Sertifikat Qurban ${escapeHtml(order.id)}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a;text-align:center}
h1{font-size:18px;color:#1B5E20;margin:0 0 4px}h2{font-size:20px;margin:16px 0}
table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}
th,td{padding:8px;border-bottom:1px dashed #cbd5e1}th{color:#64748b;font-weight:500;width:35%}</style></head>
<body><h1>Sertifikat Ibadah Qurban</h1><h2>${escapeHtml(shohibulName(order))}</h2><table>${rows}</table></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export function CertificateModal({
  order,
  onClose,
}: {
  order: QurbanOrder;
  onClose: () => void;
}) {
  return (
    <ModalShell
      footer={
        <>
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1B5E20] px-3.5 py-1.5 font-bold text-white text-xs hover:bg-[#144716]"
            onClick={() => printCertificate(order)}
            type="button"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak / Simpan PDF
          </button>
          <button
            className="cursor-pointer rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-800 text-xs hover:bg-slate-300"
            onClick={onClose}
            type="button"
          >
            Tutup
          </button>
        </>
      }
      icon={<Award className="h-5 w-5" />}
      onClose={onClose}
      subtitle={order.id}
      title="Sertifikat Qurban"
    >
      <div className="space-y-2 rounded-xl border-2 border-emerald-700/40 bg-gradient-to-b from-amber-50/60 via-white to-emerald-50/40 p-5">
        <div className="text-center font-extrabold font-serif text-emerald-950 text-sm">
          {shohibulName(order)}
        </div>
        {certificateRows(order).map(([label, value]) => (
          <div
            className="flex justify-between gap-4 border-slate-200 border-b border-dashed py-1"
            key={label}
          >
            <span className="shrink-0 text-slate-500">{label}:</span>
            <span className="text-right font-semibold text-slate-900">
              {value}
            </span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------

export function ConfirmDeleteModal({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
            <p className="text-slate-500 text-xs">
              Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-slate-700 text-xs leading-relaxed">
          {description}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
            onClick={onCancel}
            type="button"
          >
            Batal
          </button>
          <button
            className="cursor-pointer rounded-lg bg-rose-600 px-4 py-1.5 font-bold text-white text-xs shadow-xs hover:bg-rose-700"
            onClick={onConfirm}
            type="button"
          >
            Ya, Hapus
          </button>
        </div>
      </div>
    </div>
  );
}
