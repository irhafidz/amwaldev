import {
  AlertCircle,
  Check,
  CheckCircle2,
  Coins,
  Download,
  Edit3,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UploadCloud,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  AdminPageHeader,
  type AdminTabItem,
  AdminTabs,
  HERO_BADGE,
} from '@/components/admin/admin-primitives';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { getAdminLedger } from '@/lib/amwal-api/admin';
import { formatRupiah } from '@/lib/amwal-api/format';
import { useResource } from '@/lib/amwal-api/use-resource';

export type RoleType =
  | 'super_admin'
  | 'nazhir'
  | 'amil'
  | 'lainnya'
  | 'donatur';

export interface LegalDocumentItem {
  id: string;
  title: string;
  category: string;
  docNumber: string;
  issuer: string;
  validUntil: string;
  status: string;
  badge?: string;
  fileSize: string;
  fileName?: string;
  description: string;
  roleScope?: 'all' | 'nazhir' | 'amil';
}

interface DocumentsSectionProps {
  initialSubTab?: 'transparency' | 'legalitas';
  currentRole?: RoleType;
}

/**
 * Rantai ternari bertingkat pada berkas hasil restorasi dipindahkan ke
 * fungsi kecil. Nilai yang dikembalikan identik string demi string, jadi
 * kelas maupun teks yang dirender tidak berubah sedikit pun.
 */
function defaultSubTabFor(role: string): string {
  if (role === 'lainnya') {
    return 'ziswaf_transactions';
  }
  if (role === 'nazhir') {
    return 'physical';
  }
  return 'transactions';
}

function legalCategoryFor(role: string): string {
  if (role === 'lainnya') {
    return 'Legalitas Lembaga Amil Zakat (LAZ)';
  }
  if (role === 'nazhir') {
    return 'Izin Operasional Nazhir';
  }
  return 'Legalitas Lembaga Sosial';
}

function transparencyScopeFor(role: string): string {
  if (role === 'lainnya') {
    return 'ZISWAF & Asnaf';
  }
  if (role === 'nazhir') {
    return 'Wakaf & Progres Fisik';
  }
  return 'Konsolidasi Global';
}

function akadBadgeClass(jenisAkad: string): string {
  if (jenisAkad.includes('Zakat')) {
    return 'border-amber-200 bg-amber-100 text-amber-900';
  }
  if (jenisAkad.includes('Infaq')) {
    return 'border-emerald-200 bg-emerald-100 text-emerald-800';
  }
  if (jenisAkad.includes('Qurban')) {
    return 'border-blue-200 bg-blue-100 text-blue-800';
  }
  return 'border-purple-200 bg-purple-100 text-purple-800';
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
function LiveMetricCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'blue' | 'purple';
  icon: React.ReactNode;
}) {
  const palette = {
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-900',
    blue: 'border-blue-100 bg-blue-50/70 text-blue-900',
    purple: 'border-purple-100 bg-purple-50/70 text-purple-900',
  } as const;
  return (
    <div className={`rounded-xl border p-4 ${palette[tone]}`}>
      <div className="mb-1 flex items-center justify-between font-semibold text-xs">
        <span>{label}</span>
        {icon}
      </div>
      <div className="font-extrabold text-xl sm:text-2xl">{value}</div>
    </div>
  );
}

/** Real totals from the verified (LUNAS) ledger, the same source as /admin/transparansi. */
function LiveLedgerMetrics() {
  const { state } = useResource(() => getAdminLedger({ page: 1, limit: 1 }), {
    key: 'admin.ledger:1',
  });
  const summary = state.status === 'success' ? state.data.summary : null;
  const pending = state.status === 'loading' ? '…' : '—';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <LiveMetricCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Total Penghimpunan Terverifikasi"
        tone="emerald"
        value={summary ? formatRupiah(summary.totalVolume) : pending}
      />
      <LiveMetricCard
        icon={<Wallet className="h-4 w-4" />}
        label="Transaksi Lunas"
        tone="blue"
        value={summary ? summary.totalCount.toLocaleString('id-ID') : pending}
      />
      <LiveMetricCard
        icon={<ShieldCheck className="h-4 w-4" />}
        label="Donatur Unik"
        tone="purple"
        value={summary ? summary.uniqueDonors.toLocaleString('id-ID') : pending}
      />
    </div>
  );
}

