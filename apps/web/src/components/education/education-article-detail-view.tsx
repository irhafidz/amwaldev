'use client';

import { ACTIVITY_POINTS } from '@amwal/core/gamification/points';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Bot,
  CircleHelp,
  Clock,
  Heart,
  LoaderCircle,
  MessageSquare,
  PenLine,
  RotateCcw,
  Share2,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { sanitizeRichHtml } from '@/components/admin/sanitize-rich-html';
import { useToast } from '@/components/ui/toast';
import { useResource } from '@/lib/amwal-api/use-resource';
import type { SessionUser } from '@/lib/auth/types';
import { orpc } from '@/lib/orpc/client';
import { QuizLoginBanner } from './quiz-login-banner';

export type ArticleData = Awaited<
  ReturnType<typeof orpc.education.articles.bySlug>
>['data'];

export type CommentItem = Awaited<
  ReturnType<typeof orpc.education.comments.list>
>['data'][number];

type QuizQuestion = Awaited<
  ReturnType<typeof orpc.education.quiz.list>
>['data'][number];

type QuizCheckResult = Awaited<
  ReturnType<typeof orpc.education.quiz.check>
>['data'];

export interface EducationArticleDetailViewProps {
  slug: string;
  user: SessionUser | null;
  initialTab?: 'materi' | 'kuis';
  fetchArticle?: (slug: string) => Promise<ArticleData>;
  fetchQuiz?: (articleId: string) => Promise<QuizQuestion[]>;
  fetchComments?: (articleId: string) => Promise<CommentItem[]>;
  onQuizCheck?: (input: {
    articleId: string;
    answers: Array<{ questionId: string; key: string }>;
  }) => Promise<{ data: QuizCheckResult }>;
  onClaimReadingXp?: (input: { articleId: string }) => Promise<{
    data: { success: boolean; xpAwarded: number; isNewReward: boolean };
  }>;
  onCreateComment?: (input: {
    articleId: string;
    comment: string;
  }) => Promise<unknown>;
  onNavigateLogin?: () => void;
  readingTimerMs?: number;
}

