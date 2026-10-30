'use client';

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Mail,
  MessageCircle,
  PhoneCall,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  supportWhatsAppUrl,
} from '@/lib/support-contact';

type FaqCategory = 'Semua' | 'Wakaf' | 'Sertifikat' | 'Transaksi' | 'Legalitas';

interface FaqItem {
  id: string;
  category: Exclude<FaqCategory, 'Semua'>;
  question: string;
  answer: string;
}

const FAQ_LIST: FaqItem[] = [
  {
    id: 'faq-1',
    category: 'Wakaf',
    question: 'Bagaimana cara menunaikan wakaf uang di Amwal?',
    answer:
      'Pilih program wakaf yang diminati pada katalog wakaf, tentukan nominal donasi (mulai dari Rp 1.000), isi data diri atau pilih donasi anonim, pilih metode pembayaran (QRIS Dinamis, Virtual Account, atau Transfer Bank), lalu selesaikan pembayaran sebelum batas waktu berakhir.',
  },
  {
    id: 'faq-2',
    category: 'Sertifikat',
    question: 'Kapan saya mendapatkan Sertifikat Wakaf Uang (SWU)?',
    answer:
      'Sertifikat Wakaf Uang (SWU) digital otomatis diterbitkan secara instan setelah pembayaran Anda terverifikasi lunas (LUNAS). Sertifikat dilengkapi QR Code verifikasi resmi dan dapat diunduh langsung melalui menu Dokumen Saya pada halaman Profil atau Riwayat transaksi.',
  },
  {
    id: 'faq-3',
    category: 'Legalitas',
    question: 'Apakah seluruh Nazhir di Amwal telah resmi terdaftar di BWI?',
    answer:
      'Ya, seluruh mitra Nazhir yang terdaftar di platform Amwal telah melalui proses kurasi dan verifikasi legalitas resmi oleh Badan Wakaf Indonesia (BWI) serta Kementerian Agama Republik Indonesia, menjamin pengelolaan wakaf sesuai regulasi UU No. 41 Tahun 2004.',
  },
  {
    id: 'faq-4',
    category: 'Transaksi',
    question:
      'Bagaimana jika pembayaran saya sudah dipotong tetapi status masih tertunda?',
    answer:
      'Sistem kami melakukan sinkronisasi otomatis status pembayaran secara berkala. Jika dalam 15 menit status donasi belum berubah menjadi LUNAS, silakan hubungi tim dukungan resmi kami via WhatsApp dengan menyertakan bukti transfer dan kode transaksi.',
  },
  {
    id: 'faq-5',
    category: 'Wakaf',
    question: 'Apakah pokok harta wakaf uang dapat berkurang atau dibagikan?',
    answer:
      'Tidak. Sesuai prinsip fiqih wakaf dan hukum perwakafan, pokok harta wakaf (ashlul maal) bersifat abadi dan tidak boleh berkurang, dijual, atau dibagikan. Dana wakaf diinvestasikan secara produktif, dan hanya surplus bagi hasil atau manfaatnya yang disalurkan kepada Mauquf Alaih (penerima manfaat).',
  },
  {
    id: 'faq-6',
    category: 'Transaksi',
    question: 'Bagaimana cara menghitung zakat penghasilan atau zakat maal?',
    answer:
      'Anda dapat memanfaatkan fitur Kalkulator Zakat pada aplikasi Amwal. Zakat maal dan penghasilan wajib dikeluarkan sebesar 2,5% apabila harta atau penghasilan bersih telah mencapai nisab setara 85 gram emas dan memenuhi ketentuan haul.',
  },
];

const CATEGORIES: FaqCategory[] = [
  'Semua',
  'Wakaf',
  'Sertifikat',
  'Transaksi',
  'Legalitas',
];

