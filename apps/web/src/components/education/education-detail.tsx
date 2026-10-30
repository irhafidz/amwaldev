'use client';

import { ASNAF_QUIZ_ID } from '@amwal/core/education/asnaf-quiz';
import { ACTIVITY_POINTS } from '@amwal/core/gamification/points';
import { BookOpen, CheckCircle2, MessageCircle, Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SessionUser } from '@/lib/auth/types';
import { orpc } from '@/lib/orpc/client';
import { cn } from '@/lib/utils';
import { QuizLoginBanner } from './quiz-login-banner';

type EducationTab = 'materi' | 'kuis';

interface AsnafItem {
  emoji: string;
  name: string;
  short: string;
}

interface ArticlePoint {
  body: string;
  number: number;
  title: string;
}

interface QuizOption {
  label: string;
  value: string;
}

interface QuizQuestion {
  correctValue: string;
  id: string;
  options: QuizOption[];
  question: string;
}

const ASNAF_ITEMS: AsnafItem[] = [
  {
    emoji: '🤲',
    name: 'Fakir',
    short: 'Tidak punya harta & penghasilan cukup',
  },
  { emoji: '💛', name: 'Miskin', short: 'Punya sedikit, belum mencukupi' },
  { emoji: '📋', name: 'Amil', short: 'Pengelola dan penyalur zakat' },
  { emoji: '🕊️', name: 'Muallaf', short: 'Yang baru masuk Islam' },
  { emoji: '🔓', name: 'Riqab', short: 'Memerdekakan hamba sahaya' },
  { emoji: '📉', name: 'Gharim', short: 'Terjerat utang untuk kebutuhan' },
  { emoji: '🛡️', name: 'Fisabilillah', short: 'Berjuang di jalan Allah' },
  { emoji: '🧭', name: 'Ibnu Sabil', short: 'Musafir yang kehabisan bekal' },
];

const ARTICLE_POINTS: ArticlePoint[] = [
  {
    number: 1,
    title: 'Fakir',
    body: 'Orang yang tidak memiliki harta dan penghasilan yang cukup untuk memenuhi kebutuhan pokok diri dan keluarganya. Mereka adalah golongan pertama yang disebut dalam ayat zakat.',
  },
  {
    number: 2,
    title: 'Miskin',
    body: 'Orang yang memiliki harta atau penghasilan, tetapi belum mencukupi kebutuhan pokoknya. Kekurangannya tidak seberat fakir, namun tetap memerlukan bantuan.',
  },
  {
    number: 3,
    title: 'Amil',
    body: 'Orang yang ditugaskan mengelola zakat: mencatat, mengumpulkan, menjaga, dan menyalurkannya kepada yang berhak. Mereka berhak menerima bagian dari zakat.',
  },
  {
    number: 4,
    title: 'Muallaf',
    body: 'Orang yang baru masuk Islam atau yang hatinya perlu dikuatkan dalam iman. Zakat dapat menjadi sarana menguatkan dan mendekatkan hati mereka.',
  },
  {
    number: 5,
    title: 'Riqab',
    body: 'Golongan yang terikat perbudakan atau memerlukan bantuan untuk memerdekakan diri. Zakat dapat digunakan untuk membebaskan mereka dari keterikatan.',
  },
  {
    number: 6,
    title: 'Gharim',
    body: 'Orang yang terjerat utang dan tidak mampu membayarnya, terutama untuk kebutuhan yang dibolehkan syariat. Mereka berhak dibantu agar terbebas dari lilitan utang.',
  },
  {
    number: 7,
    title: 'Fisabilillah',
    body: 'Orang yang berjuang di jalan Allah, termasuk untuk dakwah, pendidikan, dan pembelaan agama. Zakat mendukung perjuangan dan kebaikan yang mereka lakukan.',
  },
  {
    number: 8,
    title: 'Ibnu Sabil',
    body: 'Musafir yang kehabisan bekal dalam perjalanan yang dibolehkan syariat. Zakat membantu mereka melanjutkan perjalanan dan kembali dengan aman.',
  },
];

