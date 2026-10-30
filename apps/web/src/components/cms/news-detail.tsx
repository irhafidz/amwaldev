'use client';

import type { CmsArticle } from '@amwal/core/contracts/cms';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  ExternalLink,
  LoaderCircle,
} from 'lucide-react';
import { useResource } from '@/lib/amwal-api/use-resource';
import { formatWibDate } from '@/lib/format-wib';
import { orpc } from '@/lib/orpc/client';

/** A single published news article (`cms.byId` never returns drafts). */
export function NewsDetail({ id }: { id: string }) {
  const { state, reload } = useResource(() => orpc.cms.byId({ id }), {
    enabled: Boolean(id),
  });

  return (
    <article className="mx-auto w-full max-w-3xl pb-10">
      <Link
        className="mb-5 inline-flex items-center gap-1.5 font-medium text-gray-500 text-sm hover:text-[#356152]"
        to="/berita"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Semua Berita
      </Link>

      {state.status === 'loading' && (
        <div className="flex justify-center py-20">
          <LoaderCircle
            aria-hidden="true"
            className="size-8 animate-spin text-[#356152]"
          />
        </div>
      )}

      {state.status === 'error' && (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="size-8 text-rose-500" />
          <p className="text-gray-600 text-sm">{state.error}</p>
          <button
            className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 font-semibold text-gray-700 text-xs hover:bg-gray-50"
            onClick={reload}
            type="button"
          >
            Coba lagi
          </button>
        </div>
      )}

      {state.status === 'success' && (
        <ArticleBody item={state.data as CmsArticle} />
      )}
    </article>
  );
}

function ArticleBody({ item }: { item: CmsArticle }) {
  return (
    <>
      {item.coverUrl && (
        /** biome-ignore lint/performance/noImgElement: dynamic admin-supplied cover */
        <img
          alt={item.judul}
          className="mb-6 max-h-96 w-full rounded-2xl object-cover"
          src={item.coverUrl}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {item.kategori && (
          <span className="rounded-md bg-[#e2ece8] px-2.5 py-1 font-semibold text-[#1d352d] text-xs">
            {item.kategori}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-gray-400 text-xs">
          <Calendar aria-hidden="true" className="size-3.5" />
          {formatWibDate(item.publishedAt ?? item.createdAt)}
        </span>
      </div>

      <h1 className="mb-5 font-bold text-2xl text-gray-900 leading-tight sm:text-3xl dark:text-white">
        {item.judul}
      </h1>

      <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed dark:text-slate-300">
        {item.body || 'Tidak ada isi teks.'}
      </div>

      {item.kontenUrl && (
        <div className="mt-6 border-gray-100 border-t pt-4">
          <a
            className="inline-flex items-center gap-1.5 font-semibold text-[#356152] text-xs hover:underline"
            href={item.kontenUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span>Buka Tautan Lampiran Eksternal</span>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      )}
    </>
  );
}
