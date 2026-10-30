'use client';

import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  BookOpen,
  ChevronRight,
  Filter,
  Landmark,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { WaqfProgramCard } from '@/components/wakaf/program-card';
import { getActiveWaqfPrograms } from '@/lib/amwal-api';
import { STALE_PROGRAMS_MS } from '@/lib/amwal-api/resource-cache';
import type { WaqfProgram } from '@/lib/amwal-api/types';
import { useResource } from '@/lib/amwal-api/use-resource';
import { cn } from '@/lib/utils';

const FILTER_CHIPS = [
  'Semua',
  'Wakaf',
  'Zakat',
  'Infak',
  'Qurban',
  'Edukasi',
] as const;

type FilterChip = (typeof FILTER_CHIPS)[number];

const STATIC_ARTICLES = [
  {
    id: 'edu-1',
    type: 'Edukasi',
    title: 'Manajemen Keuangan Syariah untuk Keluarga Muda',
    category: 'Finansial Pintar',
    description:
      'Panduan lengkap mengelola arus kas bulanan, dana darurat, dan investasi syariah.',
    image:
      '/assets/images/education/pembagian-harta-waris-menurut-hukum-perdata.png',
    link: '/edukasi',
  },
  {
    id: 'edu-2',
    type: 'Edukasi',
    title: 'Perbedaan Mendasar Zakat, Infaq, Sedekah, dan Wakaf',
    category: 'Fiqih Muamalah',
    description:
      'Memahami rukun, syarat nishab, serta waktu penyaluran tiap ibadah maliyah.',
    image: '/assets/images/education/jangan-tunda-pembagian-warisan.png',
    link: '/edukasi',
  },
  {
    id: 'edu-3',
    type: 'Edukasi',
    title: 'Hukum Faraidh dan Waris Islam Modern',
    category: 'Faraidh',
    description:
      'Tata cara pembagian harta warisan secara syariat untuk mencegah perselisihan keluarga.',
    image: '/assets/images/education/ilmu-faraidh-dijamin-bisa-bagi-waris.png',
    link: '/edukasi',
  },
];

