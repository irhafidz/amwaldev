import { Loader2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { updateNadzirPublicProfile } from '@/lib/amwal-api/admin';
import type { NadzirItem } from './nadzir-verification-view';

const INPUT =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30';

/**
 * Ubah data publik lembaga yang sudah terverifikasi (D6): nomor registrasi BWI
 * dan narahubung resmi yang tampil di `/lembaga/$id`. Mengosongkan isian
 * menghapus nilainya.
 */
export function NadzirPublicProfileModal({
  nadzir,
  onClose,
  onSaved,
}: {
  nadzir: NadzirItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bwi, setBwi] = useState(nadzir.nomorRegistrasiBwi ?? '');
  const [kontak, setKontak] = useState(nadzir.kontakPublik ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateNadzirPublicProfile(nadzir.id, {
        nomorRegistrasiBwi: bwi,
        kontakPublik: kontak,
      });
      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : 'Gagal menyimpan data publik'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <form
        className="relative w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between border-gray-100 border-b pb-4">
          <div>
            <h3 className="font-bold text-base text-gray-900">
              Data Publik Lembaga
            </h3>
            <p className="text-gray-500 text-xs">
              {nadzir.namaLembaga || nadzir.user.name}
            </p>
          </div>
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
            <label
              className="mb-1 block font-bold text-gray-900"
              htmlFor="nadzir-public-bwi"
            >
              Nomor Registrasi BWI
            </label>
            <input
              className={`${INPUT} font-mono`}
              id="nadzir-public-bwi"
              maxLength={100}
              onChange={(e) => setBwi(e.target.value)}
              placeholder="Contoh: 3.3.00192/BWI/2026"
              type="text"
              value={bwi}
            />
          </div>
          <div>
            <label
              className="mb-1 block font-bold text-gray-900"
              htmlFor="nadzir-public-kontak"
            >
              Kontak Publik / Narahubung Resmi
            </label>
            <input
              className={INPUT}
              id="nadzir-public-kontak"
              maxLength={300}
              onChange={(e) => setKontak(e.target.value)}
              placeholder="Contoh: info@lembaga.or.id · 0812-xxxx-xxxx"
              type="text"
              value={kontak}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Tampil publik di halaman lembaga. Bukan email/telepon akun ketua.
            </p>
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
            Simpan
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