function optionClassFor(
  isSelected: boolean,
  isCorrectOption: boolean | undefined,
  questionResult: QuizCheckResult['results'][number] | undefined
): string {
  if (!questionResult) {
    return isSelected
      ? 'border-[#356152] bg-[#f2f6f4] ring-1 ring-[#356152] text-gray-900'
      : 'border-gray-200 bg-white hover:border-[#356152]/40 text-gray-700';
  }
  if (isCorrectOption) {
    return 'border-emerald-500 bg-emerald-50 text-emerald-950 font-medium ring-1 ring-emerald-500';
  }
  if (isSelected && !questionResult.isCorrect) {
    return 'border-rose-400 bg-rose-50 text-rose-950 font-medium ring-1 ring-rose-400';
  }
  return 'border-gray-200 bg-white text-gray-500 opacity-60';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Interactive Quiz Panel (Module 3 - DSK Kuis Interaktif)
 */
function QuizPanel({
  articleId,
  articleTitle,
  questions,
  onChecked,
  onQuizCheck,
  isGuest,
}: {
  articleId: string;
  articleTitle: string;
  /** Tamu boleh bermain; XP disembunyikan dan diganti ajakan masuk (QA-08). */
  isGuest: boolean;
  questions: QuizQuestion[];
  onChecked?: (result: QuizCheckResult) => void;
  onQuizCheck?: (input: {
    articleId: string;
    answers: Array<{ questionId: string; key: string }>;
  }) => Promise<{ data: QuizCheckResult }>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => answers[q.id]);
  const resultByQuestion = new Map(
    (result?.results ?? []).map((r) => [r.questionId, r])
  );

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const checkFn = onQuizCheck ?? orpc.education.quiz.check;
      const { data } = await checkFn({
        articleId,
        answers: Object.entries(answers).map(([questionId, key]) => ({
          questionId,
          key,
        })),
      });
      setResult(data);
      onChecked?.(data);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : 'Gagal memeriksa jawaban kuis.'
      );
    } finally {
      setChecking(false);
    }
  };

  const handleResetQuiz = () => {
    setAnswers({});
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#e2ece8] bg-[#f2f6f4] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#356152] px-3 py-1 font-extrabold text-[11px] text-white uppercase tracking-wider">
            Workplace Kuis
          </span>
          {!isGuest && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-1 font-bold text-[11px] text-amber-800 uppercase tracking-wider">
              <Trophy aria-hidden="true" className="size-3 text-amber-600" />
              +100 XP Berkah
            </span>
          )}
        </div>

        <p className="mt-3 font-semibold text-gray-500 text-xs">
          Topik: {articleTitle}
        </p>

        <h2 className="mt-1 font-extrabold text-gray-900 text-lg uppercase tracking-tight sm:text-xl">
          Uji Pemahaman Syariah Anda
        </h2>

        <p className="mt-1 text-gray-600 text-xs sm:text-sm">
          Pilih jawaban yang paling tepat. Anda membutuhkan minimal skor 70%
          untuk lulus
          {isGuest
            ? '.'
            : ' dan mengklaim reward +100 XP Berkah ke profil Anda.'}
        </p>
      </div>

      {result && (
        <div
          className={`rounded-3xl border p-6 text-center shadow-xs transition-all ${
            result.score >= 70
              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
              : 'border-amber-200 bg-amber-50/90 text-amber-950'
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="font-extrabold text-4xl text-[#356152] sm:text-5xl">
              {result.score}%
            </span>
          </div>

          <h3 className="mt-2 font-bold text-base sm:text-lg">
            {result.score >= 70
              ? 'Alhamdulillah, Anda Lulus Kuis!'
              : 'Belum Mencapai Nilai Kelulusan (70%)'}
          </h3>

          <p className="mt-1 text-xs sm:text-sm">
            {result.correctCount} dari {result.totalQuestions} pertanyaan
            dijawab dengan tepat.
          </p>

          {!isGuest && result.isNewReward && result.xpAwarded > 0 && (
            <div className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-1.5 font-bold text-[#356152] text-xs shadow-xs">
              <Sparkles aria-hidden="true" className="size-4 text-amber-500" />
              <span>
                Selamat! +100 XP Berkah berhasil ditambahkan ke akun Anda.
              </span>
            </div>
          )}

          {isGuest && result.score >= 70 && <QuizLoginBanner />}

          <div className="mt-5 flex justify-center">
            <button
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#356152] px-5 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#2b4f43]"
              onClick={handleResetQuiz}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              <span>Ulangi Kuis</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-xs">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {questions.map((question, index) => {
          const questionResult = resultByQuestion.get(question.id);
          return (
            <div
              className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6"
              key={question.id}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#f2f6f4] font-bold text-[#356152] text-xs">
                  {index + 1}
                </span>
                <p className="pt-0.5 font-bold text-gray-900 text-sm leading-snug sm:text-base">
                  {question.question}
                </p>
              </div>

              <div className="mt-4 space-y-2.5 pl-0 sm:pl-10">
                {question.options.map((option) => {
                  const isSelected = answers[question.id] === option.key;
                  const isCorrectOption =
                    questionResult && option.key === questionResult.correctKey;
                  const optionClass = optionClassFor(
                    isSelected,
                    isCorrectOption,
                    questionResult
                  );

                  return (
                    <button
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left text-xs transition-all sm:text-sm ${optionClass}`}
                      data-testid={`option-${option.key}`}
                      disabled={Boolean(result)}
                      key={option.key}
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [question.id]: option.key,
                        }))
                      }
                      type="button"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current font-bold text-xs">
                        {option.key}
                      </span>
                      <span className="flex-1">{option.text}</span>
                    </button>
                  );
                })}
              </div>

              {questionResult && (
                <div
                  className={`mt-4 rounded-2xl p-4 text-xs leading-relaxed sm:ml-10 ${
                    questionResult.isCorrect
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border border-rose-200 bg-rose-50 text-rose-900'
                  }`}
                >
                  <p className="font-bold">
                    {questionResult.isCorrect
                      ? '✓ Jawaban Tepat'
                      : '✗ Jawaban Belum Tepat'}
                  </p>
                  {questionResult.explanation && (
                    <p className="mt-1 text-gray-600">
                      Penjelasan: {questionResult.explanation}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!result && (
        <button
          className="w-full cursor-pointer rounded-2xl bg-[#356152] py-4 font-bold text-sm text-white shadow-[#356152]/20 shadow-md transition-all hover:bg-[#2b4f43] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-gray-300"
          disabled={!allAnswered || checking}
          onClick={handleCheck}
          type="button"
        >
          {checking ? 'Memeriksa Jawaban...' : 'Periksa Jawaban Kuis'}
        </button>
      )}
    </div>
  );
}

/**
 * Mobile Comment Drawer Modal
 */
function CommentDrawerModal({
  isOpen,
  onClose,
  onSubmit,
  posting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => Promise<void>;
  posting: boolean;
}) {
  const [commentText, setCommentText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (commentText.trim().length < 3) {
      setValidationError('Komentar minimal 3 karakter.');
      return;
    }
    setValidationError(null);
    await onSubmit(commentText.trim());
    setCommentText('');
  };

  return (
    <div
      aria-labelledby="comment-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-gray-100 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6 sm:pb-6">
        <div className="flex items-center justify-between border-gray-100 border-b pb-3">
          <div>
            <h2
              className="font-bold text-base text-gray-900"
              id="comment-modal-title"
            >
              Tulis Komentar
            </h2>
            <p className="text-gray-500 text-xs">
              Sampaikan pendapat atau pertanyaan mengenai artikel ini
            </p>
          </div>
          <button
            aria-label="Tutup modal komentar"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="sr-only" htmlFor="comment-textarea">
              Isi komentar
            </label>
            <textarea
              autoFocus
              className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-gray-50/50 p-3.5 text-gray-900 text-xs placeholder:text-gray-400 focus:border-[#356152] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#356152]/20 sm:text-sm"
              id="comment-textarea"
              maxLength={2000}
              onChange={(e) => {
                setCommentText(e.target.value);
                if (validationError && e.target.value.trim().length >= 3) {
                  setValidationError(null);
                }
              }}
              placeholder="Tulis komentar atau tanggapanmu di sini (minimal 3 karakter)..."
              rows={4}
              value={commentText}
            />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              {validationError ? (
                <span className="font-medium text-rose-600">
                  {validationError}
                </span>
              ) : (
                <span className="text-gray-400">Minimal 3 karakter</span>
              )}
              <span className="text-gray-400">{commentText.length}/2000</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2.5 font-semibold text-gray-600 text-xs hover:bg-gray-50"
              disabled={posting}
              onClick={onClose}
              type="button"
            >
              Batal
            </button>
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#356152] px-5 py-2.5 font-bold text-white text-xs shadow-sm hover:bg-[#2b4f43] disabled:cursor-not-allowed disabled:bg-gray-300"
              disabled={posting || commentText.trim().length < 3}
              type="submit"
            >
              {posting ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 animate-spin"
                  />
                  <span>Mengirim...</span>
                </>
              ) : (
                'Kirim Komentar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Discussion & Comments Section
 */
function CommentsSection({
  comments,
  onOpenComment,
}: {
  comments: CommentItem[];
  user?: SessionUser | null;
  onOpenComment: () => void;
  onCreateCommentDirect?: (text: string) => Promise<void>;
  posting?: boolean;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-extrabold text-base text-gray-900 tracking-tight sm:text-lg">
          Diskusi &amp; Komentar
        </h2>
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#356152] px-3.5 py-1.5 font-bold text-[#356152] text-xs transition hover:bg-[#f2f6f4]"
          onClick={onOpenComment}
          type="button"
        >
          <PenLine aria-hidden="true" className="size-3.5" />
          <span>Tulis Komentar</span>
        </button>
      </div>

      <div className="space-y-3 pt-2">
        {comments.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6 text-center">
            <MessageSquare
              aria-hidden="true"
              className="mx-auto mb-2 size-6 text-gray-300"
            />
            <p className="font-medium text-gray-500 text-xs">
              Belum ada komentar.
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Jadilah yang pertama menyampaikan pendapat atau pertanyaan.
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              className="rounded-2xl border border-gray-100 bg-slate-50/50 p-4 transition-colors hover:bg-slate-50"
              key={comment.id}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-full bg-[#f2f6f4] font-bold text-[#356152] text-xs">
                    {comment.authorName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="font-bold text-gray-900 text-xs">
                    {comment.authorName}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  {formatDate(comment.createdAt)}
                </span>
              </div>
              <p className="mt-2 text-gray-700 text-xs leading-relaxed sm:text-sm">
                {comment.comment}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Desktop Right Sidebar Component (DSK Detail Artikel)
 */
function DesktopSidebar({
  quizQuestionsCount,
  onStartQuiz,
  relatedArticles,
  showXp,
}: {
  quizQuestionsCount: number;
  onStartQuiz: () => void;
  relatedArticles: ArticleData[];
  showXp: boolean;
}) {
  return (
    <aside className="space-y-6">
      {quizQuestionsCount > 0 && (
        <div className="relative overflow-hidden rounded-3xl border border-[#2b4f43] bg-gradient-to-br from-[#1d352d] via-[#244238] to-[#356152] p-6 text-white shadow-md">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-300 text-xs">
            <Trophy aria-hidden="true" className="size-3.5 text-amber-300" />
            <span>
              {showXp ? 'UJI PEMAHAMAN? • +100 XP' : 'UJI PEMAHAMAN?'}
            </span>
          </div>

          <h3 className="mt-3 font-extrabold text-lg text-white tracking-tight">
            Kuis Pemahaman Syariah
          </h3>

          <p className="mt-1.5 text-emerald-100/90 text-xs leading-relaxed">
            Selesaikan kuis singkat seputar artikel ini untuk menguji pemahaman
            {showXp ? ' dan raih +100 XP Berkah langsung ke profil Anda.' : '.'}
          </p>

          <button
            className="mt-5 w-full cursor-pointer rounded-xl bg-white py-3 font-bold text-[#1d352d] text-xs shadow-md transition-all hover:bg-gray-100 hover:shadow-lg active:scale-[0.98]"
            onClick={onStartQuiz}
            type="button"
          >
            Mulai Kuis Sekarang
          </button>
        </div>
      )}

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#356152] text-white">
            <Bot aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm">
              Tanya AI Syariah
            </h4>
            <p className="text-gray-400 text-xs">Konsultasi Fiqih Otomatis</p>
          </div>
        </div>
        <p className="mt-3 text-gray-600 text-xs leading-relaxed">
          Punya pertanyaan seputar hukum muamalah dalam artikel ini? Tanyakan
          langsung kepada Asisten AI Amwal.
        </p>
        <a
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#356152] py-2.5 font-bold text-[#356152] text-xs transition hover:bg-[#f2f6f4]"
          href="/edukasi/tanya-ai"
        >
          <span>Buka Tanya AI</span>
        </a>
      </div>

      {relatedArticles.length > 0 && (
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs">
          <h4 className="mb-4 font-bold text-gray-900 text-sm">
            Artikel Terkait
          </h4>
          <div className="space-y-3.5">
            {relatedArticles.slice(0, 3).map((item) => (
              <a
                className="group flex items-center gap-3"
                href={`/edukasi/${item.slug}`}
                key={item.id}
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {item.coverImageUrl ? (
                    /** biome-ignore lint/performance/noImgElement: dynamic user cover */
                    <img
                      alt={item.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      src={item.coverImageUrl}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#f2f6f4] text-[#356152]">
                      <BookOpen
                        aria-hidden="true"
                        className="size-5 opacity-40"
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h5 className="line-clamp-2 font-bold text-gray-800 text-xs leading-snug group-hover:text-[#356152]">
                    {item.title}
                  </h5>
                  <span className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                    <Clock aria-hidden="true" className="size-2.5" />5 mnt baca
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * Top Breadcrumbs and Share Action
 */
function ArticleBreadcrumbs({
  title,
  onShare,
}: {
  title: string;
  onShare: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <a
        className="inline-flex items-center gap-1.5 font-semibold text-[#356152] text-xs hover:underline"
        href="/edukasi"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span>Kembali ke Edukasi</span>
      </a>

      <button
        aria-label="Bagikan artikel"
        className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200"
        onClick={onShare}
        title={`Bagikan: ${title}`}
        type="button"
      >
        <Share2 aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Mobile Navigation Tabs
 */
function MobileTabs({
  activeTab,
  onSelectTab,
  quizCount,
}: {
  activeTab: 'materi' | 'kuis';
  onSelectTab: (tab: 'materi' | 'kuis') => void;
  quizCount: number;
}) {
  return (
    <div className="-mx-5 sticky top-0 z-20 flex border-gray-100 border-b bg-white/95 px-5 backdrop-blur-md lg:hidden">
      <button
        className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 font-bold text-xs transition-colors ${
          activeTab === 'materi'
            ? 'border-[#356152] text-[#356152]'
            : 'border-transparent text-gray-400'
        }`}
        onClick={() => onSelectTab('materi')}
        type="button"
      >
        <BookOpen aria-hidden="true" className="size-3.5" />
        <span>Materi &amp; Diskusi</span>
      </button>
      <button
        className={`relative flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 font-bold text-xs transition-colors ${
          activeTab === 'kuis'
            ? 'border-[#356152] text-[#356152]'
            : 'border-transparent text-gray-400'
        }`}
        onClick={() => onSelectTab('kuis')}
        type="button"
      >
        <CircleHelp aria-hidden="true" className="size-3.5" />
        <span>Kuis Interaktif</span>
        {quizCount > 0 && (
          <span className="ml-1 rounded-full bg-[#356152] px-1.5 py-0.2 font-bold text-[9px] text-white">
            {quizCount}
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * Mobile Sticky Action Bar
 */
function MobileStickyBar({
  isLiked,
  likesCount,
  onLike,
  onOpenComment,
}: {
  isLiked: boolean;
  likesCount: number;
  onLike: () => void;
  onOpenComment: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-gray-200 border-t bg-white/95 px-5 py-3 backdrop-blur-md sm:px-6 lg:hidden">
      <button
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-semibold text-xs transition ${
          isLiked
            ? 'border-rose-200 bg-rose-50 text-rose-600'
            : 'border-gray-200 bg-white text-gray-600'
        }`}
        onClick={onLike}
        type="button"
      >
        <Heart
          aria-hidden="true"
          className={`size-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`}
        />
        <span>{likesCount}</span>
      </button>

      <button
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-6 py-2.5 font-bold text-white text-xs shadow-md transition hover:bg-[#2b4f43]"
        onClick={onOpenComment}
        type="button"
      >
        <MessageSquare aria-hidden="true" className="size-4" />
        <span>Tulis Komentar</span>
      </button>
    </div>
  );
}

/**
 * Penanda tepat di akhir isi artikel: XP baca (+50) diberikan di sini, setelah
 * pembaca sampai di akhir artikel DAN membaca minimal 30 detik. Tanpa penanda
 * ini, pembaca cepat yang langsung lanjut ke kuis menerima XP baca saat sudah
 * berada di kuis, sehingga terkesan XP berasal dari kuis (QA-07).
 */
function ReadingXpStatus({
  claimed,
  reachedEnd,
  timeElapsed,
}: {
  claimed: boolean;
  reachedEnd: boolean;
  timeElapsed: boolean;
}) {
  if (claimed) {
    return (
      <p
        className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 font-semibold text-emerald-800 text-xs"
        data-testid="reading-xp-status"
      >
        <Sparkles aria-hidden="true" className="size-4" />+
        {ACTIVITY_POINTS.READ} XP Berkah membaca artikel ini sudah tercatat.
      </p>
    );
  }
  if (reachedEnd && !timeElapsed) {
    return (
      <p
        className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 font-semibold text-amber-800 text-xs"
        data-testid="reading-xp-status"
      >
        <Sparkles aria-hidden="true" className="size-4" />
        Hampir selesai! +{ACTIVITY_POINTS.READ} XP Berkah diberikan setelah
        membaca minimal 30 detik.
      </p>
    );
  }
  return null;
}

export function EducationArticleDetailView({
  slug,
  user,
  initialTab = 'materi',
  fetchArticle,
  fetchQuiz,
  fetchComments,
  onQuizCheck,
  onClaimReadingXp,
  onCreateComment,
  onNavigateLogin,
  readingTimerMs = 30_000,
}: EducationArticleDetailViewProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'materi' | 'kuis'>(initialTab);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);

  const articleState = useResource(
    () =>
      fetchArticle
        ? fetchArticle(slug)
        : orpc.education.articles.bySlug({ slug }).then((r) => r.data),
    { enabled: Boolean(slug) }
  );

  const articleId =
    articleState.state.status === 'success' ? articleState.state.data.id : null;

  const quizState = useResource(
    () =>
      fetchQuiz
        ? fetchQuiz(articleId ?? '')
        : orpc.education.quiz
            .list({ articleId: articleId ?? '' })
            .then((r) => r.data),
    { enabled: Boolean(articleId) }
  );

  const commentsState = useResource(
    () =>
      fetchComments
        ? fetchComments(articleId ?? '')
        : orpc.education.comments
            .list({ articleId: articleId ?? '' })
            .then((r) => r.data),
    { enabled: Boolean(articleId) }
  );

  const relatedArticlesState = useResource(
    () =>
      orpc.education.articles
        .list({})
        .then((r) => r.data.filter((a) => a.slug !== slug)),
    { enabled: Boolean(slug) }
  );

  useEffect(() => {
    if (articleState.state.status === 'success') {
      setLikesCount(articleState.state.data.likesCount);
    }
  }, [articleState.state]);

  // Status "sudah menyukai" milik pengguna login (tamu: abaikan 401).
  useEffect(() => {
    if (!(user && articleId)) {
      return;
    }
    orpc.education.likes
      .mine({ contentType: 'article' })
      .then((r) => setIsLiked(r.data.includes(articleId)))
      .catch(() => {
        // Gagal memuat status suka tidak boleh mengganggu pembacaan artikel.
      });
  }, [user, articleId]);

  // Reading Tracker
  const [timeElapsed, setTimeElapsed] = useState(false);
  const [isSentinelVisible, setIsSentinelVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasClaimedReadingXpRef = useRef(false);
  const [readingXpClaimed, setReadingXpClaimed] = useState(false);

  useEffect(() => {
    if (activeTab !== 'materi' || !articleId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setTimeElapsed(true);
    }, readingTimerMs);

    return () => window.clearTimeout(timer);
  }, [activeTab, articleId, readingTimerMs]);

  useEffect(() => {
    if (activeTab !== 'materi' || !articleId || isSentinelVisible) {
      return;
    }

    const sentinelEl = sentinelRef.current;
    if (!sentinelEl) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setIsSentinelVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsSentinelVisible(true);
            break;
          }
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [activeTab, articleId, isSentinelVisible]);

  useEffect(() => {
    if (
      !(user && articleId && timeElapsed && isSentinelVisible) ||
      hasClaimedReadingXpRef.current
    ) {
      return;
    }

    hasClaimedReadingXpRef.current = true;
    const claimFn = onClaimReadingXp ?? orpc.education.articles.claimReadingXp;
    claimFn({ articleId })
      .then((res) => {
        setReadingXpClaimed(true);
        if (res.data.isNewReward && res.data.xpAwarded > 0) {
          showToast({
            title: 'Selamat!',
            description: `Kamu mendapatkan +${res.data.xpAwarded} XP Berkah karena tuntas membaca artikel`,
            type: 'success',
          });
          queryClient.invalidateQueries({ queryKey: ['gamification'] });
          queryClient.invalidateQueries({ queryKey: ['points'] });
          queryClient.invalidateQueries({ queryKey: ['user'] });
        }
      })
      .catch(() => {
        // Silently handled
      });
  }, [
    user,
    articleId,
    timeElapsed,
    isSentinelVisible,
    showToast,
    queryClient,
    onClaimReadingXp,
  ]);

  const handleLike = async () => {
    if (!user) {
      showToast({
        title: 'Masuk untuk Menyukai',
        description: 'Silakan masuk ke akun Anda untuk menyukai artikel ini.',
        type: 'info',
      });
      return;
    }
    try {
      const { data } = await orpc.education.likes.toggle({
        contentType: 'article',
        contentId: articleId ?? '',
      });
      setIsLiked(data.liked);
      setLikesCount(data.likesCount);
    } catch {
      showToast({
        title: 'Gagal Menyimpan Suka',
        description: 'Silakan coba lagi.',
        type: 'error',
      });
    }
  };

  const handleQuizChecked = (quizResult: QuizCheckResult) => {
    if (!user) {
      // Tamu: skor saja; XP tidak pernah disebut (QA-08, D5). Ajakan masuk ada
      // di panel hasil.
      showToast({
        title: 'Kuis Selesai',
        description:
          quizResult.score >= 70
            ? `Skor kamu: ${quizResult.score}%.`
            : `Skor kamu: ${quizResult.score}%. Butuh minimal 70% untuk lulus.`,
        type: quizResult.score >= 70 ? 'info' : 'warning',
      });
      return;
    }
    if (quizResult.isNewReward && quizResult.xpAwarded > 0) {
      showToast({
        title: 'Alhamdulillah!',
        description:
          '🎉 Selamat! +100 XP Berkah berhasil ditambahkan ke akunmu!',
        type: 'success',
      });
    } else if (quizResult.score >= 70) {
      showToast({
        title: 'Kuis Selesai',
        description: `Skor kamu: ${quizResult.score}%. (XP kuis sudah pernah kamu klaim sebelumnya)`,
        type: 'info',
      });
    } else {
      showToast({
        title: 'Kuis Selesai',
        description: `Skor kamu: ${quizResult.score}%. Butuh minimal 70% untuk lulus.`,
        type: 'warning',
      });
    }

    queryClient.invalidateQueries({ queryKey: ['gamification'] });
    queryClient.invalidateQueries({ queryKey: ['points'] });
    queryClient.invalidateQueries({ queryKey: ['user'] });
  };

  const handleOpenComment = () => {
    if (!user) {
      showToast({
        title: 'Perhatian',
        description: 'Silakan masuk terlebih dahulu untuk ikut berdiskusi',
        type: 'warning',
      });
      if (onNavigateLogin) {
        onNavigateLogin();
      } else if (typeof window !== 'undefined') {
        window.location.assign('/auth/login');
      }
      return;
    }
    setIsCommentModalOpen(true);
  };

  const handleCreateComment = async (commentText: string) => {
    if (!articleId) {
      return;
    }
    setPostingComment(true);
    try {
      const createFn = onCreateComment ?? orpc.education.comments.create;
      await createFn({
        articleId,
        comment: commentText,
      });
      setIsCommentModalOpen(false);
      showToast({
        title: 'Berhasil!',
        description: 'Komentar berhasil dikirim',
        type: 'success',
      });
      commentsState.reload();
    } catch (err) {
      showToast({
        title: 'Gagal Mengirim Komentar',
        description:
          err instanceof Error ? err.message : 'Terjadi kesalahan sistem.',
        type: 'error',
      });
    } finally {
      setPostingComment(false);
    }
  };

  const handleShare = () => {
    if (articleState.state.status !== 'success') {
      return;
    }
    const currentTitle = articleState.state.data.title;
    if (navigator.share) {
      navigator.share({
        title: currentTitle,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast({
        title: 'Tautan Tersalin',
        description: 'Tautan artikel disalin ke clipboard',
        type: 'info',
      });
    }
  };

  if (articleState.state.status === 'loading') {
    return (
      <div className="space-y-4 py-8">
        <div className="h-48 animate-pulse rounded-3xl bg-gray-200" />
        <div className="h-8 w-2/3 animate-pulse rounded-xl bg-gray-200" />
        <div className="h-32 animate-pulse rounded-3xl bg-gray-200" />
      </div>
    );
  }

  if (articleState.state.status === 'error') {
    return (
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
          Artikel tidak ditemukan
        </p>
        <a
          className="mt-4 font-bold text-[#356152] text-xs underline"
          href="/edukasi"
        >
          Kembali ke Katalog Edukasi
        </a>
      </div>
    );
  }

  const article = articleState.state.data;
  const quizQuestions =
    quizState.state.status === 'success' ? quizState.state.data : [];
  const comments =
    commentsState.state.status === 'success' ? commentsState.state.data : [];
  const relatedArticles =
    relatedArticlesState.state.status === 'success'
      ? relatedArticlesState.state.data
      : [];

  const quizTabContent =
    quizQuestions.length === 0 ? (
      <div className="rounded-3xl border border-gray-200 border-dashed bg-white p-12 text-center">
        <CircleHelp
          aria-hidden="true"
          className="mx-auto mb-2 size-10 text-gray-300"
        />
        <p className="font-bold text-base text-gray-800">Belum Ada Kuis</p>
        <p className="mt-1 text-gray-500 text-xs">
          Artikel ini belum memiliki soal kuis pemahaman syariah.
        </p>
      </div>
    ) : (
      <QuizPanel
        articleId={article.id}
        articleTitle={article.title}
        isGuest={!user}
        onChecked={handleQuizChecked}
        onQuizCheck={onQuizCheck}
        questions={quizQuestions}
      />
    );

  return (
    <div className="w-full min-w-0 flex-1 space-y-5">
      <ArticleBreadcrumbs onShare={handleShare} title={article.title} />

      <MobileTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        quizCount={quizQuestions.length}
      />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {activeTab === 'materi' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <span className="inline-block rounded-md border border-[#e2ece8] bg-[#f2f6f4] px-2.5 py-0.5 font-bold text-[#356152] text-[11px] uppercase tracking-wider">
                  {article.categoryName || 'Fiqih Muamalah'}
                </span>

                <h1 className="font-extrabold text-2xl text-gray-900 leading-tight tracking-tight sm:text-3xl">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center justify-between gap-3 border-gray-100 border-y py-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-full bg-[#356152] font-bold text-white shadow-xs">
                      {article.authorName.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 leading-none">
                        {article.authorName}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {formatDate(article.createdAt)} · 5 mnt baca
                      </p>
                    </div>
                  </div>

                  <button
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 font-semibold text-xs transition ${
                      isLiked
                        ? 'border-rose-200 bg-rose-50 text-rose-600'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                    onClick={handleLike}
                    type="button"
                  >
                    <Heart
                      aria-hidden="true"
                      className={`size-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`}
                    />
                    <span>{likesCount} Suka</span>
                  </button>
                </div>
              </div>

              {article.coverImageUrl && (
                <div className="aspect-video w-full overflow-hidden rounded-3xl bg-slate-100 shadow-sm">
                  {/** biome-ignore lint/performance/noImgElement: dynamic user cover */}
                  <img
                    alt={article.title}
                    className="h-full w-full object-cover"
                    src={article.coverImageUrl}
                  />
                </div>
              )}

              <div
                className="google-docs-content max-w-none text-gray-700 text-sm leading-relaxed sm:text-base"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via sanitizeRichHtml()
                dangerouslySetInnerHTML={{
                  __html: sanitizeRichHtml(article.content),
                }}
              />

              <div
                className="h-1 w-full"
                id="article-read-sentinel"
                ref={sentinelRef}
              />

              {user && (
                <ReadingXpStatus
                  claimed={readingXpClaimed}
                  reachedEnd={isSentinelVisible}
                  timeElapsed={timeElapsed}
                />
              )}

              <div className="rounded-3xl border border-emerald-100 bg-[#f2f6f4] p-5 sm:p-6">
                <p className="flex items-center gap-2 font-bold text-[#356152] text-sm">
                  <Sparkles aria-hidden="true" className="size-4" />
                  <span>Intisari Syariah &amp; Amanah Wakif</span>
                </p>
                <p className="mt-2 text-gray-700 text-xs leading-relaxed sm:text-sm">
                  Setiap dana donasi dan wakaf yang dipercayakan kepada Amwal
                  dikelola dengan prinsip syariah yang ketat, menjaga pokok dana
                  abadi, dan diaudit berkala oleh Dewan Pengawas Syariah demi
                  menjaga kemurnian akad.
                </p>
              </div>

              <CommentsSection
                comments={comments}
                onCreateCommentDirect={handleCreateComment}
                onOpenComment={handleOpenComment}
                posting={postingComment}
                user={user}
              />
            </div>
          ) : (
            quizTabContent
          )}
        </div>

        <div className="hidden lg:col-span-4 lg:block">
          <DesktopSidebar
            onStartQuiz={() => setActiveTab('kuis')}
            quizQuestionsCount={quizQuestions.length}
            relatedArticles={relatedArticles}
            showXp={Boolean(user)}
          />
        </div>
      </div>

      <MobileStickyBar
        isLiked={isLiked}
        likesCount={likesCount}
        onLike={handleLike}
        onOpenComment={handleOpenComment}
      />

      <CommentDrawerModal
        isOpen={isCommentModalOpen}
        onClose={() => setIsCommentModalOpen(false)}
        onSubmit={handleCreateComment}
        posting={postingComment}
      />
    </div>
  );
}