export function DashboardSearchView() {
  const routerSearch = useSearch({ strict: false }) as {
    q?: string;
    category?: string;
  };
  const navigate = useNavigate();

  const [queryInput, setQueryInput] = useState<string>(routerSearch.q || '');
  const [selectedChip, setSelectedChip] = useState<FilterChip>(
    (routerSearch.category as FilterChip) || 'Semua'
  );

  const programsResource = useResource(getActiveWaqfPrograms, {
    key: 'waqf:programs:active',
    staleTime: STALE_PROGRAMS_MS,
  });

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate({
      to: '/dashboard/search',
      search: {
        q: queryInput.trim(),
        category: selectedChip,
      },
    });
  };

  const handleSelectChip = (chip: FilterChip) => {
    setSelectedChip(chip);
    navigate({
      to: '/dashboard/search',
      search: {
        q: queryInput.trim(),
        category: chip,
      },
    });
  };

  // Filter Waqf Programs
  const filteredPrograms = useMemo(() => {
    if (programsResource.state.status !== 'success') {
      return [];
    }
    const q = queryInput.toLowerCase().trim();
    return programsResource.state.data.filter((p: WaqfProgram) => {
      const matchQuery =
        !q ||
        p.judul.toLowerCase().includes(q) ||
        p.deskripsi?.toLowerCase().includes(q) ||
        p.nadzirProfile?.namaLembaga?.toLowerCase().includes(q);

      const matchCategory =
        selectedChip === 'Semua' ||
        (selectedChip === 'Wakaf' &&
          (p.kategori?.toLowerCase().includes('wakaf') || !p.kategori)) ||
        (selectedChip === 'Infak' &&
          p.kategori?.toLowerCase().includes('infaq')) ||
        (selectedChip === 'Zakat' &&
          p.kategori?.toLowerCase().includes('zakat')) ||
        (selectedChip === 'Qurban' &&
          p.kategori?.toLowerCase().includes('qurban'));

      return matchQuery && matchCategory;
    });
  }, [programsResource.state, queryInput, selectedChip]);

  // Filter Education
  const filteredArticles = useMemo(() => {
    if (selectedChip !== 'Semua' && selectedChip !== 'Edukasi') {
      return [];
    }
    const q = queryInput.toLowerCase().trim();
    return STATIC_ARTICLES.filter((article) => {
      if (!q) {
        return true;
      }
      return (
        article.title.toLowerCase().includes(q) ||
        article.description.toLowerCase().includes(q) ||
        article.category.toLowerCase().includes(q)
      );
    });
  }, [queryInput, selectedChip]);

  const totalResults = filteredPrograms.length + filteredArticles.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb Header */}
      <div>
        <div className="flex items-center gap-2 text-gray-500 text-xs dark:text-slate-400">
          <Link
            className="hover:text-gray-900 dark:hover:text-white"
            to="/dashboard"
          >
            Beranda
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#356152] dark:text-emerald-400">
            Pencarian
          </span>
        </div>
        <h1 className="mt-1 font-bold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
          Eksplorasi Program &amp; Kebaikan
        </h1>
      </div>

      {/* 1. Top Search Bar */}
      <section aria-label="Kotak Pencarian">
        <form
          className="relative mx-auto w-full max-w-3xl"
          onSubmit={handleSearchSubmit}
        >
          <Search
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-4 size-5 text-gray-400"
          />
          <input
            aria-label="Cari kata kunci program atau artikel"
            className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pr-12 pl-12 text-gray-900 text-sm shadow-xs transition-all placeholder:text-gray-400 focus:border-[#356152] focus:outline-none focus:ring-2 focus:ring-[#356152]/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Cari program wakaf, zakat, infak, qurban, atau artikel edukasi..."
            type="text"
            value={queryInput}
          />
          {queryInput && (
            <button
              aria-label="Bersihkan pencarian"
              className="-translate-y-1/2 absolute top-1/2 right-3.5 size-7 cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800"
              onClick={() => setQueryInput('')}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </form>
      </section>

      {/* 2. Filter Chips */}
      <section aria-label="Filter Kategori Pencarian">
        <div className="flex items-center gap-2">
          <Filter
            aria-hidden="true"
            className="size-4 shrink-0 text-gray-400"
          />
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            {FILTER_CHIPS.map((chip) => {
              const active = selectedChip === chip;
              return (
                <button
                  className={cn(
                    'cursor-pointer whitespace-nowrap rounded-full px-4 py-2 font-medium text-xs transition-all sm:text-sm',
                    active
                      ? 'bg-[#356152] font-semibold text-white shadow-xs'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                  key={chip}
                  onClick={() => handleSelectChip(chip)}
                  type="button"
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Search Result Count */}
      <div className="flex items-center justify-between border-gray-100 border-b pb-3 dark:border-slate-800">
        <p className="text-gray-600 text-xs sm:text-sm dark:text-slate-400">
          Menampilkan{' '}
          <span className="font-bold text-gray-900 dark:text-white">
            {totalResults}
          </span>{' '}
          hasil
          {queryInput ? (
            <span>
              {' '}
              untuk kata kunci &ldquo;
              <span className="font-semibold text-[#356152] dark:text-emerald-400">
                {queryInput}
              </span>
              &rdquo;
            </span>
          ) : (
            <span>
              {' '}
              pada kategori &ldquo;
              <span className="font-semibold text-[#356152] dark:text-emerald-400">
                {selectedChip}
              </span>
              &rdquo;
            </span>
          )}
        </p>
      </div>

      {/* 3. Responsive Card List of Search Results */}
      <section aria-label="Daftar Hasil Pencarian">
        {programsResource.state.status === 'loading' && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}

        {totalResults === 0 && programsResource.state.status !== 'loading' && (
          <div className="rounded-3xl border border-gray-200 border-dashed bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <Search
              aria-hidden="true"
              className="mx-auto mb-3 size-10 text-gray-400"
            />
            <h3 className="font-bold text-base text-gray-900 dark:text-white">
              Tidak ada hasil yang cocok
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-gray-500 text-xs dark:text-slate-400">
              Coba gunakan kata kunci yang lebih umum atau pilih filter kategori
              lainnya.
            </p>
            <button
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#356152] px-4 py-2 font-semibold text-white text-xs shadow-2xs hover:bg-[#2b4f43]"
              onClick={() => {
                setQueryInput('');
                setSelectedChip('Semua');
              }}
              type="button"
            >
              Reset Pencarian
            </button>
          </div>
        )}

        {/* Results Grid */}
        <div className="space-y-8">
          {/* Program Section */}
          {filteredPrograms.length > 0 && (
            <div>
              <div className="mb-3.5 flex items-center gap-2">
                <Landmark
                  aria-hidden="true"
                  className="size-4 text-[#356152] dark:text-emerald-400"
                />
                <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
                  Program Kebaikan &amp; Wakaf ({filteredPrograms.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPrograms.map((program) => (
                  <WaqfProgramCard key={program.id} program={program} />
                ))}
              </div>
            </div>
          )}

          {/* Education Article Section */}
          {filteredArticles.length > 0 && (
            <div>
              <div className="mb-3.5 flex items-center gap-2">
                <BookOpen
                  aria-hidden="true"
                  className="size-4 text-[#356152] dark:text-emerald-400"
                />
                <h2 className="font-bold text-base text-gray-900 sm:text-lg dark:text-white">
                  Artikel &amp; Edukasi Syariah ({filteredArticles.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredArticles.map((article) => (
                  <Link
                    className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs transition-all hover:border-emerald-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                    key={article.id}
                    to={article.link}
                  >
                    <div className="relative h-40 w-full overflow-hidden bg-slate-100">
                      {/** biome-ignore lint/performance/noImgElement: static assets */}
                      <img
                        alt={article.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        src={article.image}
                      />
                      <span className="absolute top-3 left-3 rounded-md bg-white/90 px-2.5 py-0.5 font-bold text-[#356152] text-[10px] backdrop-blur-md dark:bg-slate-900/90 dark:text-emerald-400">
                        {article.category}
                      </span>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <h3 className="line-clamp-2 font-bold text-gray-900 text-sm leading-snug transition-colors group-hover:text-[#356152] dark:text-white dark:group-hover:text-emerald-400">
                          {article.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-gray-500 text-xs dark:text-slate-400">
                          {article.description}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-gray-100 border-t pt-3 dark:border-slate-800">
                        <span className="inline-flex items-center gap-1 font-semibold text-[#356152] text-xs group-hover:underline dark:text-emerald-400">
                          <span>Baca Materi</span>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        </span>
                        <Sparkles
                          aria-hidden="true"
                          className="size-3.5 text-amber-400"
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