export function HelpCenterView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<FaqCategory>('Semua');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>('faq-1');

  const filteredFaqs = useMemo(() => {
    return FAQ_LIST.filter((item) => {
      const matchCategory =
        selectedCategory === 'Semua' || item.category === selectedCategory;
      const query = searchQuery.trim().toLowerCase();
      if (!query) {
        return matchCategory;
      }
      const matchSearch =
        item.question.toLowerCase().includes(query) ||
        item.answer.toLowerCase().includes(query);
      return matchCategory && matchSearch;
    });
  }, [searchQuery, selectedCategory]);

  const toggleFaq = (id: string) => {
    setExpandedFaqId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex h-full flex-col justify-between">
      {/* Header (Figma Node: 2966-9278) */}
      <header className="z-20 flex shrink-0 items-center justify-between border-gray-100 border-b bg-white px-5 pt-6 pb-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Kembali"
            className="-ml-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-[#1E293B] transition-all hover:bg-slate-100 active:scale-95"
            to="/profil/pengaturan"
          >
            <ArrowLeft className="stroke-[2.5]" size={22} />
          </Link>
          <h1 className="font-bold text-[#1E293B] text-xl tracking-tight">
            Pusat Bantuan
          </h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 space-y-6 overflow-y-auto px-5 py-5 pb-24 sm:px-6">
        {/* Hero Banner Hijau */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#064E3B] via-[#006D34] to-[#00AB55] p-5 text-white shadow-md">
          <div className="-right-6 -bottom-6 pointer-events-none absolute size-28 rounded-full bg-emerald-400/20 blur-2xl" />

          <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 font-semibold text-[10px] text-emerald-100 uppercase tracking-wider backdrop-blur-xs">
            Layanan Donatur 24/7
          </span>
          <h2 className="mt-2 font-bold text-lg text-white tracking-tight sm:text-xl">
            Halo, ada yang bisa kami bantu?
          </h2>
          <p className="mt-1 text-emerald-100 text-xs leading-relaxed">
            Temukan panduan cepat perwakafan, status transaksi, atau hubungi tim
            bantuan Amwal.
          </p>

          {/* Search Bar Interaktif */}
          <div className="relative mt-4 flex items-center">
            <Search
              className="pointer-events-none absolute left-3.5 text-gray-400"
              size={16}
            />
            <input
              aria-label="Cari topik bantuan atau pertanyaan"
              className="w-full rounded-2xl border border-transparent bg-white py-2.5 pr-9 pl-9 text-gray-900 text-xs shadow-inner placeholder:text-gray-400 focus:border-[#00AB55] focus:outline-none focus:ring-2 focus:ring-[#00AB55]/30"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari topik bantuan atau pertanyaan..."
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                aria-label="Hapus kata kunci pencarian"
                className="absolute right-3 cursor-pointer text-gray-400 hover:text-gray-600"
                onClick={() => setSearchQuery('')}
                type="button"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Layanan Bantuan Resmi (3 Card Grid) */}
        <div className="space-y-2.5">
          <h3 className="font-bold text-[#1E293B] text-sm">
            Hubungi Layanan Resmi
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            {/* WhatsApp */}
            <a
              className="flex flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-center transition-all hover:bg-emerald-100/60 active:scale-95"
              href={supportWhatsAppUrl()}
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="mb-1.5 flex size-9 items-center justify-center rounded-xl bg-[#00AB55] text-white shadow-xs">
                <MessageCircle size={18} />
              </div>
              <span className="font-bold text-[#1E293B] text-xs">WhatsApp</span>
              <span className="mt-0.5 truncate text-[10px] text-gray-500">
                {SUPPORT_WHATSAPP_DISPLAY}
              </span>
            </a>

            {/* Email */}
            <a
              className="flex flex-col items-center justify-center rounded-2xl border border-blue-100 bg-blue-50/50 p-3 text-center transition-all hover:bg-blue-100/60 active:scale-95"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              <div className="mb-1.5 flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <Mail size={18} />
              </div>
              <span className="font-bold text-[#1E293B] text-xs">Email</span>
              <span className="mt-0.5 truncate text-[10px] text-gray-500">
                {SUPPORT_EMAIL}
              </span>
            </a>

            {/* Call Center */}
            <a
              className="flex flex-col items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/50 p-3 text-center transition-all hover:bg-amber-100/60 active:scale-95"
              href="tel:02127874080"
            >
              <div className="mb-1.5 flex size-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                <PhoneCall size={18} />
              </div>
              <span className="font-bold text-[#1E293B] text-xs">Telepon</span>
              <span className="mt-0.5 truncate text-[10px] text-gray-500">
                021-27874080
              </span>
            </a>
          </div>
        </div>

        {/* Kategori FAQ Pills */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1E293B] text-sm">
              Pertanyaan yang Sering Diajukan (FAQ)
            </h3>
            <span className="text-[11px] text-gray-400">
              {filteredFaqs.length} Topik
            </span>
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 font-medium text-xs transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#00AB55] text-white shadow-xs'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                type="button"
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Accordion FAQ Interaktif */}
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xs">
            {filteredFaqs.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-xs">
                Tidak ada topik pertanyaan yang cocok dengan pencarian Anda.
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = expandedFaqId === faq.id;
                return (
                  <div className="transition-colors" key={faq.id}>
                    <button
                      aria-expanded={isOpen}
                      className="flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-left"
                      onClick={() => toggleFaq(faq.id)}
                      type="button"
                    >
                      <span className="font-semibold text-[#1E293B] text-xs leading-relaxed sm:text-sm">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={`size-4 shrink-0 text-gray-400 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-[#00AB55]' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-gray-600 text-xs leading-relaxed">
                        <p className="border-emerald-100 border-l-2 pl-3">
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bottom Floating Card: Konsultasi Fiqih Wakaf via AI */}
        <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xs">
                <Bot size={20} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[#1E293B] text-xs">
                    Tanya AI Syariah
                  </span>
                  <span className="flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] text-emerald-800">
                    <Sparkles size={10} />
                    <span>24/7</span>
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Konsultasi kaidah fiqih wakaf & zakat
                </p>
              </div>
            </div>

            <Link
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-xl bg-[#00AB55] px-3 py-2 font-bold text-[11px] text-white shadow-xs transition-all hover:bg-[#009248] active:scale-95"
              to="/tanya-ai"
            >
              <span>Tanya AI</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