export function DocumentsView({
  initialSubTab = 'legalitas',
  currentRole = 'super_admin',
}: DocumentsSectionProps = {}) {
  const { showToast } = useToast();
  const [mainTab, setMainTab] = useState<'transparency' | 'legalitas'>(
    initialSubTab
  );

  // Sub tabs state based on role
  // For Amil ('lainnya'): 'ziswaf_transactions' | 'ziswaf_disbursements' | 'ziswaf_audit'
  // For Nazhir ('nazhir'): 'transactions' | 'physical'
  // For Super Admin: 'transactions' | 'physical' | 'ziswaf_disbursements' | 'superadmin_audit'
  const defaultSubTab = defaultSubTabFor(currentRole);

  const [transparencySubTab, setTransparencySubTab] =
    useState<string>(defaultSubTab);
  const [searchQuery, setSearchQuery] = useState('');
  const transparencyTabs: AdminTabItem<string>[] = (() => {
    if (currentRole === 'lainnya') {
      return [
        {
          id: 'ziswaf_transactions',
          label: 'Transaksi ZISWAF Masuk',
          icon: <Coins className="h-3.5 w-3.5" />,
        },
        {
          id: 'ziswaf_disbursements',
          label: 'Penyaluran 8 Asnaf & Program Sosial',
          icon: <Send className="h-3.5 w-3.5" />,
        },
      ];
    }
    if (currentRole === 'nazhir') {
      return [
        {
          id: 'physical',
          label: 'Pencairan & Progres Fisik Proyek Wakaf',
          icon: <Layers className="h-3.5 w-3.5" />,
        },
        {
          id: 'transactions',
          label: 'Penerimaan Wakaf Uang (Wakif)',
          icon: <User className="h-3.5 w-3.5" />,
        },
      ];
    }
    return [
      {
        id: 'transactions',
        label: 'Transaksi Global (Semua Akad)',
        icon: <User className="h-3.5 w-3.5" />,
      },
      {
        id: 'physical',
        label: 'Progres Fisik Wakaf (Nazhir)',
        icon: <Layers className="h-3.5 w-3.5" />,
      },
      {
        id: 'ziswaf_disbursements',
        label: 'Penyaluran Asnaf & ZISWAF (Amil)',
        icon: <Send className="h-3.5 w-3.5" />,
      },
    ];
  })();

  const [filterAkad, setFilterAkad] = useState<string>('SEMUA');

  // Search & Filter state specifically for Legalitas Lembaga
  const [legalSearchQuery, setLegalSearchQuery] = useState('');
  const [legalCategoryFilter, setLegalCategoryFilter] =
    useState<string>('SEMUA');

  // 1. ZISWAF & Global Incoming Transactions
  const transactions = [
    {
      id: 'TX-ZKT-2026-891',
      donorName: 'Dr. H. Muhammad Arifin, M.Ag.',
      isAnonymous: false,
      donorId: 'MZK-00182',
      amount: 45_000_000,
      jenisAkad: 'Zakat Maal',
      timestamp: '26 Agt 2026, 09:15:20 WIB',
      program: 'Penyaluran Asnaf Fakir & Pengentasan Kemiskinan',
      paymentMethod: 'BSI Virtual Account',
      statusMuzakki: 'Muzakki Terdaftar',
      bszNumber: 'BSZ-BAZNAS/2026/08/8821',
      scope: 'ziswaf',
    },
    {
      id: 'TX-INF-2026-440',
      donorName: 'Hamba Allah',
      isAnonymous: true,
      donorId: 'MNF-00912',
      amount: 2_500_000,
      jenisAkad: 'Infaq Subuh',
      timestamp: '26 Agt 2026, 06:40:12 WIB',
      program: 'Sedekah Subuh & Santunan 1.000 Anak Yatim',
      paymentMethod: 'QRIS Syariah Dinamis',
      statusMuzakki: 'Munfiq Anonim',
      bszNumber: 'QRIS-NPP-2026/08/440',
      scope: 'ziswaf',
    },
    {
      id: 'TX-QRB-2026-105',
      donorName: 'Keluarga Bpk. Rahmat Santoso (7 Jiwa)',
      isAnonymous: false,
      donorId: 'SHB-00045',
      amount: 20_650_000,
      jenisAkad: 'Qurban Sapi 1 Ekor (7/7)',
      timestamp: '25 Agt 2026, 14:10:05 WIB',
      program: 'Paket Qurban Sapi Limousin & Distribusi Pelosok NTT',
      paymentMethod: 'Transfer Mandiri Syariah',
      statusMuzakki: 'Shohibul Qurban',
      bszNumber: 'QRB-WAKALAH-2026/0105',
      scope: 'ziswaf',
    },
    {
      id: 'TX-INF-2026-439',
      donorName: 'PT Mandiri Sejahtera Logistik',
      isAnonymous: false,
      donorId: 'CORP-0089',
      amount: 35_000_000,
      jenisAkad: 'Infaq Program Khusus',
      timestamp: '25 Agt 2026, 11:20:45 WIB',
      program: 'Bantuan Tanggap Darurat Bencana Banjir Bandang',
      paymentMethod: 'BCA Syariah Corporate VA',
      statusMuzakki: 'Munfiq Korporasi',
      bszNumber: 'INF-REC/2026/08/119',
      scope: 'ziswaf',
    },
    {
      id: 'TX-ZKT-2026-890',
      donorName: 'Hj. Siti Mariam, S.E.',
      isAnonymous: false,
      donorId: 'MZK-00341',
      amount: 12_500_000,
      jenisAkad: 'Zakat Penghasilan',
      timestamp: '24 Agt 2026, 16:05:18 WIB',
      program: 'Program Beasiswa Generasi Emas Fisabilillah',
      paymentMethod: 'QRIS Syariah',
      statusMuzakki: 'Muzakki Terverifikasi',
      bszNumber: 'BSZ-BAZNAS/2026/08/8819',
      scope: 'ziswaf',
    },
    {
      id: 'TX-WKF-2026-992',
      donorName: 'Ir. H. Hendra Wijaya',
      isAnonymous: false,
      donorId: 'WKF-00109',
      amount: 100_000_000,
      jenisAkad: 'Wakaf Uang',
      timestamp: '24 Agt 2026, 15:10:44 WIB',
      program: 'Waqf Pembangunan Klinik Air Bersih Al-Azhar',
      paymentMethod: 'Transfer Bank Syariah (BSI)',
      statusMuzakki: 'Wakif Abadi',
      bszNumber: 'SWU-BWI/2026/00109',
      scope: 'wakaf',
    },
    {
      id: 'TX-WKF-2026-991',
      donorName: 'Dra. Hj. Siti Rahmah',
      isAnonymous: false,
      donorId: 'WKF-00341',
      amount: 15_000_000,
      jenisAkad: 'Wakaf Melalui Uang',
      timestamp: '23 Agt 2026, 11:45:18 WIB',
      program: 'Waqf Renovasi Gedung Sekolah Tahfidz Yatim',
      paymentMethod: 'QRIS Syariah',
      statusMuzakki: 'Wakif Terdaftar',
      bszNumber: 'SWU-BWI/2026/00341',
      scope: 'wakaf',
    },
  ];

  // 2. Physical Wakaf Construction Logs (Nazhir)
  const physicalLogs = [
    {
      id: 'LOG-WKF-2026-084',
      timestamp: '25 Agt 2026, 14:22 WIB',
      program: 'Waqf Pembangunan Klinik Air Bersih Al-Azhar',
      activity: 'Pemasangan Pipa Besi Galvanis & Pompa Submersible 3 HP',
      progressFisik: 65,
      disbursement: 18_500_000,
      receiptFile: 'Kuitansi_Pipa_02.png',
      status: 'Terverifikasi DPS & Super Admin',
      vendor: 'CV Tirta Abadi Teknik',
    },
    {
      id: 'LOG-WKF-2026-083',
      timestamp: '20 Agt 2026, 11:05 WIB',
      program: 'Sumur Waqf Produktif Desa Maju Sukabumi',
      activity:
        'Selesai Pengeboran Kedalaman 80 Meter & Uji Kelayakan Baku Air',
      progressFisik: 92,
      disbursement: 24_000_000,
      receiptFile: 'Nota_Pengeboran_Sumur.pdf',
      status: 'Terverifikasi DPS & Super Admin',
      vendor: 'PT Geosurvey Nusantara',
    },
    {
      id: 'LOG-WKF-2026-082',
      timestamp: '14 Agt 2026, 09:30 WIB',
      program: 'Pengadaan Ambulans Gratis Dhuafa Al-Kautsar',
      activity: 'Pembayaran Uang Muka Karoseri Medis & Sirine Ambulans',
      progressFisik: 30,
      disbursement: 45_000_000,
      receiptFile: 'DP_Karoseri_Ambulans.pdf',
      status: 'Terverifikasi DPS & Super Admin',
      vendor: 'PT Ambulance Medika Karoseri',
    },
    {
      id: 'LOG-WKF-2026-081',
      timestamp: '08 Agt 2026, 16:45 WIB',
      program: 'Waqf Pembangunan Klinik Air Bersih Al-Azhar',
      activity: 'Pengadaan Semen Tiga Roda 60 Sak & Pasir Pasang Super',
      progressFisik: 58,
      disbursement: 5_550_000,
      receiptFile: 'Kuitansi_Material_Semen.jpg',
      status: 'Terverifikasi DPS & Super Admin',
      vendor: 'TB Mitra Bangunan',
    },
  ];

  // 3. ZISWAF & 8 Asnaf Distribution Logs (Amil ZISWAF)
  const ziswafDisbursementLogs = [
    {
      id: 'LOG-ZIS-2026-051',
      timestamp: '26 Agt 2026, 10:30 WIB',
      program: 'Penyaluran Asnaf Fakir & Miskin — Paket Sembako & Uang Tunai',
      asnafCategory: 'Fakir & Miskin (Asnaf 1 & 2)',
      activity:
        'Distribusi 250 paket sembako beras organik 5kg, minyak, telur & santunan tunai mustahik',
      recipientsCount: 250,
      disbursement: 62_500_000,
      bastDocument: 'BAST_Penyaluran_Fakir_Miskin_Kelurahan_Jatinegara.pdf',
      status: 'Terverifikasi DPS & BAZNAS',
      location: 'Kec. Jatinegara, Jakarta Timur',
    },
    {
      id: 'LOG-ZIS-2026-050',
      timestamp: '25 Agt 2026, 15:45 WIB',
      program: 'Beasiswa Pendidikan Santri Dhuafa Fisabilillah',
      asnafCategory: 'Fisabilillah (Asnaf 7)',
      activity:
        'Penyaluran SPP, kitab kuning, dan biaya hidup 45 santri tahfidz pelosok Banten',
      recipientsCount: 45,
      disbursement: 45_000_000,
      bastDocument: 'Kuitansi_SPP_Pesantren_Tahfidz_Banten.pdf',
      status: 'Terverifikasi DPS & BAZNAS',
      location: 'Kab. Pandeglang, Banten',
    },
    {
      id: 'LOG-ZIS-2026-049',
      timestamp: '24 Agt 2026, 13:00 WIB',
      program: 'Bantuan Darurat Korban Kebakaran & Bencana',
      asnafCategory: 'Gharimin & Ibnu Sabil (Asnaf 6 & 8)',
      activity:
        'Bantuan sewa hunian sementara dan modal usaha pemulihan 12 kepala keluarga mustahik',
      recipientsCount: 12,
      disbursement: 36_000_000,
      bastDocument: 'Berita_Acara_Serah_Terima_Bencana_Kebakaran.pdf',
      status: 'Terverifikasi DPS & BAZNAS',
      location: 'Kec. Tambora, Jakarta Barat',
    },
    {
      id: 'LOG-ZIS-2026-048',
      timestamp: '22 Agt 2026, 11:15 WIB',
      program: 'Pembinaan & Modal Usaha Muallaf Mandiri',
      asnafCategory: 'Muallaf (Asnaf 4)',
      activity:
        'Pemberian gerobak usaha kuliner halal dan modal kerja untuk 8 mualaf binaan',
      recipientsCount: 8,
      disbursement: 28_000_000,
      bastDocument: 'BAST_Gerobak_Usaha_Mualaf_Center.pdf',
      status: 'Terverifikasi DPS & BAZNAS',
      location: 'Kota Kupang, NTT',
    },
    {
      id: 'LOG-ZIS-2026-047',
      timestamp: '20 Agt 2026, 09:20 WIB',
      program: 'Distribusi Daging Qurban Pelosok Nusantara',
      asnafCategory: 'Program Sosial Qurban Mustahik',
      activity:
        'Penyaluran 840 besek besek daging segar sapi dan kambing hasil sembelih syar’i RPH',
      recipientsCount: 840,
      disbursement: 58_800_000,
      bastDocument: 'Laporan_Distribusi_Daging_Qurban_Pedalaman.pdf',
      status: 'Sertifikasi Halal Juleha & DPS',
      location: 'Desa Oebelo, Kab. Kupang',
    },
  ];

  // 4. Centralized Legal Documents
  const initialLegalDocs: LegalDocumentItem[] = [
    {
      id: 'LEG-01',
      title: 'SK Izin Operasional Lembaga Amil Zakat (LAZ) & UPZ BAZNAS RI',
      category: 'Legalitas Lembaga Amil Zakat (LAZ)',
      docNumber: 'BAZNAS/KEP-LAZ/0892/2024 / KEMENAG-DJ.VII/2024',
      issuer: 'Badan Amil Zakat Nasional (BAZNAS) & Kemenag RI',
      validUntil: '31 Desember 2028',
      status: 'AKTIF & TERVALIDASI',
      badge: 'Resmi BAZNAS',
      fileSize: '3.6 MB (PDF Signed)',
      fileName: 'SK_Izin_Operasional_LAZ_BAZNAS_2024.pdf',
      description:
        'Keputusan resmi penetapan izin operasional Lembaga Amil Zakat skala nasional dan Unit Pengumpul Zakat (UPZ) sesuai UU No. 23 Tahun 2011.',
      roleScope: 'all',
    },
    {
      id: 'LEG-02',
      title: 'Tanda Daftar Nazhir Wakaf Uang Badan Wakaf Indonesia (BWI)',
      category: 'Izin Operasional Nazhir',
      docNumber: 'BWI.3.1.0028/2024 / KEP-BWI/NZ/2024',
      issuer: 'Badan Wakaf Indonesia (BWI) Pusat',
      validUntil: '31 Desember 2028',
      status: 'AKTIF & TERVALIDASI',
      badge: 'Utama BWI',
      fileSize: '2.4 MB (PDF Signed)',
      fileName: 'Tanda_Daftar_Nazhir_BWI_2024.pdf',
      description:
        'Lisensi resmi tanda daftar Nazhir Wakaf Uang (STBPN) sesuai amanat UU No. 41 Tahun 2004 & PP No. 25 Tahun 2018.',
      roleScope: 'nazhir',
    },
    {
      id: 'LEG-03',
      title: 'Rekomendasi & Fatwa Dewan Pengawas Syariah (DPS) DSN-MUI',
      category: 'Kepatuhan Syariah ZISWAF',
      docNumber: 'DSN-MUI/REK-ZISWAF/0991/2024',
      issuer: 'Dewan Syariah Nasional Majelis Ulama Indonesia',
      validUntil: '15 Juli 2027',
      status: 'AKTIF & TERVALIDASI',
      badge: 'Syariah MUI',
      fileSize: '1.8 MB (PDF)',
      fileName: 'Rekomendasi_DPS_DSN_MUI.pdf',
      description:
        'Fatwa dan penetapan DPS DSN-MUI mengenai kesesuaian syariah tata kelola Zakat, Infaq, Sedekah, Qurban, dan Wakaf Uang.',
      roleScope: 'all',
    },
    {
      id: 'LEG-04',
      title: 'Izin Pengumpulan Uang dan Barang (PUB) Kemensos & Kemenag RI',
      category: 'Legalitas Lembaga Sosial',
      docNumber: 'KEMENSOS.PUB/VII/4421/2024',
      issuer: 'Kementerian Sosial & Kemenag RI',
      validUntil: '20 Agustus 2027',
      status: 'AKTIF & TERVALIDASI',
      badge: 'Kemensos',
      fileSize: '3.1 MB (PDF)',
      fileName: 'Izin_PUB_Kemensos_Kemenag_2024.pdf',
      description:
        'Izin resmi penyelenggaraan pengumpulan dana donasi ZISWAF dan program kemanusiaan skala nasional.',
      roleScope: 'all',
    },
    {
      id: 'LEG-05',
      title: 'Penetapan Rekening Giro Terpisah ZISWAF & LKS-PWU BSI',
      category: 'Perbankan Syariah Terpisah',
      docNumber: 'BSI/DIR-PWU-ZIS/00881/2024',
      issuer: 'Bank Syariah Indonesia (BSI) Kantor Pusat',
      validUntil: '31 Desember 2028',
      status: 'AKTIF & TERVALIDASI',
      badge: 'Rekening Syariah',
      fileSize: '1.9 MB (PDF)',
      fileName: 'Penetapan_Rekening_ZISWAF_LKS_PWU_BSI.pdf',
      description:
        'Surat ketetapan pemisahan rekening bank peruntukan: Rekening Zakat, Rekening Infaq, Rekening Qurban, dan Rekening Giro Wakaf Uang (LKS-PWU).',
      roleScope: 'all',
    },
    {
      id: 'LEG-06',
      title: 'Akta Pendirian Yayasan & Pengesahan Kemenkumham RI',
      category: 'Badan Hukum',
      docNumber: 'AHU-0019283.AH.01.04.Tahun 2023',
      issuer: 'Kementerian Hukum dan HAM Republik Indonesia',
      validUntil: 'Seumur Hidup / Permanen',
      status: 'TERDAFTAR RESMI',
      badge: 'Badan Hukum',
      fileSize: '4.5 MB (PDF)',
      fileName: 'Akta_Notaris_Kemenkumham.pdf',
      description:
        'Akta notaris pendirian badan hukum yayasan pengelola wakaf dan ziswaf serta lembaran berita negara.',
      roleScope: 'all',
    },
    {
      id: 'LEG-07',
      title:
        'Ketetapan Lembaga Penerima Zakat Pengurang Penghasilan Bruto (Fiskal)',
      category: 'Perpajakan & Pengurang Pajak',
      docNumber: '02.481.992.4-012.000 / KEP-PBN-ZIS/2024',
      issuer: 'Direktorat Jenderal Pajak (DJP) Kemenkeu RI',
      validUntil: 'Permanen / Aktif',
      status: 'TERDAFTAR RESMI',
      badge: 'Pengurang Pajak',
      fileSize: '1.2 MB (PDF)',
      fileName: 'SK_Fiskal_Pengurang_Pajak_DJP.pdf',
      description:
        'Ketetapan resmi bukti setor zakat (BSZ) dan wakaf uang yang diterbitkan sah sebagai pengurang pajak penghasilan (Pasal 22 UU No. 23/2011).',
      roleScope: 'all',
    },
    {
      id: 'LEG-08',
      title: 'Opini Audit Keuangan Syariah Wajar Tanpa Pengecualian (WTP)',
      category: 'Audit Keuangan & Transparansi',
      docNumber: 'KAP-AHR/WTP-ZISWAF/0081/2025',
      issuer: 'Kantor Akuntan Publik (KAP) Amir, Hendro & Rekan',
      validUntil: 'Periode Buku 2025/2026',
      status: 'OPINI WTP',
      badge: 'Audit WTP',
      fileSize: '5.2 MB (PDF)',
      fileName: 'Opini_Audit_KAP_WTP_Ziswaf_2025.pdf',
      description:
        'Laporan hasil audit tahunan akuntabilitas keuangan lembaga dengan opini tertinggi Wajar Tanpa Pengecualian (WTP).',
      roleScope: 'all',
    },
    {
      id: 'LEG-09',
      title: 'Sertifikasi ISO 9001:2015 Manajemen Mutu Pengelolaan ZISWAF',
      category: 'Kepatuhan & Sertifikasi Mutu',
      docNumber: 'ISO-QMS-9001/JKT/2024/099',
      issuer: 'Badan Sertifikasi Manajemen Mutu Internasional (TUV)',
      validUntil: '10 Oktober 2027',
      status: 'TERSTANDARISASI',
      badge: 'ISO 9001',
      fileSize: '2.7 MB (PDF)',
      fileName: 'ISO_9001_Sertifikat_Ziswaf.pdf',
      description:
        'Sertifikasi standar internasional sistem tata kelola mutu, kepatuhan audit asnaf, dan transparansi distribusi donasi.',
      roleScope: 'all',
    },
  ];

  // State Management for Legal Documents List & Modals
  const [legalDocs, setLegalDocs] =
    useState<LegalDocumentItem[]>(initialLegalDocs);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<LegalDocumentItem | null>(null);
  const [previewDocModal, setPreviewDocModal] =
    useState<LegalDocumentItem | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] =
    useState<LegalDocumentItem | null>(null);

  // Form State for Add / Edit
  const defaultFormData: Omit<LegalDocumentItem, 'id'> = {
    title: '',
    category: legalCategoryFor(currentRole),
    docNumber: '',
    issuer: '',
    validUntil: '31 Desember 2028',
    status: 'AKTIF & TERVALIDASI',
    fileSize: '2.4 MB (PDF Signed)',
    fileName: 'Dokumen_Legalitas.pdf',
    description: '',
  };
  const [formData, setFormData] =
    useState<Omit<LegalDocumentItem, 'id'>>(defaultFormData);

  const handleOpenAddModal = () => {
    setEditingDoc(null);
    setFormData(defaultFormData);
    setShowAddEditModal(true);
  };

  const handleOpenEditModal = (doc: LegalDocumentItem) => {
    setEditingDoc(doc);
    setFormData({
      title: doc.title,
      category: doc.category,
      docNumber: doc.docNumber,
      issuer: doc.issuer,
      validUntil: doc.validUntil,
      status: doc.status,
      fileSize: doc.fileSize,
      fileName: doc.fileName || `${doc.title.replace(/\s+/g, '_')}.pdf`,
      description: doc.description,
    });
    setShowAddEditModal(true);
  };

  const handleSaveDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !(
        formData.title.trim() &&
        formData.docNumber.trim() &&
        formData.issuer.trim()
      )
    ) {
      showToast({
        title: 'Formulir Belum Lengkap',
        description:
          'Mohon isi nama dokumen, nomor SK/Izin, dan instansi penerbit.',
        type: 'warning',
      });
      return;
    }

    if (editingDoc) {
      setLegalDocs((prev) =>
        prev.map((d) =>
          d.id === editingDoc.id
            ? {
                ...d,
                ...formData,
              }
            : d
        )
      );
      showToast({
        title: 'Dokumen Berhasil Diperbarui',
        description: `Perubahan pada berkas "${formData.title}" telah tersimpan secara resmi.`,
        type: 'success',
      });
    } else {
      const newId = `LEG-0${legalDocs.length + 1}`;
      const newDoc: LegalDocumentItem = {
        id: newId,
        ...formData,
        fileSize: formData.fileSize || '2.5 MB (PDF)',
      };
      setLegalDocs((prev) => [newDoc, ...prev]);
      showToast({
        title: 'Dokumen Legalitas Ditambahkan',
        description: `Berkas "${formData.title}" berhasil diarsipkan dalam pangkalan legalitas lembaga.`,
        type: 'success',
      });
    }

    setShowAddEditModal(false);
    setEditingDoc(null);
  };

  const handleDeleteDocument = (doc: LegalDocumentItem) => {
    setLegalDocs((prev) => prev.filter((d) => d.id !== doc.id));
    setDeleteConfirmDoc(null);
    showToast({
      title: 'Dokumen Dihapus',
      description: `Berkas "${doc.title}" telah dihapus dari daftar legalitas.`,
      type: 'info',
    });
  };

  // Filter transactions based on search and role
  const filteredTransactions = transactions.filter((tx) => {
    const isAmil = currentRole === 'lainnya';
    const isNazhir = currentRole === 'nazhir';

    if (isAmil && tx.scope !== 'ziswaf') {
      return false;
    }
    if (isNazhir && tx.scope !== 'wakaf') {
      return false;
    }

    const matchAkad =
      filterAkad === 'SEMUA' ||
      tx.jenisAkad.toLowerCase().includes(filterAkad.toLowerCase());
    const matchSearch =
      tx.donorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.program.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.bszNumber?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchAkad && matchSearch;
  });

  // Filter physical wakaf logs
  const filteredPhysicalLogs = physicalLogs.filter((log) => {
    return (
      log.program.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.activity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.vendor.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filter ZISWAF disbursement logs
  const filteredZiswafDisbursements = ziswafDisbursementLogs.filter((log) => {
    return (
      log.program.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.activity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.asnafCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filter Legal Documents
  const filteredLegalDocs = legalDocs.filter((doc) => {
    if (currentRole === 'nazhir' && doc.roleScope === 'amil') {
      return false;
    }

    const matchCategory =
      legalCategoryFilter === 'SEMUA' ||
      doc.category.toLowerCase().includes(legalCategoryFilter.toLowerCase()) ||
      Boolean(
        doc.badge?.toLowerCase().includes(legalCategoryFilter.toLowerCase())
      );

    const query = legalSearchQuery.trim().toLowerCase();
    const matchSearch =
      !query ||
      doc.title.toLowerCase().includes(query) ||
      doc.docNumber.toLowerCase().includes(query) ||
      doc.issuer.toLowerCase().includes(query) ||
      doc.category.toLowerCase().includes(query) ||
      doc.id.toLowerCase().includes(query) ||
      doc.description.toLowerCase().includes(query);

    return matchCategory && matchSearch;
  });

  // Categories list for filtering
  const legalCategories = [
    'SEMUA',
    'Legalitas Lembaga Amil Zakat (LAZ)',
    'Izin Operasional Nazhir',
    'Kepatuhan Syariah ZISWAF',
    'Legalitas Lembaga Sosial',
    'Badan Hukum',
    'Perbankan Syariah Terpisah',
    'Perpajakan & Pengurang Pajak',
    'Kepatuhan & Sertifikasi Mutu',
    'Audit Keuangan & Transparansi',
  ];

  // Role metadata configurations
  const roleConfig: Record<
    RoleType,
    {
      title: string;
      subtitle: string;
      badgeText: string;
      badgeColor: string;
    }
  > = {
    super_admin: {
      title: 'Dokumen & Catatan Transparansi Terpadu',
      subtitle:
        'Audit trail konsolidasi lintas ekosistem (Wakaf, Infaq, Zakat, Qurban), transparansi pencairan fisik & penyaluran 8 Asnaf, serta tata kelola legalitas resmi.',
      badgeText: 'Otoritas Tunggal Super Admin',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    },
    nazhir: {
      title: 'Catatan Transparansi & Legalitas Wakaf',
      subtitle:
        'Audit trail penerimaan wakaf uang, transparansi realisasi belanja kuitansi & progres fisik proyek, serta arsip legalitas tanda daftar Nazhir BWI.',
      badgeText: 'Nazhir Wakaf Terdaftar BWI',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    amil: {
      title: 'Catatan Transparansi & Legalitas ZISWAF',
      subtitle:
        'Audit trail penerimaan donasi Infaq, Zakat & Qurban real-time, transparansi penyaluran 8 Asnaf, laporan mustahik, serta berkas legalitas LAZ / UPZ BAZNAS.',
      badgeText: 'Amil ZISWAF (LAZ / UPZ BAZNAS)',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    },
    lainnya: {
      title: 'Catatan Transparansi & Legalitas ZISWAF',
      subtitle:
        'Audit trail penerimaan donasi Infaq, Zakat & Qurban real-time, transparansi penyaluran 8 Asnaf, laporan mustahik, serta berkas legalitas LAZ / UPZ BAZNAS.',
      badgeText: 'Amil ZISWAF (LAZ / UPZ BAZNAS)',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    },
    donatur: {
      title: 'Dokumen & Catatan Transparansi',
      subtitle: 'Audit trail transaksi real-time dan berkas legalitas resmi.',
      badgeText: 'Donatur & Wakif',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    },
  };

  const currentRoleConfig = roleConfig[currentRole] || roleConfig.super_admin;

  return (
    <div className="space-y-6">
      {/* Top Header & Role-Aware Summary */}
      <AdminPageHeader
        badge={
          <span className={HERO_BADGE}>{currentRoleConfig.badgeText}</span>
        }
        description={currentRoleConfig.subtitle}
        icon={<FileSpreadsheet aria-hidden="true" />}
        title={currentRoleConfig.title}
      />

      <AdminTabs
        label="Bagian dokumen"
        onChange={setMainTab}
        tabs={[
          { id: 'transparency', label: 'Catatan Transparansi' },
          { id: 'legalitas', label: 'Legalitas Lembaga' },
        ]}
        value={mainTab}
      />

      {mainTab === 'transparency' && (
        <div className="space-y-4">
          <LiveLedgerMetrics />
          <p
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-xs"
            role="note"
          >
            Angka di atas adalah data nyata dari buku besar. Tabel catatan, log
            penyaluran, dan daftar legalitas di bawah ini masih berupa data
            contoh dan belum terhubung ke basis data.
          </p>
        </div>
      )}

      {/* Main Content: Catatan Transparansi */}
      {mainTab === 'transparency' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
          {/* Sub-menu Tabs Tailored to Active Role */}
          <div className="flex flex-col justify-between gap-4 border-slate-200 border-b px-6 pt-5 pb-3 md:flex-row md:items-end">
            <AdminTabs
              className="-mb-3 border-b-0"
              label="Jenis catatan transparansi"
              onChange={setTransparencySubTab}
              tabs={transparencyTabs}
              value={transparencySubTab}
            />

            {/* Search & Filter Inputs */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1B5E20] sm:w-60"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari transaksi / mustahik / program..."
                  type="text"
                  value={searchQuery}
                />
              </div>

              {(transparencySubTab === 'transactions' ||
                transparencySubTab === 'ziswaf_transactions') && (
                <SelectField
                  onChange={(e) => setFilterAkad(e.target.value)}
                  value={filterAkad}
                >
                  <option value="SEMUA">Semua Akad</option>
                  {currentRole !== 'nazhir' && (
                    <option value="Infaq">Infaq</option>
                  )}
                  {currentRole !== 'nazhir' && (
                    <option value="Zakat">Zakat</option>
                  )}
                  {currentRole !== 'nazhir' && (
                    <option value="Qurban">Qurban</option>
                  )}
                  {currentRole !== 'lainnya' && (
                    <option value="Wakaf">Wakaf</option>
                  )}
                </SelectField>
              )}

              <button
                className="flex cursor-pointer items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 text-xs hover:bg-slate-200"
                onClick={() =>
                  showToast({
                    title: 'Laporan Transparansi Diexport',
                    description: `Dokumen audit trail transparansi (${transparencyScopeFor(currentRole)}) berhasil diunduh dalam format PDF & CSV resmi.`,
                    type: 'success',
                  })
                }
                type="button"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
          </div>

          {/* Sub-menu View 1: Transaksi Masuk (ZISWAF / Global / Wakif) */}
          {(transparencySubTab === 'transactions' ||
            transparencySubTab === 'ziswaf_transactions') && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-slate-200 border-b bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Nama Donatur / Muzakki</th>
                    <th className="px-4 py-3">Nominal Donasi</th>
                    <th className="px-4 py-3">Jenis Akad</th>
                    <th className="px-4 py-3">Waktu (Timestamp)</th>
                    <th className="px-4 py-3">Program / Peruntukan</th>
                    <th className="px-4 py-3">Metode Bayar</th>
                    <th className="px-4 py-3">Nomor BSZ / Transaksi</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx) => (
                      <tr
                        className="transition hover:bg-slate-50/70"
                        key={tx.id}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            {tx.donorName}
                            {tx.isAnonymous && (
                              <span className="rounded bg-slate-200 px-1.5 py-0.2 font-normal text-[10px] text-slate-700">
                                Anonim
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            ID: {tx.donorId}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-bold font-mono text-emerald-900">
                          {formatRupiah(tx.amount)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 font-semibold text-[10px] ${akadBadgeClass(
                              tx.jenisAkad
                            )}`}
                          >
                            {tx.jenisAkad}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-slate-500">
                          {tx.timestamp}
                        </td>
                        <td className="max-w-xs truncate px-4 py-3.5 font-medium text-slate-800">
                          {tx.program}
                        </td>
                        <td className="px-4 py-3.5 text-[11px] text-slate-600">
                          {tx.paymentMethod}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[11px] text-slate-700">
                          <div className="font-semibold text-emerald-800">
                            {tx.bszNumber || tx.id}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {tx.id}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-bold text-[10px] text-emerald-800">
                            {tx.statusMuzakki}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="py-8 text-center text-slate-400 text-xs"
                        colSpan={8}
                      >
                        Tidak ada transaksi yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-menu View 2: Transparansi Penyaluran 8 Asnaf & Program ZISWAF (Khusus Amil & Super Admin) */}
          {transparencySubTab === 'ziswaf_disbursements' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-slate-200 border-b bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">ID Penyaluran & Waktu</th>
                    <th className="px-4 py-3">Kategori Asnaf / Program</th>
                    <th className="px-4 py-3">Aktivitas & Penerima Manfaat</th>
                    <th className="px-4 py-3">Mustahik</th>
                    <th className="px-4 py-3">Nominal Disalurkan</th>
                    <th className="px-4 py-3">Dokumen BAST & Kuitansi</th>
                    <th className="px-4 py-3">Lokasi Wilayah</th>
                    <th className="px-4 py-3 text-center">Status Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredZiswafDisbursements.map((log) => (
                    <tr
                      className="transition hover:bg-slate-50/70"
                      key={log.id}
                    >
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <div className="font-bold font-mono text-slate-900">
                          {log.id}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {log.timestamp}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-bold text-[10px] text-amber-900">
                          {log.asnafCategory}
                        </span>
                        <div className="mt-1 max-w-xs truncate font-semibold text-[11px] text-slate-900">
                          {log.program}
                        </div>
                      </td>
                      <td className="max-w-sm px-4 py-3.5 text-slate-700 leading-relaxed">
                        {log.activity}
                      </td>
                      <td className="px-4 py-3.5 font-bold font-mono text-slate-900">
                        {log.recipientsCount.toLocaleString('id-ID')} Jiwa
                      </td>
                      <td className="px-4 py-3.5 font-bold font-mono text-emerald-950">
                        {formatRupiah(log.disbursement)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-blue-700">
                        <button
                          className="flex max-w-xs cursor-pointer items-center gap-1 truncate hover:underline"
                          onClick={() =>
                            showToast({
                              title: 'Lampiran Berita Acara',
                              description: `Membuka pratinjau dokumen BAST & Kuitansi Penyaluran: ${log.bastDocument}`,
                              type: 'info',
                            })
                          }
                          title={log.bastDocument}
                          type="button"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                          <span className="truncate">{log.bastDocument}</span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-slate-600">
                        {log.location}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-center">
                        <span className="flex items-center justify-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-bold text-[10px] text-emerald-800">
                          <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-menu View 3: Progres Fisik Proyek Wakaf (Nazhir & Super Admin) */}
          {transparencySubTab === 'physical' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-slate-200 border-b bg-slate-50 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Log ID & Waktu</th>
                    <th className="px-4 py-3">Program Wakaf</th>
                    <th className="px-4 py-3">Aktivitas Fisik Proyek</th>
                    <th className="px-4 py-3">Progres Fisik</th>
                    <th className="px-4 py-3">Pencairan Dana</th>
                    <th className="px-4 py-3">Bukti Kuitansi & Vendor</th>
                    <th className="px-4 py-3 text-center">Status Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPhysicalLogs.map((log) => (
                    <tr
                      className="transition hover:bg-slate-50/70"
                      key={log.id}
                    >
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <div className="font-bold font-mono text-slate-900">
                          {log.id}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {log.timestamp}
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3.5 font-semibold text-slate-900">
                        {log.program}
                      </td>
                      <td className="max-w-sm px-4 py-3.5 text-slate-700">
                        {log.activity}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="w-28 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-[#1B5E20]">
                              {log.progressFisik}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-1.5 rounded-full bg-[#1B5E20]"
                              style={{ width: `${log.progressFisik}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-bold font-mono text-slate-900">
                        {formatRupiah(log.disbursement)}
                      </td>
                      <td className="px-4 py-3.5 text-[11px]">
                        <button
                          className="flex cursor-pointer items-center gap-1 font-mono text-blue-700 hover:underline"
                          onClick={() =>
                            showToast({
                              title: 'Lampiran Digital',
                              description: `Membuka pratinjau kuitansi terverifikasi: ${log.receiptFile}`,
                              type: 'info',
                            })
                          }
                          type="button"
                        >
                          <Receipt className="h-3 w-3 text-blue-600" />
                          {log.receiptFile}
                        </button>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {log.vendor}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 font-bold text-[10px] text-emerald-800">
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Main Content: Legalitas Program / Lembaga */}
      {mainTab === 'legalitas' && (
        <div className="space-y-5">
          {/* Search, Filter Bar & Tambah Dokumen Action */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute top-3 left-3.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-10 pl-10 text-slate-900 text-xs placeholder-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]"
                  onChange={(e) => setLegalSearchQuery(e.target.value)}
                  placeholder="Cari nama berkas, nomor SK/Izin, penerbit (BAZNAS, BWI, DSN-MUI, Kemenag, Kemensos)..."
                  type="text"
                  value={legalSearchQuery}
                />
                {legalSearchQuery && (
                  <button
                    className="absolute top-2.5 right-3 cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
                    onClick={() => setLegalSearchQuery('')}
                    title="Hapus pencarian"
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Category Dropdown */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-slate-400" />
                  <SelectField
                    onChange={(e) => setLegalCategoryFilter(e.target.value)}
                    value={legalCategoryFilter}
                  >
                    {legalCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === 'SEMUA' ? 'Semua Kategori Dokumen' : cat}
                      </option>
                    ))}
                  </SelectField>
                </div>

                {/* Tombol Tambah Dokumen Legalitas */}
                <button
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716] hover:shadow-md"
                  onClick={handleOpenAddModal}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah Dokumen</span>
                </button>
              </div>
            </div>

            {/* Result Counter & Active Query Indication */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-slate-100 border-t pt-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <span>
                  Menampilkan{' '}
                  <strong className="text-slate-900">
                    {filteredLegalDocs.length}
                  </strong>{' '}
                  dari{' '}
                  <span className="text-slate-500">
                    {legalDocs.length} dokumen legalitas resmi
                  </span>
                </span>
                <span className="rounded border border-amber-200 bg-amber-100 px-2 py-0.5 font-bold text-[10px] text-amber-800">
                  using dummy data
                </span>
                {(legalSearchQuery || legalCategoryFilter !== 'SEMUA') && (
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-[11px] text-emerald-800">
                    Filter Aktif
                  </span>
                )}
              </div>

              {(legalSearchQuery || legalCategoryFilter !== 'SEMUA') && (
                <button
                  className="flex cursor-pointer items-center gap-1 font-semibold text-rose-600 text-xs hover:text-rose-700"
                  onClick={() => {
                    setLegalSearchQuery('');
                    setLegalCategoryFilter('SEMUA');
                  }}
                  type="button"
                >
                  <X className="h-3 w-3" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>

          {/* Grid of Legal Documents */}
          {filteredLegalDocs.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredLegalDocs.map((doc) => (
                <div
                  className="flex flex-col justify-between space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:border-emerald-300 hover:shadow-xs"
                  key={doc.id}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-xl bg-emerald-50 p-2 text-[#1B5E20]">
                          <FileText className="h-5 w-5" />
                        </span>
                        <div>
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-semibold text-[10px] text-slate-700">
                            {doc.category}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 font-bold text-[10px] text-emerald-800">
                          {doc.status}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {doc.title}
                      </h3>
                      {doc.description && (
                        <p className="mt-1 line-clamp-2 text-slate-500 text-xs leading-relaxed">
                          {doc.description}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-3 font-mono text-slate-600 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 font-sans text-slate-500">
                          Nomor SK/Izin:
                        </span>
                        <strong className="truncate text-right text-slate-800">
                          {doc.docNumber}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 font-sans text-slate-500">
                          Penerbit:
                        </span>
                        <strong className="truncate text-right text-slate-800">
                          {doc.issuer}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 font-sans text-slate-500">
                          Masa Berlaku:
                        </span>
                        <strong className="text-slate-800">
                          {doc.validUntil}
                        </strong>
                      </div>
                      {doc.fileName && (
                        <div className="flex items-center justify-between gap-2 border-slate-200/60 border-t pt-1">
                          <span className="shrink-0 font-sans text-slate-500">
                            File Lampiran:
                          </span>
                          <span className="flex items-center gap-1 truncate font-semibold text-emerald-700">
                            <FileCheck className="h-3 w-3 shrink-0 text-emerald-600" />
                            {doc.fileName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-slate-100 border-t pt-3">
                    <span className="font-medium font-mono text-[11px] text-slate-500">
                      {doc.fileSize}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        className="flex cursor-pointer items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 text-xs transition hover:bg-slate-200"
                        onClick={() => setPreviewDocModal(doc)}
                        title="Pratinjau Berkas"
                        type="button"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-600" />
                        <span>Lihat</span>
                      </button>

                      <button
                        className="flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-800 text-xs transition hover:bg-emerald-100"
                        onClick={() =>
                          showToast({
                            title: 'Unduhan Berhasil',
                            description: `Salinan resmi berkas "${doc.title}" (${doc.fileSize}) berhasil diunduh.`,
                            type: 'success',
                          })
                        }
                        title="Unduh PDF Resmi"
                        type="button"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Unduh</span>
                      </button>

                      <button
                        className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50 p-1.5 font-semibold text-amber-800 text-xs transition hover:bg-amber-100"
                        onClick={() => handleOpenEditModal(doc)}
                        title="Edit Dokumen Legalitas"
                        type="button"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 p-1.5 font-semibold text-rose-700 text-xs transition hover:bg-rose-100"
                        onClick={() => setDeleteConfirmDoc(doc)}
                        title="Hapus Dokumen Legalitas"
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-2xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">
                Tidak Ada Dokumen Legalitas yang Cocok
              </h4>
              <p className="mx-auto max-w-md text-slate-500 text-xs">
                Tidak ditemukan dokumen dengan kata kunci &quot;
                {legalSearchQuery}&quot; pada kategori yang dipilih.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                  onClick={() => {
                    setLegalSearchQuery('');
                    setLegalCategoryFilter('SEMUA');
                  }}
                  type="button"
                >
                  Reset Pencarian
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs transition hover:bg-[#144716]"
                  onClick={handleOpenAddModal}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah Dokumen Baru</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-emerald-900 p-5 text-emerald-50 sm:flex-row">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 shrink-0 text-emerald-400" />
              <div>
                <h4 className="font-bold text-sm text-white">
                  Sertifikasi & Kepatuhan Berkala
                </h4>
                <p className="text-emerald-200 text-xs">
                  Platform Amwal diaudit secara berkala oleh BAZNAS RI, Badan
                  Wakaf Indonesia (BWI), Dewan Pengawas Syariah DSN-MUI, dan
                  Akuntan Publik Independen (Opini WTP).
                </p>
              </div>
            </div>
            <button
              className="cursor-pointer whitespace-nowrap rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white text-xs hover:bg-emerald-600"
              onClick={() =>
                showToast({
                  title: 'Laporan Audit Syariah & Keuangan',
                  description:
                    'Membuka dokumen Opini Wajar Tanpa Pengecualian (WTP) & Kepatuhan Syariah 2025/2026.',
                  type: 'info',
                })
              }
              type="button"
            >
              Lihat Laporan Audit Tahunan
            </button>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH / EDIT DOKUMEN LEGALITAS */}
      {showAddEditModal && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
          <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-slate-100 border-b pb-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-xl bg-emerald-100 p-2 text-[#1B5E20]">
                  {editingDoc ? (
                    <Edit3 className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </span>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingDoc
                      ? 'Edit Dokumen Legalitas Lembaga'
                      : 'Tambah Dokumen Legalitas Baru'}
                  </h3>
                  <p className="text-slate-500 text-xs">
                    {editingDoc
                      ? `Perbarui informasi dan masa berlaku berkas ${editingDoc.id}`
                      : 'Arsipkan dokumen legalitas LAZ, izin BAZNAS/BWI, SK Kemenag, atau fatwa DPS'}
                  </p>
                </div>
              </div>
              <button
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                onClick={() => {
                  setShowAddEditModal(false);
                  setEditingDoc(null);
                }}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSaveDocument}>
              <div>
                <label
                  className="mb-1 block font-bold text-slate-700 text-xs"
                  htmlFor="documents-f1605"
                >
                  Nama Dokumen / Sertifikasi{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]"
                  id="documents-f1605"
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={
                    currentRole === 'lainnya'
                      ? 'Contoh: SK Izin Operasional Lembaga Amil Zakat (LAZ) BAZNAS RI'
                      : 'Contoh: Tanda Daftar Nazhir Wakaf Uang Badan Wakaf Indonesia (BWI)'
                  }
                  required
                  type="text"
                  value={formData.title}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block font-bold text-slate-700 text-xs"
                    htmlFor="documents-f1627"
                  >
                    Kategori Dokumen <span className="text-rose-500">*</span>
                  </label>
                  <SelectField
                    className="w-full"
                    id="documents-f1627"
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    value={formData.category}
                  >
                    <option value="Legalitas Lembaga Amil Zakat (LAZ)">
                      Legalitas Lembaga Amil Zakat (LAZ)
                    </option>
                    <option value="Izin Operasional Nazhir">
                      Izin Operasional Nazhir
                    </option>
                    <option value="Kepatuhan Syariah ZISWAF">
                      Kepatuhan Syariah ZISWAF
                    </option>
                    <option value="Legalitas Lembaga Sosial">
                      Legalitas Lembaga Sosial
                    </option>
                    <option value="Badan Hukum">Badan Hukum</option>
                    <option value="Perbankan Syariah Terpisah">
                      Perbankan Syariah Terpisah
                    </option>
                    <option value="Perpajakan & Pengurang Pajak">
                      Perpajakan & Pengurang Pajak
                    </option>
                    <option value="Kepatuhan & Sertifikasi Mutu">
                      Kepatuhan & Sertifikasi Mutu
                    </option>
                    <option value="Audit Keuangan & Transparansi">
                      Audit Keuangan & Transparansi
                    </option>
                  </SelectField>
                </div>

                <div>
                  <label
                    className="mb-1 block font-bold text-slate-700 text-xs"
                    htmlFor="documents-f1666"
                  >
                    Status Validasi <span className="text-rose-500">*</span>
                  </label>
                  <SelectField
                    className="w-full"
                    id="documents-f1666"
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    value={formData.status}
                  >
                    <option value="AKTIF & TERVALIDASI">
                      AKTIF & TERVALIDASI
                    </option>
                    <option value="TERDAFTAR RESMI">TERDAFTAR RESMI</option>
                    <option value="TERSTANDARISASI">TERSTANDARISASI</option>
                    <option value="OPINI WTP">OPINI WTP</option>
                    <option value="DALAM PROSES PERPANJANGAN">
                      DALAM PROSES PERPANJANGAN
                    </option>
                  </SelectField>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block font-bold text-slate-700 text-xs"
                    htmlFor="documents-f1691"
                  >
                    Nomor SK / Izin / Akta{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]"
                    id="documents-f1691"
                    onChange={(e) =>
                      setFormData({ ...formData, docNumber: e.target.value })
                    }
                    placeholder="Contoh: BAZNAS/KEP-LAZ/0892/2024"
                    required
                    type="text"
                    value={formData.docNumber}
                  />
                </div>

                <div>
                  <label
                    className="mb-1 block font-bold text-slate-700 text-xs"
                    htmlFor="documents-f1708"
                  >
                    Instansi / Lembaga Penerbit{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]"
                    id="documents-f1708"
                    onChange={(e) =>
                      setFormData({ ...formData, issuer: e.target.value })
                    }
                    placeholder="Contoh: Badan Amil Zakat Nasional (BAZNAS) & Kemenag"
                    required
                    type="text"
                    value={formData.issuer}
                  />
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-slate-700 text-xs"
                  htmlFor="documents-f1726"
                >
                  Masa Berlaku Dokumen <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]"
                  id="documents-f1726"
                  onChange={(e) =>
                    setFormData({ ...formData, validUntil: e.target.value })
                  }
                  placeholder="Contoh: 31 Desember 2028 atau Seumur Hidup"
                  required
                  type="text"
                  value={formData.validUntil}
                />
              </div>

              <div>
                <label
                  className="mb-1 block font-bold text-slate-700 text-xs"
                  htmlFor="documents-f1742"
                >
                  Deskripsi / Cakupan Legalitas
                </label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]"
                  id="documents-f1742"
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Keterangan singkat peruntukan izin, dasar hukum undang-undang, atau kewenangan operasional..."
                  rows={2}
                  value={formData.description}
                />
              </div>

              {/* Upload Berkas Lampiran PDF */}
              <div>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: dipulihkan 1:1 dari origin/awan (PR #28) — label ini menaungi satu GRUP kontrol (toggle unggah/tautan, preset, editor), bukan satu kontrol tunggal; perbaikan sebenarnya butuh fieldset/legend yang mengubah DOM */}
                <label className="mb-1 block font-bold text-slate-700 text-xs">
                  Unggah Berkas PDF Salinan Resmi
                </label>
                <div className="cursor-pointer rounded-xl border-2 border-slate-200 border-dashed bg-slate-50 p-4 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40">
                  <UploadCloud className="mx-auto mb-1.5 h-7 w-7 text-slate-400" />
                  <p className="font-bold text-slate-800 text-xs">
                    {formData.fileName || 'Klik untuk memilih berkas PDF'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Format didukung: PDF, PDF/A, Signed PDF (Maks. 15 MB)
                  </p>
                  <button
                    className="mt-2 inline-block cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 text-xs shadow-2xs transition hover:border-emerald-400 hover:text-[#1B5E20]"
                    onClick={() => {
                      const sampleName = formData.title
                        ? `${formData.title.slice(0, 20).replace(/\s+/g, '_')}_Official_Signed.pdf`
                        : 'Berkas_Legalitas_Lembaga.pdf';
                      setFormData({
                        ...formData,
                        fileName: sampleName,
                        fileSize: '3.2 MB (PDF Signed)',
                      });
                      showToast({
                        title: 'Berkas Terlampir',
                        description: `File "${sampleName}" berhasil disematkan.`,
                        type: 'info',
                      });
                    }}
                    type="button"
                  >
                    Pilih File Salinan PDF
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-slate-100 border-t pt-3">
                <button
                  className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                  onClick={() => {
                    setShowAddEditModal(false);
                    setEditingDoc(null);
                  }}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-5 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716]"
                  type="submit"
                >
                  <Check className="h-4 w-4" />
                  <span>
                    {editingDoc ? 'Simpan Perubahan' : 'Arsipkan Dokumen'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRATINJAU DOKUMEN RESMI */}
      {previewDocModal && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
          <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-slate-100 border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-emerald-100 p-2 text-[#1B5E20]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Salinan Resmi Dokumen Terdaftar
                  </h3>
                  <span className="font-mono text-slate-500 text-xs">
                    {previewDocModal.id}
                  </span>
                </div>
              </div>
              <button
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setPreviewDocModal(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6 font-sans">
              <div className="space-y-1 border-slate-200 border-b pb-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 font-black text-sm text-white tracking-wider">
                  AMW
                </div>
                <h4 className="mt-2 font-bold text-slate-900 text-sm uppercase tracking-wide">
                  {previewDocModal.title}
                </h4>
                <p className="font-mono text-slate-500 text-xs">
                  {previewDocModal.docNumber}
                </p>
                <span className="mt-1 inline-block rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 font-bold text-[10px] text-emerald-800">
                  {previewDocModal.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">
                    Instansi / Otoritas Penerbit:
                  </span>
                  <p className="font-bold text-slate-800">
                    {previewDocModal.issuer}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">
                    Masa Berlaku Resmi:
                  </span>
                  <p className="font-bold text-slate-800">
                    {previewDocModal.validUntil}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">
                    Kategori Dokumen:
                  </span>
                  <p className="font-bold text-slate-800">
                    {previewDocModal.category}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
                  <span className="text-[11px] text-slate-500">
                    Nama Berkas Lampiran:
                  </span>
                  <p className="truncate font-bold font-mono text-emerald-800">
                    {previewDocModal.fileName || `${previewDocModal.id}.pdf`}
                  </p>
                </div>
              </div>

              <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <span className="text-[11px] text-slate-500">
                  Ringkasan Cakupan Legalitas:
                </span>
                <p className="text-slate-700 leading-relaxed">
                  {previewDocModal.description}
                </p>
              </div>

              <div className="flex items-center justify-between border-slate-200 border-t pt-2 text-[11px] text-slate-500">
                <span>
                  Ukuran Berkas: <strong>{previewDocModal.fileSize}</strong>
                </span>
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Stempel Digital Terverifikasi BAZNAS & BWI
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 font-bold text-amber-800 text-xs transition hover:bg-amber-100"
                onClick={() => {
                  handleOpenEditModal(previewDocModal);
                  setPreviewDocModal(null);
                }}
                type="button"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Data Dokumen</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                  onClick={() => setPreviewDocModal(null)}
                  type="button"
                >
                  Tutup
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716]"
                  onClick={() => {
                    showToast({
                      title: 'Unduhan Berhasil',
                      description: `Salinan resmi (${previewDocModal.fileSize}) ${previewDocModal.title} berhasil diunduh.`,
                      type: 'success',
                    });
                    setPreviewDocModal(null);
                  }}
                  type="button"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Unduh Dokumen PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KONFIRMASI HAPUS DOKUMEN */}
      {deleteConfirmDoc && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs duration-150">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="rounded-xl bg-rose-100 p-2.5">
                <AlertCircle className="h-6 w-6" />
              </span>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Hapus Dokumen Legalitas?
                </h3>
                <p className="text-slate-500 text-xs">
                  Tindakan ini akan menghapus berkas dari pangkalan data.
                </p>
              </div>
            </div>

            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-bold text-slate-900">
                {deleteConfirmDoc.title}
              </p>
              <p className="font-mono text-[11px] text-slate-500">
                {deleteConfirmDoc.docNumber}
              </p>
              <p className="text-[11px] text-slate-600">
                Penerbit: {deleteConfirmDoc.issuer}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                onClick={() => setDeleteConfirmDoc(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white text-xs shadow-xs transition hover:bg-rose-700"
                onClick={() => handleDeleteDocument(deleteConfirmDoc)}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Ya, Hapus Dokumen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
