'use client';

import { parseYoutubeVideoId } from '@amwal/core/education/youtube';
import { ACTIVITY_POINTS } from '@amwal/core/gamification/points';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  Clock,
  Flame,
  Play,
  Search,
  Sparkles,
  Trophy,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { stripHtmlTags } from '@/components/admin/sanitize-rich-html';
import { YoutubeEmbed } from '@/components/education/youtube-embed';
import { GreenPatternOverlay } from '@/components/ui/green-pattern-overlay';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { orpc } from '@/lib/orpc/client';

const SEARCH_DEBOUNCE_MS = 300;
const EXCERPT_LENGTH = 110;

function excerptOf(content: string): string {
  const plain = stripHtmlTags(content);
  return plain.length > EXCERPT_LENGTH
    ? `${plain.slice(0, EXCERPT_LENGTH)}...`
    : plain;
}

interface EducationCatalogViewProps {
  user: SessionUser | null;
}

type EducationVideo = Awaited<
  ReturnType<typeof orpc.education.videos.list>
>['data'][number];

type EducationArticle = Awaited<
  ReturnType<typeof orpc.education.articles.list>
>['data'][number];

/**
 * Harmonized Quiz Hero Banner (Figma Node 3095-2295 with color override)
 * Replaces glaring yellow with Amwal's Deep Pine Green gradient + subtle warm gold XP pill.
 */
