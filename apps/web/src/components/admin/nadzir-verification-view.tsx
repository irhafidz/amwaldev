import { useRouter } from '@tanstack/react-router';
import {
  AlertCircle,
  Award,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
  HERO_BADGE,
} from '@/components/admin/admin-primitives';
import {
  type AdminNadzirRow,
  getAdminDocuments,
  getAdminNadzirList,
  getAdminWaqfPrograms,
  verifyNadzir,
} from '@/lib/amwal-api/admin';
import { useResource } from '@/lib/amwal-api/use-resource';
import { nadzirKategoriLabel } from '@/lib/nadzir-labels';
import { NadzirPublicProfileModal } from './nadzir-public-profile-modal';

export interface NadzirItem {
  id: string;
  namaLembaga: string | null;
  kategori: string;
  namaBank: string | null;
  nomorRekeningBank: string | null;
  statusVerifikasi: string;
  verifiedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  documents: Array<{
    id: string;
    tipeDokumen: string;
    fileUrl: string | null;
  }>;
  programsCount: number;
  nomorRegistrasiBwi: string | null;
  kontakPublik: string | null;
}

interface NadzirVerificationViewProps {
  initialNadzirs?: NadzirItem[];
}

/**
 * Adapter kontrak: `admin.waqf.nadzirList` mengembalikan baris datar
 * (kolom tabel + nama/email/telepon user hasil join), sedangkan komponen
 * hasil restorasi mengharapkan `NadzirItem` bersarang. Dokumen dan jumlah
 * program diambil dari prosedur terpisah lalu digabung di sisi klien —
 * tidak ada satu pun elemen JSX yang berubah karenanya.
 */
function toNadzirItems(
  rows: AdminNadzirRow[],
  documents: Awaited<ReturnType<typeof getAdminDocuments>>,
  programs: Awaited<ReturnType<typeof getAdminWaqfPrograms>>
): NadzirItem[] {
  return rows.map((row) => ({
    id: row.id,
    namaLembaga: row.namaLembaga,
    kategori: row.kategori,
    namaBank: row.namaBank,
    nomorRekeningBank: row.nomorRekeningBank,
    statusVerifikasi: row.statusVerifikasi,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
    user: {
      id: row.userId,
      name: row.userName ?? '—',
      email: row.userEmail,
      phone: row.userPhone,
    },
    documents: documents
      .filter((doc) => doc.nadzirProfileId === row.id)
      .map((doc) => ({
        id: doc.id,
        tipeDokumen: doc.tipeDokumen,
        fileUrl: doc.fileUrl,
      })),
    programsCount: programs.filter((p) => p.nadzirProfileId === row.id).length,
    nomorRegistrasiBwi: row.nomorRegistrasiBwi,
    kontakPublik: row.kontakPublik,
  }));
}

async function loadNadzirItems(): Promise<NadzirItem[]> {
  const [rows, documents, programs] = await Promise.all([
    getAdminNadzirList(),
    getAdminDocuments(),
    getAdminWaqfPrograms(),
  ]);
  return toNadzirItems(rows, documents, programs);
}

