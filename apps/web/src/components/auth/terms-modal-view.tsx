import { Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { Button } from '@/components/ui/button';

const TERMS_SECTIONS = [
  {
    title: '1. Ketentuan Umum & Legalitas Platform',
    content:
      'Platform Amwal adalah platform Islamic Social Finance yang mempertemukan donatur dengan Lembaga Amil Zakat dan Nazhir Wakaf Uang mitra yang terdaftar di Badan Wakaf Indonesia (BWI) dan Kementerian Agama Republik Indonesia. Seluruh layanan diselenggarakan sesuai dengan syariat Islam dan peraturan perundang-undangan yang berlaku di Republik Indonesia.',
  },
  {
    title: '2. Akun Pengguna & Keamanan Kredensial',
    content:
      'Pengguna bertanggung jawab penuh atas kerahasiaan kata sandi, nomor HP, dan akses ke akun Amwal. Pengguna wajib memberikan data yang akurat dan sah saat melakukan pendaftaran serta verifikasi identitas (NIK) untuk keperluan penerbitan Akta Ikrar Wakaf (AIW) dan bukti setor zakat resmi.',
  },
  {
    title: '3. Fiqih Invariants & Penyaluran Amanah',
    content:
      'Amwal menjamin kepatuhan syariah (Sharia Governance) yang diawasi oleh Dewan Pengawas Syariah (DPS). Pokok dana wakaf uang dijamin keabadiannya (Zone 0 Fiqh Invariant) dan diinvestasikan pada portofolio produktif berisiko rendah; hanya hasil surplus yang disalurkan kepada mauquf alaih. Dana zakat disalurkan tepat sasaran kepada 8 asnaf.',
  },
  {
    title: '4. Hak Donatur & Sertifikat Digital',
    content:
      'Setiap donatur berhak menerima bukti transaksi digital seketika, laporan penyaluran dana secara berkala, dan Sertifikat Wakaf Uang (SWU) digital berstandar BWI yang dilengkapi QR code verifikasi publik.',
  },
  {
    title: '5. Kebijakan Transaksi & Pembatalan',
    content:
      'Seluruh transaksi donasi yang telah berstatus lunas (settled) bersifat final, mengikat, dan tidak dapat dibatalkan atau ditarik kembali (tasharruf fi sabilillah), kecuali terjadi kesalahan teknis sistem pembayaran ganda yang dapat diverifikasi oleh admin.',
  },
] as const;

export const TermsModalView = () => {
  return (
    <AuthSplitLayout containerClassName="max-w-[560px]">
      <div className="mb-2">
        <Link
          aria-label="Kembali ke halaman pendaftaran"
          className="inline-flex items-center gap-1.5 font-medium text-slate-500 text-xs transition-colors hover:text-[#356152]"
          to="/daftar"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>Kembali</span>
        </Link>
      </div>

      <div className="mb-4">
        <h1 className="font-bold text-2xl text-slate-900 tracking-tight dark:text-white">
          Syarat &amp; Ketentuan
        </h1>
        <p className="mt-1 text-slate-500 text-xs dark:text-slate-400">
          Terakhir diperbarui: September 2026 • Versi 2.0 (Kepatuhan BWI &amp;
          DPS)
        </p>
      </div>

      {/* Scrollable Terms Content */}
      <div className="max-h-[360px] space-y-4 overflow-y-auto rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 text-left text-xs leading-relaxed dark:border-slate-800 dark:bg-slate-950/50">
        {TERMS_SECTIONS.map((sec) => (
          <div key={sec.title}>
            <h2 className="font-bold text-slate-900 dark:text-slate-100">
              {sec.title}
            </h2>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              {sec.content}
            </p>
          </div>
        ))}

        <div className="rounded-xl border border-[#e2ece8] bg-[#f2f6f4] p-3 text-[#1d352d] text-xs dark:border-[#2b4f43]/40 dark:bg-[#1d352d]/40 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-bold">
            <ShieldCheck className="size-4 shrink-0 text-[#356152] dark:text-emerald-400" />
            <span>Kepatuhan Regulasi &amp; Syariat</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed">
            Dengan melanjutkan penggunaan platform Amwal, Anda menyatakan telah
            membaca, memahami, dan menyetujui seluruh ketentuan di atas.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button
          asChild
          className="h-11 w-full bg-[#356152] font-semibold text-sm text-white shadow-sm transition-colors hover:bg-[#2b4f43] focus-visible:ring-[#356152]"
        >
          <Link to="/daftar">
            <CheckCircle2 className="size-4" />
            <span>Saya Mengerti &amp; Menyetujui</span>
          </Link>
        </Button>
      </div>
    </AuthSplitLayout>
  );
};
