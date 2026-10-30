'use client';

import type { CmsArticle } from '@amwal/core/contracts/cms';
import { Link } from '@tanstack/react-router';
import { Calendar, Newspaper, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useAdminQuery,
  useDebouncedValue,
} from '@/components/admin/use-admin-query';
import { formatWibDate } from '@/lib/format-wib';
import { orpc } from '@/lib/orpc/client';
import { makeExcerpt } from '@/lib/text/excerpt';

const SEARCH_DEBOUNCE_MS = 300;
const FETCH_LIMIT = 100;

function NewsCard({ item }: { item: CmsArticle }) {
  return (
    <Link
      className="group hover:-translate-y-1 flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-xs transition-all duration-200 hover:border-[#356152]/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
      params={{ id: item.id }}
      to="/berita/$id"
    >
      <div className="relative h-48 w-full overflow-hidden bg-gray-100">
        {item.coverUrl ? (
          /** biome-ignore lint/performance/noImgElement: dynamic admin-supplied cover */
          <img
            alt={item.judul}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            src={item.coverUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#e2ece8] to-[#f2f6f4] text-[#356152]">
            <Newspaper aria-hidden="true" className="size-10 opacity-50" />
          </div>
        )}
        {item.kategori && (
          <span className="absolute top-3 left-3 rounded-md bg-white/90 px-2.5 py-1 font-semibold text-[#1d352d] text-[11px] shadow-xs backdrop-blur-xs">
            {item.kategori}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center gap-2 text-gray-400 text-xs">
          <Calendar aria-hidden="true" className="size-3.5" />
          <span>{formatWibDate(item.publishedAt ?? item.createdAt)}</span>
        </div>
        <h2 className="mb-2 font-bold text-base text-gray-900 leading-snug group-hover:text-[#356152] dark:text-white">
          {item.judul}
        </h2>
        <p className="line-clamp-3 text-gray-600 text-xs leading-relaxed dark:text-slate-400">
          {makeExcerpt(item.body) || 'Klik untuk membaca selengkapnya.'}
        </p>
        <div className="mt-auto flex items-center gap-1 pt-4 font-semibold text-[#356152] text-xs transition-all group-hover:gap-1.5">
          <span>Baca Selengkapnya</span>
          <span aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}

export function NewsView() {
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('all');
  const search = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const query = useAdminQuery(
    () =>
      orpc.cms.list({
        type: 'ARTIKEL',
        search: search || undefined,
        limit: FETCH_LIMIT,
      }),
    [search]
  );

  const items = (query.data?.items ?? []) as CmsArticle[];
  // Pills come from the categories admins actually used, not a fixed list.
  const categories = useMemo(
    () => [
      ...new Set(
        items
          .map((item) => item.kategori)
          .filter((k): k is string => Boolean(k))
      ),
    ],
    [items]
  );
  const visible =
    category === 'all' ? items : items.filter((i) => i.kategori === category);

  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold text-[#356152] text-sm uppercase tracking-wider">
            <Newspaper aria-hidden="true" className="size-4" />
            <span>Kabar &amp; Pembaruan</span>
          </div>
          <h1 className="mt-1 font-bold text-3xl text-gray-900 tracking-tight dark:text-white">
            Berita &amp; Kegiatan Amwal
          </h1>
          <p className="mt-1 text-gray-600 text-sm dark:text-slate-400">
            Informasi terkini penyaluran wakaf, zakat, infaq, dan dampak sosial.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            aria-hidden="true"
            className="absolute top-3 left-3.5 size-4 text-gray-400"
          />
          <input
            aria-label="Cari berita"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm shadow-xs transition placeholder:text-gray-400 focus:border-[#356152] focus:outline-hidden focus:ring-2 focus:ring-[#356152]/20 dark:border-slate-800 dark:bg-slate-900"
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari berita..."
            type="search"
            value={searchInput}
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {['all', ...categories].map((name) => (
            <button
              aria-pressed={category === name}
              className={`cursor-pointer rounded-full px-4 py-2 font-medium text-xs transition ${
                category === name
                  ? 'bg-[#356152] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
              key={name}
              onClick={() => setCategory(name)}
              type="button"
            >
              {name === 'all' ? 'Semua Berita' : name}
            </button>
          ))}
        </div>
      )}

      {query.error && (
        <div
          className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center text-rose-700"
          role="alert"
        >
          <p className="font-semibold">Terjadi kesalahan</p>
          <p className="mt-1 text-sm">{query.error}</p>
          <button
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 font-medium text-white text-xs hover:bg-rose-700"
            onClick={query.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      {!query.error && query.data === null && <NewsSkeleton />}

      {!query.error && query.data && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 border-dashed bg-gray-50/50 py-16 text-center dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[#e2ece8] text-[#356152]">
            <Newspaper aria-hidden="true" className="size-6" />
          </div>
          <h2 className="font-bold text-gray-900 text-lg dark:text-white">
            Belum Ada Berita Diterbitkan
          </h2>
          <p className="mt-1 max-w-md text-gray-500 text-sm">
            Saat ini belum ada artikel berita yang tersedia. Silakan kembali
            lagi nanti untuk kabar terbaru.
          </p>
        </div>
      )}

      {!query.error && visible.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <NewsCard item={item} key={item.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {['s1', 's2', 's3'].map((key) => (
        <div
          className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-xs"
          key={key}
        >
          <div className="mb-4 h-44 w-full rounded-xl bg-gray-200" />
          <div className="mb-2 h-4 w-1/3 rounded bg-gray-200" />
          <div className="mb-2 h-6 w-5/6 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