function QuizHeroBanner({
  user,
  featuredSlug,
}: {
  user: SessionUser | null;
  featuredSlug?: string;
}) {
  const { state } = useResource(() => orpc.gamification.summary({}), {
    enabled: Boolean(user),
  });

  const quizTarget = featuredSlug
    ? `/edukasi/${featuredSlug}`
    : '/edukasi/8-asnaf';

  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-r from-[#1d352d] via-[#244238] to-[#356152] p-6 text-white shadow-md sm:p-8">
      <GreenPatternOverlay size="lg" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-3">
          {/* Subtle amber XP reward badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/20 px-3.5 py-1 font-bold text-amber-300 text-xs shadow-xs">
            <Trophy aria-hidden="true" className="size-3.5 text-amber-300" />
            <span>
              {user
                ? `KUIS LITERASI BERKAH • +${ACTIVITY_POINTS.QUIZ} XP`
                : 'KUIS LITERASI BERKAH'}
            </span>
          </div>

          <h2 className="font-extrabold text-2xl text-white tracking-tight sm:text-3xl">
            {user ? 'Belajar & Kumpulkan Poin' : 'Belajar & Uji Pemahaman'}
          </h2>

          <p className="text-emerald-100/90 text-xs leading-relaxed sm:text-sm">
            Perdalam pemahaman fiqih muamalah, tata kelola wakaf produktif, dan
            perhitungan zakat.{' '}
            {user
              ? 'Selesaikan kuis interaktif mingguan untuk mengumpulkan XP Berkah.'
              : 'Baca artikel dan coba kuis interaktifnya; masuk untuk menyimpan pencapaian.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-bold text-[#1d352d] text-xs shadow-md transition-all hover:bg-gray-100 hover:shadow-lg active:scale-[0.98] sm:text-sm"
              to={quizTarget}
            >
              <span>Mulai Kuis</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>

            <Link
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 font-semibold text-white text-xs backdrop-blur-xs transition hover:bg-white/20 sm:text-sm"
              to="/edukasi/tanya-ai"
            >
              <Bot aria-hidden="true" className="size-4 text-emerald-300" />
              <span>Tanya AI Syariah</span>
            </Link>
          </div>
        </div>

        {/* User XP & Streak Scoreboard Pill */}
        {user && state.status === 'success' ? (
          <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-amber-300">
              <Sparkles aria-hidden="true" className="size-6" />
            </div>
            <div>
              <span className="block font-bold text-lg text-white">
                {state.data.saldo} XP
              </span>
              <span className="flex items-center gap-1 font-medium text-emerald-200 text-xs">
                <Flame aria-hidden="true" className="size-3.5 text-amber-400" />
                {state.data.streakHari} hari beruntun belajar
              </span>
            </div>
          </div>
        ) : (
          <div className="hidden shrink-0 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-emerald-100 text-xs backdrop-blur-sm lg:flex">
            <Sparkles aria-hidden="true" className="size-5 text-amber-300" />
            <span>Masuk untuk menyimpan poin &amp; riwayat belajar</span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Single Article Card Component (Responsive Grid)
 */
function ArticleCard({
  article,
  showXp,
}: {
  article: EducationArticle;
  showXp: boolean;
}) {
  return (
    <Link
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xs transition-all hover:border-[#356152]/30 hover:shadow-md"
      params={{ slug: article.slug }}
      to="/edukasi/$slug"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        {article.coverImageUrl ? (
          /** biome-ignore lint/performance/noImgElement: dynamic user cover */
          <img
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            src={article.coverImageUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#f2f6f4] text-[#356152]">
            <BookOpen aria-hidden="true" className="size-10 opacity-50" />
          </div>
        )}

        {/* Subtle XP Reward Pill */}
        {showXp && (
          <span className="absolute top-3 right-3 rounded-full border border-amber-300/40 bg-amber-400/90 px-2.5 py-0.5 font-bold text-[10px] text-amber-950 shadow-sm backdrop-blur-xs">
            +{ACTIVITY_POINTS.QUIZ} XP
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="rounded-md border border-[#e2ece8] bg-[#f2f6f4] px-2 py-0.5 font-bold text-[#356152] text-[10px] uppercase tracking-wider">
            {article.categoryName || 'Fiqih Muamalah'}
          </span>
          <span className="flex items-center gap-1 font-medium text-[11px] text-gray-400">
            <Clock aria-hidden="true" className="size-3" />5 mnt baca
          </span>
        </div>

        <h3 className="line-clamp-2 font-bold text-gray-900 text-sm leading-snug transition-colors group-hover:text-[#356152] sm:text-base">
          {article.title}
        </h3>

        <p className="mt-1.5 line-clamp-2 flex-1 text-gray-500 text-xs leading-relaxed">
          {excerptOf(article.content)}
        </p>

        <div className="mt-4 flex items-center justify-between border-gray-100 border-t pt-3 text-[11px]">
          <span className="truncate text-gray-400">{article.authorName}</span>
          {article.quizQuestionsCount > 0 && (
            <span className="font-semibold text-[#356152]">
              {article.quizQuestionsCount} Soal Kuis
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function VideoModal({
  video,
  onClose,
}: {
  video: EducationVideo;
  onClose: () => void;
}) {
  const youtubeId = parseYoutubeVideoId(video.videoUrl);

  const renderMedia = () => {
    if (youtubeId) {
      return (
        <YoutubeEmbed
          autoplay
          lazy={false}
          title={video.title}
          videoId={youtubeId}
        />
      );
    }
    return (
      <div
        className="flex aspect-video w-full flex-col items-center justify-center rounded-xl bg-slate-900 p-6 text-center text-white"
        role="alert"
      >
        <AlertTriangle
          aria-hidden="true"
          className="mb-2 size-8 text-amber-400"
        />
        <p className="font-semibold text-gray-200 text-xs leading-relaxed">
          Video ini tidak dapat diputar karena tautan YouTube-nya tidak valid.
        </p>
      </div>
    );
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
      <div className="zoom-in-95 w-full max-w-2xl animate-in space-y-3 rounded-3xl bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="line-clamp-1 font-bold text-gray-900 text-sm">
            {video.title}
          </h3>
          <button
            aria-label="Tutup video"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {renderMedia()}
        {video.description && (
          <p className="whitespace-pre-line text-slate-700 text-sm leading-relaxed">
            {video.description}
          </p>
        )}
      </div>
    </div>
  );
}

export function EducationCatalogView({ user }: EducationCatalogViewProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [selectedVideo, setSelectedVideo] = useState<EducationVideo | null>(
    null
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const categoriesState = useResource(() =>
    orpc.education.categories.list({ type: 'article' }).then((r) => r.data)
  );
  const articlesState = useResource(() =>
    orpc.education.articles.list({}).then((r) => r.data)
  );
  const videosState = useResource(() =>
    orpc.education.videos.list({}).then((r) => r.data)
  );

  const filteredArticles = useMemo(() => {
    if (articlesState.state.status !== 'success') {
      return [];
    }
    const query = debouncedQuery.trim().toLowerCase();
    return articlesState.state.data.filter((article) => {
      const matchCategory =
        !selectedCategoryId || article.categoryId === selectedCategoryId;
      const matchSearch =
        query.length === 0 ||
        article.title.toLowerCase().includes(query) ||
        (article.categoryName?.toLowerCase().includes(query) ?? false);
      return matchCategory && matchSearch;
    });
  }, [articlesState.state, debouncedQuery, selectedCategoryId]);

  // Hanya video dengan tautan YouTube yang valid yang tampil di katalog.
  const videos = (
    videosState.state.status === 'success' ? videosState.state.data : []
  ).filter((video) => parseYoutubeVideoId(video.videoUrl) !== null);
  const isLoading =
    articlesState.state.status === 'loading' ||
    categoriesState.state.status === 'loading';
  const hasError = articlesState.state.status === 'error';

  const featuredSlug = filteredArticles[0]?.slug;

  return (
    <div className="w-full min-w-0 flex-1 space-y-5">
      {/* Header Container */}
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight sm:text-3xl dark:text-white">
                Edukasi Wakaf
              </h1>
              <p className="text-gray-500 text-xs sm:text-sm dark:text-slate-400">
                Literasi Fiqih &amp; Manajemen Harta Syariah
              </p>
            </div>

            <Link
              className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-[#356152]/20 bg-[#f2f6f4] px-3.5 py-2 font-semibold text-[#356152] text-xs transition hover:bg-[#356152] hover:text-white dark:bg-emerald-950/40 dark:text-emerald-300"
              to="/edukasi/tanya-ai"
            >
              <Bot aria-hidden="true" className="size-4" />
              <span>Tanya AI Syariah</span>
            </Link>
          </div>

          {/* Search Input */}
          <div className="relative w-full">
            <input
              className="w-full rounded-2xl border border-gray-200 bg-[#f8fafc] py-3 pr-4 pl-11 text-gray-900 text-xs shadow-xs transition placeholder:text-gray-400 focus:border-[#356152] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#356152]/20 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari artikel fiqih, zakat maal, atau wakaf uang..."
              type="text"
              value={searchInput}
            />
            <Search
              aria-hidden="true"
              className="absolute top-3.5 left-4 size-4 text-gray-400"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button
              className={`shrink-0 cursor-pointer rounded-full px-4 py-2 font-semibold text-xs transition-colors ${
                selectedCategoryId === null
                  ? 'bg-[#356152] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
              onClick={() => setSelectedCategoryId(null)}
              type="button"
            >
              Semua
            </button>
            {categoriesState.state.status === 'success' &&
              categoriesState.state.data.map((category) => (
                <button
                  className={`shrink-0 cursor-pointer rounded-full px-4 py-2 font-semibold text-xs transition-colors ${
                    selectedCategoryId === category.id
                      ? 'bg-[#356152] text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  type="button"
                >
                  {category.name}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="w-full space-y-5">
        {/* Harmonized Quiz Hero Banner */}
        <QuizHeroBanner featuredSlug={featuredSlug} user={user} />

        {isLoading && (
          <div className="mt-8 space-y-6">
            <div className="h-44 animate-pulse rounded-3xl bg-gray-200" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="h-64 animate-pulse rounded-2xl bg-gray-200" />
              <div className="h-64 animate-pulse rounded-2xl bg-gray-200" />
              <div className="h-64 animate-pulse rounded-2xl bg-gray-200" />
            </div>
          </div>
        )}

        {hasError && (
          <div
            aria-live="polite"
            className="mt-8 flex flex-col items-center rounded-3xl border border-rose-200 bg-rose-50 px-5 py-12 text-center"
            role="alert"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mb-2 size-10 text-rose-500"
            />
            <p className="font-bold text-base text-gray-900">
              Konten edukasi tidak dapat dimuat
            </p>
            <p className="mt-1 text-gray-500 text-xs">
              Terjadi kendala jaringan saat menghubungi database.
            </p>
            <button
              className="mt-4 cursor-pointer rounded-xl bg-[#356152] px-5 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#2b4f43]"
              onClick={articlesState.reload}
              type="button"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!(isLoading || hasError) && (
          <>
            {/* Video Pembelajaran Section */}
            {videos.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-[#356152]/10 text-[#356152]">
                      <Video aria-hidden="true" className="size-4" />
                    </div>
                    <h2 className="font-bold text-gray-900 text-lg tracking-tight sm:text-xl">
                      Video Pembelajaran Syariah
                    </h2>
                  </div>
                </div>

                <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
                  {videos.map((video) => (
                    <button
                      className="group relative h-40 w-64 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-slate-900 p-0 text-left shadow-xs transition hover:shadow-md sm:w-auto"
                      key={video.id}
                      onClick={() => setSelectedVideo(video)}
                      type="button"
                    >
                      {/** biome-ignore lint/performance/noImgElement: dynamic video thumbnail */}
                      <img
                        alt={video.title}
                        className="h-full w-full object-cover opacity-80 transition-all duration-300 group-hover:scale-105 group-hover:opacity-90"
                        src={video.thumbnailUrl}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="flex size-11 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md ring-2 ring-black/10 transition-all group-hover:scale-110 group-hover:bg-white">
                          <Play
                            aria-hidden="true"
                            className="ml-0.5 size-5 fill-[#356152] text-[#356152]"
                          />
                        </div>
                      </div>
                      <span className="absolute top-2.5 left-2.5 rounded-md bg-black/60 px-2 py-0.5 font-bold text-[10px] text-white uppercase tracking-wide">
                        {video.sourceType === 'embed' ? 'YouTube' : 'Video'}
                      </span>
                      <div className="absolute right-3 bottom-2.5 left-3 z-10">
                        <span className="line-clamp-2 font-bold text-white text-xs drop-shadow-xs">
                          {video.title}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Articles Grid (Responsive Desktop & Mobile) */}
            <section className="mt-10">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-[#356152]/10 text-[#356152]">
                    <BookOpen aria-hidden="true" className="size-4" />
                  </div>
                  <h2 className="font-bold text-gray-900 text-lg tracking-tight sm:text-xl">
                    Modul &amp; Artikel Literasi
                  </h2>
                </div>
                <span className="text-gray-400 text-xs">
                  {filteredArticles.length} artikel tersedia
                </span>
              </div>

              {filteredArticles.length === 0 ? (
                <div className="rounded-3xl border border-gray-200 border-dashed bg-white p-12 text-center">
                  <BookOpen
                    aria-hidden="true"
                    className="mx-auto mb-3 size-10 text-gray-300"
                  />
                  <p className="font-bold text-base text-gray-800">
                    Tidak Ada Artikel yang Cocok
                  </p>
                  <p className="mt-1 text-gray-500 text-xs">
                    Coba ubah kata kunci pencarian atau pilih kategori lain.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredArticles.map((article) => (
                    <ArticleCard
                      article={article}
                      key={article.id}
                      showXp={Boolean(user)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {selectedVideo && (
        <VideoModal
          onClose={() => setSelectedVideo(null)}
          video={selectedVideo}
        />
      )}
    </div>
  );
}
