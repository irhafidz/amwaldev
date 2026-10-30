'use client';

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  LoaderCircle,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getActiveWaqfPrograms } from '@/lib/amwal-api';
import { STALE_PROGRAMS_MS } from '@/lib/amwal-api/resource-cache';
import { useResource } from '@/lib/amwal-api/use-resource';
import { WaqfProgramCard, WaqfProgramGridCard } from './program-card';

const CATEGORIES = [
  'Semua',
  'Pendidikan',
  'Kesehatan',
  'Produktif',
  'Infrastruktur',
  'Sosial',
];

export function WaqfCatalog() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const { state, reload } = useResource(getActiveWaqfPrograms, {
    key: 'waqf:programs:active',
    staleTime: STALE_PROGRAMS_MS,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredPrograms = useMemo(() => {
    if (state.status !== 'success') {
      return [];
    }
    const query = debouncedQuery.trim().toLowerCase();

    return state.data.filter((program) => {
      const matchSearch =
        query.length === 0 ||
        (program.judul ?? '').toLowerCase().includes(query) ||
        (program.deskripsi ?? '').toLowerCase().includes(query) ||
        (program.kategori ?? '').toLowerCase().includes(query) ||
        (program.nadzirProfile?.namaLembaga ?? '')
          .toLowerCase()
          .includes(query);

      const matchCategory =
        selectedCategory === 'Semua' ||
        (program.kategori ?? '')
          .toLowerCase()
          .includes(selectedCategory.toLowerCase());

      return matchSearch && matchCategory;
    });
  }, [state, debouncedQuery, selectedCategory]);

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Top Header & Search Area */}
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs md:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Link
                aria-label="Kembali ke Dashboard"
                className="flex size-9 cursor-pointer items-center justify-center rounded-xl text-gray-700 transition-colors hover:bg-gray-100 md:hidden dark:text-slate-200 dark:hover:bg-slate-800"
                to="/dashboard"
              >
                <ArrowLeft className="size-5" />
              </Link>
              <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
                Program Wakaf
              </h1>
            </div>
            <p className="mt-1 text-gray-500 text-xs sm:text-sm dark:text-slate-400">
              Salurkan wakaf uang secara amanah, produktif, dan diawasi resmi
              BWI.
            </p>
          </div>

          {/* Integrated Search Input */}
          <div className="relative w-full md:w-80 lg:w-96">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3.5 size-4 text-gray-400" />
            <input
              aria-label="Cari program wakaf"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pr-4 pl-10 font-jakarta text-gray-900 text-xs shadow-2xs transition-all placeholder:text-gray-400 hover:bg-gray-100/80 focus:border-[#356152] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#356152]/20 sm:text-sm dark:border-slate-800 dark:bg-slate-800 dark:text-white"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari: Pendidikan, Masjid, Produktif..."
              type="text"
              value={searchInput}
            />
          </div>
        </div>

        {/* Filter Category Chips */}
        <div className="mt-5 border-gray-100 border-t pt-4 dark:border-slate-800">
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            <span className="hidden items-center gap-1.5 font-semibold text-gray-400 text-xs md:inline-flex">
              <SlidersHorizontal className="size-3.5 text-[#356152]" />
              <span>Kategori:</span>
            </span>
            {CATEGORIES.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <button
                  className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 font-medium text-xs transition-all sm:text-sm ${
                    isSelected
                      ? 'bg-[#356152] font-semibold text-white shadow-xs'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  type="button"
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div>
        {state.status === 'loading' && (
          <output
            aria-label="Memuat program wakaf"
            className="flex flex-col items-center justify-center rounded-3xl border border-gray-100 bg-white py-20 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <LoaderCircle
              aria-hidden="true"
              className="mb-3 size-9 animate-spin text-[#356152]"
            />
            <p className="font-medium text-gray-600 text-sm dark:text-slate-300">
              Memuat daftar program wakaf...
            </p>
            <p className="mt-1 text-gray-400 text-xs">
              Menghubungkan dengan database resmi BWI
            </p>
          </output>
        )}

        {state.status === 'error' && (
          <div
            className="flex flex-col items-center rounded-3xl border border-rose-200 bg-rose-50 px-5 py-12 text-center dark:border-rose-950 dark:bg-rose-950/30"
            role="alert"
          >
            <p className="font-semibold text-base text-gray-900 dark:text-white">
              Gagal memuat program wakaf
            </p>
            <p className="mt-1 text-gray-500 text-xs dark:text-slate-400">
              {state.error}
            </p>
            <Button
              className="mt-4"
              onClick={reload}
              type="button"
              variant="outline"
            >
              Coba lagi
            </Button>
          </div>
        )}

        {state.status === 'success' && filteredPrograms.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-gray-200 border-dashed bg-white py-16 text-center text-gray-400 dark:border-slate-800 dark:bg-slate-900">
            <Search className="mb-3 size-12 stroke-1 text-gray-300 dark:text-slate-600" />
            <p className="font-bold text-base text-gray-800 dark:text-white">
              Tidak ada program ditemukan
            </p>
            <p className="mt-1 text-gray-400 text-xs">
              Coba kata kunci lain atau pilih kategori &quot;Semua&quot;
            </p>
          </div>
        )}

        {state.status === 'success' && filteredPrograms.length > 0 && (
          <>
            {/* Desktop Layout (>= md): 3-Column Grid with WaqfProgramGridCard */}
            <div className="hidden grid-cols-1 gap-5 sm:grid-cols-2 md:grid lg:grid-cols-3">
              {filteredPrograms.map((program) => (
                <WaqfProgramGridCard key={program.id} program={program} />
              ))}
            </div>

            {/* Mobile Layout (< md): Clean Vertical Stack with Compact Cards */}
            <div className="flex flex-col gap-3.5 md:hidden">
              {filteredPrograms.map((program) => (
                <WaqfProgramCard key={program.id} program={program} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