const ARTICLE_PAGES = [
  [1, 2],
  [3, 4, 5, 6],
  [7, 8],
] as const;

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'asnaf-count',
    question: 'Berapa banyak golongan yang berhak menerima zakat?',
    correctValue: '8',
    options: [
      { label: '7', value: '7' },
      { label: '8', value: '8' },
      { label: '9', value: '9' },
      { label: '10', value: '10' },
    ],
  },
  {
    id: 'fakir-miskin',
    question: 'Pernyataan yang benar tentang fakir dan miskin adalah...',
    correctValue: 'definisi',
    options: [
      {
        label:
          'Fakir memiliki harta yang cukup, sedangkan miskin tidak memiliki apa pun.',
        value: 'terbalik',
      },
      {
        label:
          'Fakir tidak memiliki harta dan penghasilan cukup, sedangkan miskin memiliki sedikit harta tetapi belum mencukupi.',
        value: 'definisi',
      },
      {
        label: 'Fakir dan miskin sama-sama tidak berhak menerima zakat.',
        value: 'tidak-berhak',
      },
      {
        label: 'Miskin selalu lebih parah kekurangannya daripada fakir.',
        value: 'miskin-lebih-parah',
      },
    ],
  },
  {
    id: 'gharim',
    question:
      'Golongan orang yang terjerat utang dan tidak mampu membayarnya disebut...',
    correctValue: 'gharim',
    options: [
      { label: 'Riqab', value: 'riqab' },
      { label: 'Gharim', value: 'gharim' },
      { label: 'Fisabilillah', value: 'fisabilillah' },
      { label: 'Ibnu Sabil', value: 'ibnu-sabil' },
    ],
  },
  {
    id: 'muallaf',
    question: 'Apakah Muallaf berhak menerima zakat?',
    correctValue: 'ya',
    options: [
      { label: 'Ya', value: 'ya' },
      { label: 'Tidak', value: 'tidak' },
    ],
  },
  {
    id: 'amil',
    question:
      'Orang-orang yang mengelola zakat juga berhak menerima zakat. Golongan itu disebut...',
    correctValue: 'amil',
    options: [
      { label: 'Amil', value: 'amil' },
      { label: 'Riqab', value: 'riqab' },
      { label: 'Fisabilillah', value: 'fisabilillah' },
      { label: 'Ibnu Sabil', value: 'ibnu-sabil' },
    ],
  },
];

interface EducationDetailViewProps {
  className?: string;
  /** Test-only injection point — see `QuizPanelProps`. */
  submitQuizAttempt?: typeof orpc.gamification.submitQuizAttempt;
  claimQuiz?: typeof orpc.gamification.claimQuiz;
  gradeQuiz?: typeof orpc.gamification.gradeQuiz;
  /** Tamu (null) boleh bermain, tetapi XP disembunyikan dan tidak tersimpan. */
  user?: SessionUser | null;
}

function TabSwitcher({
  activeTab,
  onChange,
  showXp,
}: {
  showXp: boolean;
  activeTab: EducationTab;
  onChange: (tab: EducationTab) => void;
}) {
  return (
    <div
      aria-label="Pilih bagian edukasi"
      className="grid grid-cols-2 gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1"
      role="tablist"
    >
      <button
        aria-selected={activeTab === 'materi'}
        className={cn(
          'rounded-xl px-3 py-2 font-semibold text-xs transition-all',
          activeTab === 'materi'
            ? 'bg-white text-gray-900 shadow-xs'
            : 'text-gray-500 hover:text-gray-800'
        )}
        onClick={() => onChange('materi')}
        role="tab"
        type="button"
      >
        Materi & Diskusi
      </button>
      <button
        aria-selected={activeTab === 'kuis'}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl px-3 py-1.5 font-semibold text-xs transition-all',
          activeTab === 'kuis'
            ? 'bg-white text-gray-900 shadow-xs'
            : 'text-gray-500 hover:text-gray-800'
        )}
        onClick={() => onChange('kuis')}
        role="tab"
        type="button"
      >
        <span>Kuis Interaktif</span>
        <span className="mt-1 flex flex-wrap justify-center gap-1">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] text-amber-700">
            WORKPLACE KUIS
          </span>
          {showXp && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] text-emerald-700">
              +{ACTIVITY_POINTS.QUIZ} XP Berkah
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

