import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-primitives';

/**
 * Panduan operasional ringkas untuk admin/amil baru (UAT #4: SUS butir 4 dan
 * 10, "butuh tutorial untuk penggunaan pertama"). Isinya langkah nyata yang
 * ada di aplikasi saat ini; perbarui bersama perubahan alurnya.
 */

interface GuideTask {
  id: string;
  title: string;
  to: string;
  open: string;
  steps: string[];
  tip?: string;
}

const TASKS: GuideTask[] = [
  {
    id: 'wakaf',
    title: 'Menerbitkan program wakaf',
    to: '/admin/wakaf',
    open: 'Buka Program Wakaf',
    steps: [
      'Klik "Terbitkan Program Baru".',
      'Isi nama, target dana, rekening, dan lokasi. Provinsi sampai kelurahan bisa dicari dengan mengetik.',
      'Unggah banner, RAB, dan dokumen legalitas, lalu klik "Terbitkan Program".',
    ],
    tip: 'Klik di luar kotak isian tidak menutupnya. Bila halaman ter-refresh, draf yang belum disimpan ditawarkan untuk dipulihkan.',
  },
  {
    id: 'progres',
    title: 'Mengelola progres program wakaf',
    to: '/admin/wakaf',
    open: 'Buka Program Wakaf',
    steps: [
      'Pada program yang dituju, klik "Kelola Progres".',
      'Tab 1, Pencairan Termin: tinjau lalu setujui atau tolak pengajuan pencairan.',
      'Tab 2, Kuitansi & Nota Belanja: unggah nota beserta nominalnya (foto atau PDF, maksimal 5 MB).',
      'Tab 3, Dokumentasi & Progres Fisik: unggah minimal 1 foto kegiatan, lalu atur persentase dan klik "Simpan Progres".',
    ],
    tip: 'Tombol "Simpan Progres" baru aktif setelah ada foto dokumentasi.',
  },
  {
    id: 'infaq',
    title: 'Mencatat donasi infaq manual',
    to: '/admin/ziswaf/infaq',
    open: 'Buka Infaq & Sedekah',
    steps: [
      'Klik "Catat Infaq Masuk".',
      'Isi nama donatur, nominal, dan metode penerimaan (daftar metode diatur di Master Data).',
      'Lampirkan foto struk atau PDF bukti bila ada, lalu klik "Catat Transaksi".',
    ],
    tip: 'Ikon klip pada daftar donasi membuka bukti yang sudah dilampirkan.',
  },
  {
    id: 'zakat',
    title: 'Mencatat zakat dan menerbitkan BSZ',
    to: '/admin/ziswaf/zakat',
    open: 'Buka Zakat & 8 Asnaf',
    steps: [
      'Klik "Catat Zakat & Terbitkan BSZ" dan isi data muzakki serta nominal.',
      'Pantau transaksi pada tab Ringkasan; Bukti Setor Zakat dicetak dari tombol BSZ.',
      'Catat penyaluran ke 8 asnaf pada tab "Penyaluran 8 Asnaf".',
    ],
    tip: 'Zakat dikelola sebagai kas amil, bukan campaign: tidak ada "program zakat" yang dibuka seperti wakaf.',
  },
  {
    id: 'qurban',
    title: 'Mengelola paket hewan qurban',
    to: '/admin/ziswaf/qurban',
    open: 'Buka Qurban & RPH',
    steps: [
      'Klik "Tambah Paket Hewan", pilih jenis (kambing otomatis 1 slot; sapi 1 atau 7 slot) dan isi harga.',
      'Pada katalog, klik "Daftarkan" untuk mencatat shohibul qurban pada hewan yang tersedia.',
      'Unggah dokumentasi penyembelihan pada tab Patungan Sapi 1/7.',
    ],
  },
  {
    id: 'edukasi',
    title: 'Menulis artikel, kuis, dan menyematkan video',
    to: '/admin/edukasi',
    open: 'Buka Manajemen Edukasi',
    steps: [
      'Artikel: klik "Buat Artikel Baru", tulis judul dan isi, lalu "Buat Soal Kuis" (2 sampai 5 pilihan).',
      'Pratinjau memperlihatkan kuis dengan warna langsung: hijau benar, merah salah.',
      'Video: buka tab Modul Video, klik "Sematkan Video YouTube" dan tempel tautannya.',
    ],
    tip: 'Tulisan yang belum diterbitkan disimpan sementara di tab ini dan ditawarkan kembali setelah refresh.',
  },
  {
    id: 'hapus',
    title: 'Menghapus data',
    to: '/admin/transparansi',
    open: 'Lihat Catatan Transparansi',
    steps: [
      'Setiap penghapusan meminta konfirmasi lebih dulu.',
      'Program wakaf yang sudah menerima donasi, hasil, pencairan, atau penyaluran tidak dapat dihapus.',
      'Donasi infaq dari payment gateway tidak dapat diubah atau dihapus dari panel admin.',
    ],
  },
];

export function AdminGuideView() {
  return (
    <div className="space-y-5 pb-12">
      <AdminPageHeader
        compact
        icon={<BookOpen aria-hidden="true" />}
        title="Panduan Operasional Admin"
      />
      <p className="text-slate-600 text-sm">
        Langkah ringkas untuk tugas yang paling sering dikerjakan. Tiap kartu
        membawa Anda langsung ke halamannya.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {TASKS.map((task, index) => (
          <section
            aria-labelledby={`guide-${task.id}`}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs"
            key={task.id}
          >
            <h2
              className="flex items-center gap-2.5 font-bold text-base text-slate-900"
              id={`guide-${task.id}`}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#356152] font-bold text-sm text-white">
                {index + 1}
              </span>
              {task.title}
            </h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-slate-700 text-sm leading-relaxed">
              {task.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {task.tip && (
              <p className="rounded-xl bg-emerald-50 p-3 text-emerald-900 text-sm">
                <strong>Catatan:</strong> {task.tip}
              </p>
            )}
            <Link
              className="mt-auto self-start rounded-xl border border-[#356152]/30 bg-white px-4 py-2 font-semibold text-[#356152] text-sm hover:bg-[#356152]/10"
              to={task.to}
            >
              {task.open}
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}