export function NadzirVerificationView({
  initialNadzirs = [],
}: NadzirVerificationViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'pending' | 'verified'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNadzir, setSelectedNadzir] = useState<NadzirItem | null>(null);
  const [manualBwiNumber, setManualBwiNumber] = useState('');
  const [kontakPublik, setKontakPublik] = useState('');
  const [editingPublic, setEditingPublic] = useState<NadzirItem | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Prop `initialNadzirs` dipertahankan (SSR/tes bisa menyuntik data), tetapi
  // rute `/admin/nadzir-verifikasi` merendernya tanpa prop — jadi daftar
  // sesungguhnya datang dari oRPC.
  const { state: nadzirState, reload: reloadNadzirs } =
    useResource(loadNadzirItems);
  const loadedNadzirs =
    nadzirState.status === 'success' ? nadzirState.data : [];
  const nadzirs = initialNadzirs.length > 0 ? initialNadzirs : loadedNadzirs;

  const pendingList = nadzirs.filter((n) => n.statusVerifikasi === 'PENDING');
  const verifiedList = nadzirs.filter((n) => n.statusVerifikasi === 'VERIFIED');

  const filteredList = (
    activeTab === 'pending' ? pendingList : verifiedList
  ).filter((n) => {
    const term = searchQuery.toLowerCase();
    return (
      (n.namaLembaga || '').toLowerCase().includes(term) ||
      (n.user.name || '').toLowerCase().includes(term) ||
      (n.user.email || '').toLowerCase().includes(term)
    );
  });

  const handleVerifyAction = async (
    nadzirId: string,
    status: 'VERIFIED' | 'REJECTED'
  ) => {
    if (status === 'REJECTED' && !adminNotes.trim()) {
      setFeedback({
        type: 'error',
        text: 'Catatan verifikasi (alasan penolakan) wajib diisi untuk menolak permohonan.',
      });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    try {
      await verifyNadzir(nadzirId, {
        status,
        adminNotes: adminNotes.trim() || undefined,
        nomorRegistrasiBwi: manualBwiNumber.trim() || undefined,
        kontakPublik: kontakPublik.trim() || undefined,
      });

      setFeedback({
        type: 'success',
        text: `Lembaga Nadzir berhasil ${status === 'VERIFIED' ? 'diverifikasi' : 'ditolak'}.`,
      });
      setSelectedNadzir(null);
      setManualBwiNumber('');
      setKontakPublik('');
      setAdminNotes('');
      reloadNadzirs();
      router.invalidate();
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error && err.message
            ? err.message
            : 'Terjadi kesalahan sistem',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 font-jakarta">
      {/* Header */}
      <AdminPageHeader
        actions={
          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-center">
              <span className="block font-bold text-[10px] text-emerald-100 uppercase">
                Pending
              </span>
              <span className="font-black text-lg text-white">
                {pendingList.length}
              </span>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-center">
              <span className="block font-bold text-[10px] text-emerald-100 uppercase">
                Terverifikasi
              </span>
              <span className="font-black text-lg text-white">
                {verifiedList.length}
              </span>
            </div>
          </div>
        }
        badge={<span className={HERO_BADGE}>Otoritas Regulasi BWI</span>}
        description="Audit legalitas badan hukum, rekomendasi syariah MUI, rekening LKS-PWU, dan penerbitan nomor registrasi BWI manual."
        icon={<Building2 aria-hidden="true" />}
        title="Verifikasi Lembaga Nadzir &amp; Kepatuhan Legalitas"
      />

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`fade-in flex animate-in items-center gap-2 rounded-2xl p-4 font-semibold text-xs ${
            feedback.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Tabs & Search Filter */}
      <div className="flex flex-col justify-between gap-4 border-gray-200 border-b sm:flex-row sm:items-end">
        <AdminTabs
          className="mb-0 border-b-0"
          label="Status verifikasi nadzir"
          onChange={setActiveTab}
          tabs={[
            {
              id: 'pending',
              label: 'Permohonan Menunggu',
              icon: <Clock className="h-4 w-4" />,
              count: pendingList.length,
            },
            {
              id: 'verified',
              label: 'Nadzir Terverifikasi BWI',
              icon: <ShieldCheck className="h-4 w-4" />,
              count: verifiedList.length,
            },
          ]}
          value={activeTab}
        />

        <div className="relative w-full sm:w-64">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3.5 h-4 w-4 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pr-4 pl-9 text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama lembaga / ketua..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* Content Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        {filteredList.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-500" />
            Tidak ada data lembaga nadzir pada kategori ini.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredList.map((nz) => (
              <div
                className="flex flex-col justify-between gap-4 p-5 transition-colors hover:bg-slate-50 md:flex-row md:items-center"
                key={nz.id}
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 font-extrabold text-[10px] text-blue-700">
                      {nadzirKategoriLabel(nz.kategori)}
                    </span>
                    <h3 className="font-bold text-gray-900 text-sm">
                      {nz.namaLembaga || nz.user.name}
                    </h3>
                  </div>

                  <p className="flex items-center gap-3 text-gray-600 text-xs">
                    <span>
                      Ketua: <strong>{nz.user.name}</strong>
                    </span>
                    <span>•</span>
                    <span>Email: {nz.user.email || '-'}</span>
                    <span>•</span>
                    <span>HP: {nz.user.phone || '-'}</span>
                  </p>

                  <p className="text-gray-500 text-xs">
                    Rekening LKS-PWU: <strong>{nz.namaBank || 'BSI'}</strong> —{' '}
                    {nz.nomorRekeningBank || 'Belum diisi'}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-semibold text-[11px] text-gray-400">
                      Dokumen Legalitas:
                    </span>
                    {nz.documents.length === 0 ? (
                      <span className="text-[11px] text-amber-600 italic">
                        Belum ada dokumen
                      </span>
                    ) : (
                      nz.documents.map((doc) => (
                        <a
                          className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-[11px] text-emerald-700 hover:underline"
                          href={doc.fileUrl || '#'}
                          key={doc.id}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <FileText className="h-3 w-3" />
                          {doc.tipeDokumen}
                        </a>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {nz.statusVerifikasi === 'PENDING' ? (
                    <button
                      className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs transition-all hover:bg-[#144718]"
                      onClick={() => setSelectedNadzir(nz)}
                      type="button"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Review &amp; Verifikasi</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-700 text-xs">
                        <Award className="h-3.5 w-3.5" />
                        Terverifikasi BWI
                      </span>
                      <button
                        className="cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-1.5 font-bold text-gray-700 text-xs hover:bg-gray-50"
                        onClick={() => setEditingPublic(nz)}
                        type="button"
                      >
                        Ubah Data Publik
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingPublic && (
        <NadzirPublicProfileModal
          nadzir={editingPublic}
          onClose={() => setEditingPublic(null)}
          onSaved={() => {
            setEditingPublic(null);
            setFeedback({
              type: 'success',
              text: 'Data publik lembaga berhasil diperbarui.',
            });
            reloadNadzirs();
          }}
        />
      )}

      {/* Modal Review & Manual BWI Input */}
      {selectedNadzir && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-gray-100 border-b pb-4">
              <div>
                <h3 className="font-bold text-base text-gray-900">
                  Verifikasi Lembaga Nadzir
                </h3>
                <p className="text-gray-500 text-xs">
                  {selectedNadzir.namaLembaga || selectedNadzir.user.name}
                </p>
              </div>
              <button
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                onClick={() => setSelectedNadzir(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Kategori:</span>
                  <span className="font-bold text-gray-900">
                    {nadzirKategoriLabel(selectedNadzir.kategori)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ketua Pengurus:</span>
                  <span className="font-bold text-gray-900">
                    {selectedNadzir.user.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <span className="font-bold text-gray-900">
                    {selectedNadzir.user.email}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nomor Rekening:</span>
                  <span className="font-bold text-gray-900">
                    {selectedNadzir.namaBank} -{' '}
                    {selectedNadzir.nomorRekeningBank}
                  </span>
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-gray-900 text-xs"
                  htmlFor="nadzirverification-f375"
                >
                  Nomor Registrasi BWI (Badan Wakaf Indonesia)
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 font-mono text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                  id="nadzirverification-f375"
                  onChange={(e) => setManualBwiNumber(e.target.value)}
                  placeholder="Contoh: 3.3.00192/BWI/2026 (Wajib diinput manual oleh Admin)"
                  type="text"
                  value={manualBwiNumber}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Input nomor registrasi resmi yang diterbitkan oleh BWI.
                </p>
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-gray-900 text-xs"
                  htmlFor="nadzirverification-kontak"
                >
                  Kontak Publik / Narahubung Resmi
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                  id="nadzirverification-kontak"
                  maxLength={300}
                  onChange={(e) => setKontakPublik(e.target.value)}
                  placeholder="Contoh: info@lembaga.or.id · 0812-xxxx-xxxx"
                  type="text"
                  value={kontakPublik}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Tampil publik di halaman lembaga. Bukan email/telepon akun
                  ketua.
                </p>
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-gray-900 text-xs"
                  htmlFor="nadzirverification-f391"
                >
                  Catatan Verifikasi Admin
                </label>
                <textarea
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#1B5E20] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
                  id="nadzirverification-f391"
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Catatan persetujuan atau instruksi perbaikan dokumen..."
                  rows={3}
                  value={adminNotes}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 border-gray-100 border-t pt-3">
              <button
                className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#1B5E20] font-bold text-white text-xs shadow-xs transition-all hover:bg-[#144718] disabled:opacity-50"
                disabled={isProcessing}
                onClick={() =>
                  handleVerifyAction(selectedNadzir.id, 'VERIFIED')
                }
                type="button"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 stroke-[3]" />
                )}
                <span>Setujui &amp; Terbitkan Status BWI</span>
              </button>

              <button
                className="h-11 cursor-pointer rounded-xl border border-rose-200 bg-rose-50 px-4 font-bold text-rose-700 text-xs transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isProcessing || !adminNotes.trim()}
                onClick={() =>
                  handleVerifyAction(selectedNadzir.id, 'REJECTED')
                }
                title={
                  adminNotes.trim()
                    ? 'Tolak permohonan'
                    : 'Wajib mengisi catatan verifikasi alasan penolakan'
                }
                type="button"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