function AsnafGrid() {
  return (
    <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
      <h2 className="font-bold text-gray-900 text-sm">
        8 Asnaf Penerima Zakat
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {ASNAF_ITEMS.map((item) => (
          <div
            className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-2xs"
            key={item.name}
          >
            <span aria-hidden="true" className="text-xl">
              {item.emoji}
            </span>
            <p className="mt-1 font-bold text-gray-900 text-xs">{item.name}</p>
            <p className="mt-0.5 text-[10px] text-gray-500 leading-snug">
              {item.short}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArticlePager() {
  const [page, setPage] = useState(0);
  const pointNumbers = ARTICLE_PAGES[page];
  const points = pointNumbers
    .map((number) => ARTICLE_POINTS.find((point) => point.number === number))
    .filter((point): point is ArticlePoint => Boolean(point));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-caption-mini text-gray-500">
          Halaman {page + 1} dari {ARTICLE_PAGES.length}
        </p>
        <div aria-hidden="true" className="flex gap-1">
          {ARTICLE_PAGES.map((_, index) => (
            <span
              className={cn(
                'h-1.5 w-6 rounded-full',
                index === page ? 'bg-brand-primary' : 'bg-gray-200'
              )}
              key={`page-${index + 1}`}
            />
          ))}
        </div>
      </div>

      {points.map((point) => (
        <article
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-xs"
          key={point.number}
        >
          <div className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800 text-xs">
              {point.number}
            </span>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">{point.title}</h3>
              <p className="mt-1 text-body-base text-gray-600 leading-relaxed">
                {point.body}
              </p>
            </div>
          </div>
        </article>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button
          disabled={page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          type="button"
          variant="outline"
        >
          &lt; Halaman sebelumnya
        </Button>
        <Button
          disabled={page === ARTICLE_PAGES.length - 1}
          onClick={() =>
            setPage((current) =>
              Math.min(ARTICLE_PAGES.length - 1, current + 1)
            )
          }
          type="button"
        >
          Halaman selanjutnya &gt;
        </Button>
      </div>
    </section>
  );
}

function DiscussionSection() {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([
    {
      author: 'Aisyah',
      body: 'Alhamdulillah, penjelasan asnaf jadi lebih mudah dipahami.',
    },
    {
      author: 'Fikri',
      body: 'Semoga makin banyak yang memahami cara menyalurkan zakat dengan tepat.',
    },
  ]);

  const submitComment = () => {
    const trimmed = comment.trim();
    if (!trimmed) {
      return;
    }
    setComments((current) => [...current, { author: 'Anda', body: trimmed }]);
    setComment('');
  };

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <MessageCircle
          aria-hidden="true"
          className="size-4 text-brand-primary"
        />
        <h2 className="font-bold text-gray-900 text-sm">Diskusi Komentar</h2>
      </div>
      <div className="mt-3 space-y-3">
        {comments.map((item) => (
          <div
            className="rounded-2xl bg-gray-50 p-3"
            key={`${item.author}-${item.body}`}
          >
            <p className="font-semibold text-gray-800 text-xs">{item.author}</p>
            <p className="mt-1 text-body-base text-gray-600">{item.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <label className="sr-only" htmlFor="education-comment">
          Tulis komentar
        </label>
        <textarea
          className="min-h-20 w-full rounded-2xl border border-gray-200 p-3 text-xs outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
          id="education-comment"
          onChange={(event) => setComment(event.target.value)}
          placeholder="Tulis pertanyaan atau tanggapan..."
          value={comment}
        />
        <Button
          disabled={!comment.trim()}
          onClick={submitComment}
          type="button"
          variant="outline"
        >
          <Send aria-hidden="true" />
          Kirim Komentar
        </Button>
      </div>
    </section>
  );
}

function ArticleContent({
  onStartQuiz,
  showXp,
}: {
  onStartQuiz: () => void;
  showXp: boolean;
}) {
  return (
    <div className="space-y-4">
      <AsnafGrid />
      <article className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs">
        <p className="font-semibold text-caption-mini text-emerald-700 uppercase tracking-wider">
          Fikih Zakat
        </p>
        <h1 className="mt-2 font-bold text-gray-900 text-xl leading-tight">
          Mengenal 8 Asnaf, Golongan yang Berhak Menerima Zakat
        </h1>
        <blockquote className="mt-4 rounded-2xl border-emerald-100 border-l-4 bg-emerald-50/60 p-4 text-body-base text-emerald-900 italic">
          “Sesungguhnya zakat itu hanyalah untuk orang-orang fakir, orang-orang
          miskin, para amil zakat, orang-orang yang dilunakkan hatinya
          (muallaf), untuk memerdekakan hamba sahaya (riqab), untuk orang yang
          berutang (gharim), untuk jalan Allah (fisabilillah), dan untuk orang
          yang sedang dalam perjalanan (ibnu sabil).”
          <footer className="mt-2 font-semibold text-caption-mini not-italic">
            — At-Taubah: 60
          </footer>
        </blockquote>
        <div className="mt-5">
          <ArticlePager />
        </div>
      </article>

      <section className="rounded-3xl border border-[#2b4f43] bg-gradient-to-r from-[#1d352d] via-[#244238] to-[#356152] p-6 text-white shadow-md">
        <div className="flex gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
            <BookOpen aria-hidden="true" className="size-5" />
          </div>
          <div className="space-y-1">
            {showXp && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-0.5 font-bold text-[10px] text-amber-300">
                <span>+{ACTIVITY_POINTS.QUIZ} XP BERKAH</span>
              </div>
            )}
            <h2 className="font-bold text-base text-white">
              Uji Pemahaman Hukum Muamalah?
            </h2>
            <p className="text-emerald-100/90 text-xs leading-relaxed">
              Yuk selesaikan kuis interaktif singkat seputar materi di atas
              {showXp ? ` dan raih ${ACTIVITY_POINTS.QUIZ} XP Berkah!` : '.'}
            </p>
          </div>
        </div>
        <Button
          className="mt-4 w-full bg-white font-bold text-[#1d352d] hover:bg-gray-100"
          onClick={onStartQuiz}
          type="button"
        >
          Mulai Kuis
        </Button>
      </section>

      <DiscussionSection />
    </div>
  );
}

/**
 * `orpc.gamification.submitQuizAttempt`/`.claimQuiz` are `Proxy` property
 * accesses (`createORPCClient`, `@orpc/client`) that return a brand-new
 * proxy on every access — never used as a `useEffect`/`useCallback`
 * dependency here, so this never looped, but hoisting keeps the default a
 * single stable reference rather than one recreated every render.
 */
const DEFAULT_SUBMIT_QUIZ_ATTEMPT = orpc.gamification.submitQuizAttempt;
const DEFAULT_CLAIM_QUIZ = orpc.gamification.claimQuiz;
const DEFAULT_GRADE_QUIZ = orpc.gamification.gradeQuiz;

interface QuizPanelProps {
  /**
   * Injectable network calls — mirrors `ReceiptDropzone`'s `customUploadFn`
   * pattern so component tests can render the real quiz UI without hitting
   * `/rpc` over actual `fetch`. Production always uses the default.
   */
  submitQuizAttempt?: typeof orpc.gamification.submitQuizAttempt;
  claimQuiz?: typeof orpc.gamification.claimQuiz;
  gradeQuiz?: typeof orpc.gamification.gradeQuiz;
  /** Tamu: dinilai server tanpa menyimpan percobaan atau poin. */
  isGuest: boolean;
}

function QuizPanel({
  submitQuizAttempt = DEFAULT_SUBMIT_QUIZ_ATTEMPT,
  claimQuiz = DEFAULT_CLAIM_QUIZ,
  gradeQuiz = DEFAULT_GRADE_QUIZ,
  isGuest,
}: QuizPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    correct: number;
    passed: boolean;
    percentage: number;
    total: number;
    /** Poin yang BENAR-BENAR ditulis ke ledger — bukan angka tampilan. */
    awardedPoints: number;
  } | null>(null);

  const checkAnswers = async () => {
    const unanswered = QUIZ_QUESTIONS.some((question) => !answers[question.id]);
    if (unanswered) {
      setError('Pilih jawaban untuk semua soal terlebih dahulu.');
      setResult(null);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // Server menilai jawaban sendiri (packages/core/education/asnaf-quiz)
      // dan menulis percobaannya ke `quiz_attempts` — skor di layar TIDAK
      // pernah dihitung di klien lalu dipercaya begitu saja.
      const grade = await (isGuest ? gradeQuiz : submitQuizAttempt)({
        quizId: ASNAF_QUIZ_ID,
        answers,
      });

      let awardedPoints = 0;
      if (grade.passed && !isGuest) {
        const claim = await claimQuiz({ quizId: ASNAF_QUIZ_ID });
        awardedPoints = claim.points;
      }

      setResult({
        correct: grade.correct,
        passed: grade.passed,
        percentage: grade.percentage,
        total: grade.total,
        awardedPoints,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Gagal mengirim jawaban kuis. Coba lagi, atau masuk terlebih dahulu bila Anda belum login.'
      );
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  };

  const resetQuiz = () => {
    setAnswers({});
    setError(null);
    setResult(null);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs">
        <p className="font-semibold text-caption-mini text-emerald-700 uppercase tracking-wider">
          Topik: Golongan Penerima Zakat
        </p>
        <h2 className="mt-2 font-bold text-gray-900 text-lg">
          UJI PEMAHAMAN SYARIAH ANDA
        </h2>
        <p className="mt-1 text-body-base text-gray-500">
          Pilih satu jawaban yang paling tepat. Skor minimal kelulusan 80%.
        </p>
      </div>

      {QUIZ_QUESTIONS.map((question, index) => (
        <fieldset
          className="rounded-3xl border border-gray-100 bg-white p-4 shadow-xs"
          key={question.id}
        >
          <legend className="font-bold text-gray-900 text-sm">
            {index + 1}. {question.question}
          </legend>
          <div className="mt-3 space-y-2">
            {question.options.map((option) => (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-2xl border p-3 text-body-base transition-colors',
                  answers[question.id] === option.value
                    ? 'border-brand-primary bg-emerald-50 text-emerald-900'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100'
                )}
                key={option.value}
              >
                <input
                  checked={answers[question.id] === option.value}
                  className="mt-0.5 accent-emerald-600"
                  name={question.id}
                  onChange={() =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: option.value,
                    }))
                  }
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {error && (
        <p
          className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-label-caption text-rose-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {result && (
        <div
          aria-live="polite"
          className={cn(
            'rounded-3xl border p-5',
            result.passed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          )}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0"
            />
            <div>
              <h3 className="font-bold text-sm">
                {result.passed
                  ? 'Selamat! Pemahaman Anda luar biasa.'
                  : 'Belum lulus, pelajari materi sekali lagi.'}
              </h3>
              <p className="mt-1 text-body-base">
                Skor Anda: {result.correct}/{result.total} ({result.percentage}
                %).
              </p>
              {result.passed && !isGuest && result.awardedPoints > 0 && (
                <p className="mt-2 font-bold text-emerald-700">
                  Reward: +{result.awardedPoints} XP Berkah
                </p>
              )}
              {result.passed && !isGuest && result.awardedPoints === 0 && (
                <p className="mt-2 font-semibold text-emerald-700">
                  Anda sudah pernah menerima XP Berkah untuk kuis ini
                  sebelumnya.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {result?.passed && isGuest && <QuizLoginBanner />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          disabled={submitting}
          onClick={() => {
            checkAnswers().catch(() => null);
          }}
          type="button"
        >
          {submitting ? 'Memeriksa…' : 'Periksa Jawaban Kuis'}
        </Button>
        <Button
          disabled={submitting}
          onClick={resetQuiz}
          type="button"
          variant="outline"
        >
          Ulangi Kuis
        </Button>
      </div>
    </section>
  );
}

export function EducationDetailView({
  className,
  submitQuizAttempt,
  claimQuiz,
  gradeQuiz,
  user = null,
}: EducationDetailViewProps) {
  const [activeTab, setActiveTab] = useState<EducationTab>('materi');
  const isGuest = !user;

  return (
    <div className={cn('space-y-4', className)}>
      <TabSwitcher
        activeTab={activeTab}
        onChange={setActiveTab}
        showXp={!isGuest}
      />
      {activeTab === 'materi' ? (
        <ArticleContent
          onStartQuiz={() => setActiveTab('kuis')}
          showXp={!isGuest}
        />
      ) : (
        <QuizPanel
          claimQuiz={claimQuiz}
          gradeQuiz={gradeQuiz}
          isGuest={isGuest}
          submitQuizAttempt={submitQuizAttempt}
        />
      )}
    </div>
  );
}
