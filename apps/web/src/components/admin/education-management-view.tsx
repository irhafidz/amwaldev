/** biome-ignore-all lint/performance/useTopLevelRegex: berkas ini dipulihkan 1:1 dari origin/awan (PR #28); sebagian regex-nya ber-flag /g dan memakai lastIndex di dalam loop exec, sehingga menaikkannya ke lingkup modul akan membuat state dipakai bersama antar-pemanggilan — bug, bukan perbaikan */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: idem — kunci indeks berada di perender markdown yang memetakan baris/paragraf hasil split string; menggantinya butuh menulis ulang perender yang wajib identik */

import {
  parseYoutubeVideoId,
  youtubeThumbnailUrl,
} from '@amwal/core/education/youtube';
import { useSearch } from '@tanstack/react-router';
import {
  AlertCircle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Award,
  Bold,
  BookOpen,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Eraser,
  ExternalLink,
  Eye,
  FileCheck,
  FolderPlus,
  GraduationCap,
  Heart,
  HelpCircle,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  MessageSquare,
  Play,
  Plus,
  Printer,
  Redo2,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Strikethrough,
  ThumbsUp,
  Trash2,
  Underline,
  Undo2,
  Upload,
  User,
  Video,
  X,
  Youtube,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  AdminPageHeader,
  AdminTabs,
} from '@/components/admin/admin-primitives';
import {
  sanitizeRichHtml,
  stripHtmlTags,
} from '@/components/admin/sanitize-rich-html';
import { YoutubeLinkField } from '@/components/admin/youtube-link-field';
import { YoutubeEmbed } from '@/components/education/youtube-embed';
import { confirmAction } from '@/components/ui/confirm-action';
import { SelectField } from '@/components/ui/select-field';
import { useToast } from '@/components/ui/toast';
import { useDirtyGuard } from '@/components/ui/use-dirty-guard';
import {
  type AdminEducationQuizQuestionInput,
  createAdminEducationArticle,
  createAdminEducationCategory,
  createAdminEducationVideo,
  deleteAdminEducationArticle,
  deleteAdminEducationCategory,
  deleteAdminEducationVideo,
  getAdminEducationArticle,
  getAdminEducationArticles,
  getAdminEducationCategories,
  getAdminEducationStats,
  getAdminEducationVideos,
  updateAdminEducationArticle,
  updateAdminEducationCategory,
  updateAdminEducationVideo,
} from '@/lib/amwal-api/admin';
import { isHtmlBlank, normalizeArticleHtml } from '@/lib/article-editor';
import {
  clearDraft,
  readDraft,
  type StoredDraft,
  writeDraft,
} from '@/lib/form-draft';
import { orpc } from '@/lib/orpc/client';
import { describeRpcError } from '@/lib/orpc/error-message';

// --- DATA TYPES ---
export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  points: number;
}

export interface DiscussionComment {
  id: string;
  authorName: string;
  authorRole: 'Jamaah' | 'Muzakki' | 'Wakif' | 'Admin' | 'Asatidz';
  avatarText: string;
  comment: string;
  timestamp: string;
  likes: number;
  isLiked?: boolean;
  status: 'approved' | 'pending' | 'flagged';
  videoTimestamp?: string; // e.g. "03:45"
  replies?: DiscussionComment[];
}

export interface ArticleItem {
  id: string;
  title: string;
  category: string;
  coverImage: string;
  content: string;
  summary: string;
  author: string;
  publishDate: string;
  status: 'published' | 'draft';
  likesCount: number;
  isLikedByUser?: boolean;
  viewsCount: number;
  readTime: string;
  quiz?: QuizQuestion[];
  quizCount: number;
  discussions: DiscussionComment[];
}

export interface VideoItem {
  id: string;
  title: string;
  category: string;
  sourceType: 'upload' | 'link';
  videoUrl: string;
  thumbnailUrl: string;
  speaker: string;
  duration: string;
  description: string;
  publishDate: string;
  status: 'published' | 'draft';
  likesCount: number;
  isLikedByUser?: boolean;
  viewsCount: number;
  discussions: DiscussionComment[];
}

/**
 * Ditampilkan saat cover artikel null/kosong atau gagal dimuat (onError).
 * `btoa` (bukan `Buffer`) — berkas ini dirender di browser, bukan hanya
 * server.
 */
const ARTICLE_COVER_PLACEHOLDER = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225">' +
    '<rect width="100%" height="100%" fill="#e2e8f0"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
    'font-family="sans-serif" font-size="14" fill="#94a3b8">' +
    'Gambar Sampul Tidak Tersedia</text></svg>'
)}`;

function handleCoverImageError(e: React.SyntheticEvent<HTMLImageElement>) {
  if (e.currentTarget.src !== ARTICLE_COVER_PLACEHOLDER) {
    e.currentTarget.src = ARTICLE_COVER_PLACEHOLDER;
  }
}

/** Ringkasan teaser artikel: 120 karakter pertama konten (tidak ada kolom excerpt). */
function articleTeaser(content: string): string {
  const plain = stripHtmlTags(content)
    .replace(/[#*`_>]/g, '')
    .trim();
  return plain.length > 120 ? `${plain.slice(0, 120)}...` : plain;
}

/** A/B/C/D — pemetaan tetap indeks opsi builder kuis ke `key` server. */
const QUIZ_OPTION_KEYS = ['A', 'B', 'C', 'D'];

function quizQuestionsToPayload(
  quiz: QuizQuestion[]
): AdminEducationQuizQuestionInput[] {
  return quiz.map((q) => {
    const correctIdx = q.options.findIndex((o) => o.id === q.correctOptionId);
    return {
      question: q.question,
      options: q.options.map((o, idx) => ({
        key: QUIZ_OPTION_KEYS[idx] || String(idx),
        text: o.text,
      })),
      correctKey: QUIZ_OPTION_KEYS[correctIdx >= 0 ? correctIdx : 0],
      explanation: q.explanation || undefined,
    };
  });
}

/** Kebalikan `quizQuestionsToPayload` — dipakai memuat ulang builder kuis saat Edit Artikel. */
function quizQuestionsFromPayload(
  quiz: AdminEducationQuizQuestionInput[]
): QuizQuestion[] {
  return quiz.map((q, qIdx) => {
    const options = q.options.map((o, idx) => ({
      id: `opt-${idx}`,
      text: o.text,
    }));
    const correctIdx = q.options.findIndex((o) => o.key === q.correctKey);
    return {
      id: `q-edit-${qIdx}-${Date.now()}`,
      question: q.question,
      options,
      correctOptionId: options[correctIdx >= 0 ? correctIdx : 0]?.id ?? 'opt-0',
      explanation: q.explanation ?? '',
      points: 0, // ponytail: bobot dihitung dinamis (100 / total soal), tidak disimpan per-soal
    };
  });
}

const MIN_QUIZ_OPTIONS = 2;
const MAX_QUIZ_OPTIONS = 5;
const QUIZ_OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
const ARTICLE_DRAFT_KEY = 'amwal:edu-article-draft:v1';

/** Galat muat daftar: tampil terang-terangan (dulu ditelan senyap, daftar tampak "kosong"). */
function LoadErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 text-sm"
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        className="cursor-pointer rounded-lg bg-rose-600 px-3.5 py-1.5 font-bold text-white hover:bg-rose-700"
        onClick={onRetry}
        type="button"
      >
        Coba Lagi
      </button>
    </div>
  );
}

/**
 * Pratinjau kuis di admin: jawaban langsung berwarna (hijau benar, merah salah,
 * kunci yang benar ikut disorot hijau), penjelasan tampil di bawah soal, dan
 * skor muncul setelah semua soal dijawab. Bisa diulang.
 */
function QuizPreview({ quiz }: { quiz: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answered = quiz.filter((q) => answers[q.id]).length;
  const correct = quiz.filter(
    (q) => answers[q.id] === q.correctOptionId
  ).length;
  const poinPerSoal = Math.round(100 / (quiz.length || 1));

  return (
    <div className="mt-8 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-bold text-amber-950 text-sm">
          <HelpCircle className="h-4 w-4 text-amber-700" />
          Uji Pemahaman: Kuis ({quiz.length} Soal)
        </h3>
        <span className="font-bold font-mono text-amber-800 text-xs">
          100 Poin Total
        </span>
      </div>

      <div className="space-y-3">
        {quiz.map((q, idx) => {
          const picked = answers[q.id];
          return (
            <div
              className="space-y-2 rounded-xl border border-amber-200 bg-white p-3.5 text-sm"
              key={q.id}
            >
              <span className="block font-bold text-slate-900">
                {idx + 1}. {q.question}
              </span>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {q.options.map((opt, oIdx) => {
                  const isCorrect = opt.id === q.correctOptionId;
                  const isPicked = picked === opt.id;
                  let tone =
                    'border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50';
                  if (picked && isCorrect) {
                    tone =
                      'border-emerald-500 bg-emerald-50 font-bold text-emerald-900';
                  } else if (picked && isPicked) {
                    tone = 'border-rose-500 bg-rose-50 font-bold text-rose-900';
                  } else if (picked) {
                    tone = 'border-slate-200 bg-slate-50 text-slate-400';
                  }
                  return (
                    <button
                      aria-pressed={isPicked}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition disabled:cursor-default ${tone}`}
                      disabled={Boolean(picked)}
                      key={opt.id}
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                      }
                      type="button"
                    >
                      <span>
                        {String.fromCharCode(65 + oIdx)}. {opt.text}
                      </span>
                      {picked && isCorrect && (
                        <Check
                          aria-label="Jawaban benar"
                          className="h-4 w-4 shrink-0 text-emerald-700"
                        />
                      )}
                      {picked && isPicked && !isCorrect && (
                        <X
                          aria-label="Jawaban salah"
                          className="h-4 w-4 shrink-0 text-rose-700"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {picked && (
                <p
                  className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                    picked === q.correctOptionId
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'bg-rose-50 text-rose-900'
                  }`}
                  role="status"
                >
                  <strong>
                    {picked === q.correctOptionId
                      ? `Benar! (+${poinPerSoal} Poin)`
                      : 'Kurang tepat.'}
                  </strong>{' '}
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {answered > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-amber-200 border-t pt-3 text-sm">
          <span className="font-bold text-amber-950">
            {answered === quiz.length
              ? `Skor: ${correct} dari ${quiz.length} benar (${correct * poinPerSoal} Poin)`
              : `${answered} dari ${quiz.length} soal dijawab`}
          </span>
          <button
            className="cursor-pointer rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 text-xs hover:bg-amber-100"
            onClick={() => setAnswers({})}
            type="button"
          >
            Ulangi Kuis
          </button>
        </div>
      )}
    </div>
  );
}

// --- HELPER RENDERING RICH FORMATTING & ISLAMIC CALLOUTS ---
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
function renderInlineFormatting(text: string): React.ReactNode {
  if (!text) {
    return text;
  }
  const parts: React.ReactNode[] = [];
  const regex =
    /(\*\*.*?\*\*|\*.*?\*|<u>.*?<\/u>|~~.*?~~|`.*?`|\[.*?\]\(.*?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong className="font-bold text-slate-900" key={match.index}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em className="text-slate-800 italic" key={match.index}>
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('<u>') && token.endsWith('</u>')) {
      parts.push(
        <u
          className="underline decoration-slate-400 underline-offset-2"
          key={match.index}
        >
          {token.slice(3, -4)}
        </u>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      parts.push(
        <s className="text-slate-400 line-through" key={match.index}>
          {token.slice(2, -2)}
        </s>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono font-semibold text-[#1B5E20] text-xs"
          key={match.index}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        parts.push(
          <a
            className="inline-flex items-center gap-0.5 font-bold text-[#1B5E20] underline hover:text-[#144716]"
            href={linkMatch[2]}
            key={match.index}
            rel="noopener noreferrer"
            target="_blank"
          >
            {linkMatch[1]}
            <ExternalLink className="ml-0.5 inline h-3 w-3" />
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    lastIndex = match.index + token.length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// Convert legacy markdown / text to rich Google Docs HTML
function convertContentToDocHtml(rawInput: string): string {
  let raw = rawInput;
  // Editor kosong = kanvas kosong; petunjuk "Mulai ketik ..." digambar sebagai
  // overlay (bukan isi), dan petunjuk lama yang sempat tersimpan dibuang.
  raw = normalizeArticleHtml(raw);
  if (!raw) {
    return '';
  }

  // If already rich HTML with tags, return
  if (/<(p|h1|h2|h3|div|blockquote|ul|ol|table|hr)[^>]*>/i.test(raw)) {
    return raw;
  }

  // Convert legacy markdown lines
  const paragraphs = raw.split(/\n\s*\n/);
  return (
    paragraphs
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) {
          return '';
        }
        if (trimmed === '---' || trimmed === '***') {
          return '<hr class="my-6 border-slate-200" />';
        }
        if (trimmed.startsWith('# ')) {
          return `<h1 class="text-xl sm:text-2xl font-black text-slate-900 mt-4 mb-2">${trimmed.replace(/^#\s+/, '')}</h1>`;
        }
        if (trimmed.startsWith('## ')) {
          return `<h2 class="text-lg sm:text-xl font-bold text-slate-900 mt-3 mb-2">${trimmed.replace(/^##\s+/, '')}</h2>`;
        }
        if (trimmed.startsWith('### ')) {
          return `<h3 class="text-base font-bold text-slate-800 mt-2 mb-1">${trimmed.replace(/^###\s+/, '')}</h3>`;
        }
        if (
          trimmed.startsWith('> 🕋') ||
          trimmed.startsWith('> 📜') ||
          (trimmed.toLowerCase().includes('dalil') && trimmed.startsWith('>'))
        ) {
          const text = trimmed.replace(/^>\s?/gm, '').replace(/\n/g, '<br/>');
          return `<div class="my-4 p-4 bg-emerald-50/90 border-l-4 border-[#1B5E20] rounded-r-2xl text-emerald-950 text-xs sm:text-sm font-medium shadow-2xs space-y-1"><div class="font-bold text-[#1B5E20] text-xs">🕋 Rujukan Fiqih &amp; Dalil Syariah</div><p class="italic">${text}</p></div>`;
        }
        if (trimmed.startsWith('>')) {
          const text = trimmed.replace(/^>\s?/gm, '').replace(/\n/g, '<br/>');
          return `<blockquote class="my-3 pl-4 border-l-3 border-amber-400 italic text-slate-700 bg-amber-50/40 p-3 rounded-r-xl text-xs sm:text-sm">${text}</blockquote>`;
        }

        const lines = trimmed.split('\n');
        const isBullet = lines.every(
          (l) => /^[-*•]\s+/.test(l.trim()) || l.trim() === ''
        );
        if (isBullet) {
          const items = lines
            .filter((l) => l.trim())
            .map((l) => `<li>${l.trim().replace(/^[-*•]\s+/, '')}</li>`)
            .join('');
          return `<ul class="list-disc pl-5 space-y-1 my-2 text-slate-800 text-xs sm:text-sm">${items}</ul>`;
        }

        const isNumbered = lines.every(
          (l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === ''
        );
        if (isNumbered) {
          const items = lines
            .filter((l) => l.trim())
            .map((l) => `<li>${l.trim().replace(/^\d+\.\s+/, '')}</li>`)
            .join('');
          return `<ol class="list-decimal pl-5 space-y-1 my-2 text-slate-800 text-xs sm:text-sm">${items}</ol>`;
        }

        // Convert inline markdown in regular paragraph
        const htmlPara = trimmed
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/~~(.*?)~~/g, '<s>$1</s>')
          .replace(
            /`([^`]+)`/g,
            '<code class="px-1.5 py-0.5 rounded bg-emerald-50 text-[#1B5E20] font-mono text-xs font-semibold border border-emerald-200">$1</code>'
          )
          .replace(/\n/g, '<br/>');

        return `<p class="my-2 leading-relaxed text-xs sm:text-sm text-slate-800">${htmlPara}</p>`;
      })
      .filter(Boolean)
      .join('\n')
  );
}

function renderRichArticleContent(content: string, defaultAlign = 'text-left') {
  if (!content) {
    return (
      <p className="text-slate-400 text-xs italic">Belum ada konten tulisan.</p>
    );
  }

  // If content contains rich HTML tags from Google Docs editor, render directly with clean paper styling
  if (
    /<(p|h1|h2|h3|div|blockquote|ul|ol|table|hr|span|strong|em|u|s)[^>]*>/i.test(
      content
    )
  ) {
    return (
      <div
        className={`google-docs-content space-y-3 text-slate-800 leading-relaxed ${defaultAlign}`}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: konten editor lama memang HTML kaya dan elemen ini dipulihkan 1:1 dari origin/awan (PR #28); HTML-nya dibersihkan lebih dulu oleh `sanitizeRichHtml` (daftar-putih tag/atribut, seluruh `on*`, `style`, `script`, dan `iframe` dibuang)
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
      />
    );
  }

  // Split by double newlines or blank lines for fallback plain text / markdown
  const paragraphs = content.split(/\n\s*\n/);

  return (
    <div className={`space-y-4 ${defaultAlign}`}>
      {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen */}
      {paragraphs.map((para, pIdx) => {
        const trimmed = para.trim();
        if (!trimmed) {
          return null;
        }

        if (trimmed === '---' || trimmed === '***') {
          return <hr className="my-6 border-slate-200" key={pIdx} />;
        }

        // Check alignment wraps like <div align="center">...</div> or <p align="right">
        let alignClass = '';
        let cleanText = trimmed;
        if (
          /^<div align="center">/i.test(trimmed) ||
          /^<center>/i.test(trimmed) ||
          /^<p align="center">/i.test(trimmed)
        ) {
          alignClass = 'text-center';
          cleanText = trimmed.replace(/<\/?(div|p|center)[^>]*>/gi, '').trim();
        } else if (
          /^<div align="right">/i.test(trimmed) ||
          /^<p align="right">/i.test(trimmed)
        ) {
          alignClass = 'text-right';
          cleanText = trimmed.replace(/<\/?(div|p)[^>]*>/gi, '').trim();
        } else if (
          /^<div align="justify">/i.test(trimmed) ||
          /^<p align="justify">/i.test(trimmed)
        ) {
          alignClass = 'text-justify';
          cleanText = trimmed.replace(/<\/?(div|p)[^>]*>/gi, '').trim();
        } else if (
          /^<div align="left">/i.test(trimmed) ||
          /^<p align="left">/i.test(trimmed)
        ) {
          alignClass = 'text-left';
          cleanText = trimmed.replace(/<\/?(div|p)[^>]*>/gi, '').trim();
        }

        // Heading 1
        if (cleanText.startsWith('# ')) {
          return (
            <h1
              className={`pt-2 font-black text-slate-900 text-xl tracking-tight sm:text-2xl ${alignClass}`}
              key={pIdx}
            >
              {renderInlineFormatting(cleanText.replace(/^#\s+/, ''))}
            </h1>
          );
        }

        // Heading 2
        if (cleanText.startsWith('## ')) {
          return (
            <h2
              className={`pt-1.5 font-bold text-lg text-slate-900 tracking-tight sm:text-xl ${alignClass}`}
              key={pIdx}
            >
              {renderInlineFormatting(cleanText.replace(/^##\s+/, ''))}
            </h2>
          );
        }

        // Heading 3
        if (cleanText.startsWith('### ')) {
          return (
            <h3
              className={`pt-1 font-bold text-base text-slate-800 ${alignClass}`}
              key={pIdx}
            >
              {renderInlineFormatting(cleanText.replace(/^###\s+/, ''))}
            </h3>
          );
        }

        // Dalil / Islamic Blockquote
        if (
          cleanText.startsWith('> 🕋') ||
          cleanText.startsWith('> 📜') ||
          (cleanText.toLowerCase().includes('dalil') &&
            cleanText.startsWith('>'))
        ) {
          const quoteLines = cleanText
            .split('\n')
            .map((l) => l.replace(/^>\s?/, ''));
          return (
            <div
              className="my-3 space-y-1.5 rounded-r-2xl border-[#1B5E20] border-l-4 bg-emerald-50/90 p-4 font-medium text-emerald-950 text-xs shadow-2xs sm:text-sm"
              key={pIdx}
            >
              <div className="flex items-center gap-1.5 font-bold text-[#1B5E20] text-xs">
                <BookOpen className="h-4 w-4" />
                <span>Rujukan Fiqih & Dalil Syariah</span>
              </div>
              <div className="space-y-1 italic leading-relaxed">
                {quoteLines.map((line, lIdx) => (
                  <p className={alignClass} key={lIdx}>
                    {renderInlineFormatting(line)}
                  </p>
                ))}
              </div>
            </div>
          );
        }

        // Standard Blockquote
        if (cleanText.startsWith('>')) {
          const quoteLines = cleanText
            .split('\n')
            .map((l) => l.replace(/^>\s?/, ''));
          return (
            <blockquote
              className={`my-3 rounded-r-xl border-amber-400 border-l-3 bg-amber-50/40 p-3 pl-4 text-slate-700 text-xs italic sm:text-sm ${alignClass}`}
              key={pIdx}
            >
              {quoteLines.map((line, lIdx) => (
                <p key={lIdx}>{renderInlineFormatting(line)}</p>
              ))}
            </blockquote>
          );
        }

        // Lines analysis for lists
        const lines = cleanText.split('\n');
        const isBulletList = lines.every(
          (l) => /^[-*•]\s+/.test(l.trim()) || l.trim() === ''
        );
        const isNumberedList = lines.every(
          (l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === ''
        );

        if (isBulletList && lines.some((l) => l.trim() !== '')) {
          return (
            <ul
              className={`my-2 list-none space-y-1.5 pl-1 ${alignClass}`}
              key={pIdx}
            >
              {lines.map((l, lIdx) => {
                if (!l.trim()) {
                  return null;
                }
                const itemText = l.trim().replace(/^[-*•]\s+/, '');
                return (
                  <li
                    className="flex items-start gap-2 text-slate-800 text-xs sm:text-sm"
                    key={lIdx}
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B5E20]" />
                    <span className="leading-relaxed">
                      {renderInlineFormatting(itemText)}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }

        if (isNumberedList && lines.some((l) => l.trim() !== '')) {
          return (
            <ol
              className={`my-2 list-none space-y-1.5 pl-1 ${alignClass}`}
              key={pIdx}
            >
              {lines.map((l, lIdx) => {
                if (!l.trim()) {
                  return null;
                }
                const match = l.trim().match(/^(\d+)\.\s+(.*)$/);
                const num = match ? match[1] : (lIdx + 1).toString();
                const itemText = match ? match[2] : l.trim();
                return (
                  <li
                    className="flex items-start gap-2 text-slate-800 text-xs sm:text-sm"
                    key={lIdx}
                  >
                    <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-bold font-mono text-[#1B5E20] text-xs">
                      {num}
                    </span>
                    <span className="leading-relaxed">
                      {renderInlineFormatting(itemText)}
                    </span>
                  </li>
                );
              })}
            </ol>
          );
        }

        // Regular Paragraph
        return (
          <p
            className={`text-slate-800 text-xs leading-relaxed sm:text-sm ${alignClass}`}
            key={pIdx}
          >
            {lines.map((l, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInlineFormatting(l)}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// --- MINIMALIST WYSIWYG ARTICLE EDITOR COMPONENT ---
interface MinimalArticleEditorProps {
  value: string;
  onChange: (htmlContent: string) => void;
  title?: string;
}

function MinimalArticleEditor({ value, onChange }: MinimalArticleEditorProps) {
  const { showToast } = useToast();
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
  const [currentStyle, setCurrentStyle] = useState<string>('p');
  const [activeAlign, setActiveAlign] = useState<
    'left' | 'center' | 'right' | 'justify'
  >('left');
  const [showSyariahMenu, setShowSyariahMenu] = useState<boolean>(false);
  // Kanvas kosong: tampilkan petunjuk sebagai overlay, bukan sebagai isi.
  const [isCanvasEmpty, setIsCanvasEmpty] = useState<boolean>(true);

  // History for Undo / Redo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUpdatingRef = useRef<boolean>(false);
  const lastSyncedValueRef = useRef<string | null>(null);

  // Initialize editor content or sync when external value changes
  useEffect(() => {
    if (
      editorRef.current &&
      !isUpdatingRef.current &&
      lastSyncedValueRef.current !== value
    ) {
      lastSyncedValueRef.current = value;
      const initialHtml = convertContentToDocHtml(value);
      if (editorRef.current.innerHTML !== initialHtml) {
        editorRef.current.innerHTML = initialHtml;
      }
      setIsCanvasEmpty(isHtmlBlank(initialHtml));
      setHistory((prev) => (prev.length === 0 ? [initialHtml] : prev));
      setHistoryIndex((prev) => (prev === -1 ? 0 : prev));
    }
  }, [value]);

  /**
   * The edit/preview toggle below unmounts the `contentEditable` div (no
   * `key`, but different `dangerouslySetInnerHTML` props force React to
   * replace rather than patch it) — a fresh, empty node every time "Tulis"
   * is re-entered. Without this, the sync effect above skips re-populating
   * it (`lastSyncedValueRef.current` already equals `value`), leaving the
   * canvas either blank or, once the user resumes typing, showing content
   * appended after invisible leftover nodes — the "duplicate text" report.
   */
  useEffect(() => {
    if (editorMode === 'preview') {
      lastSyncedValueRef.current = null;
    }
  }, [editorMode]);

  // Sync internal innerHTML back to parent
  const handleContentInput = () => {
    if (!editorRef.current) {
      return;
    }
    // Editor yang dikosongkan meninggalkan "<br>"/"<p></p>": simpan sebagai ''.
    const html = normalizeArticleHtml(editorRef.current.innerHTML);
    setIsCanvasEmpty(html === '');
    isUpdatingRef.current = true;
    lastSyncedValueRef.current = html;
    onChange(html);

    // Save history
    setHistory((prev) => {
      const newHist = prev.slice(0, Math.max(0, historyIndex + 1));
      newHist.push(html);
      if (newHist.length > 40) {
        newHist.shift();
      }
      return newHist;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 39));

    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 50);
  };

  const executeCommand = (command: string, arg?: string) => {
    if (editorMode === 'preview') {
      setEditorMode('edit');
    }
    document.execCommand(command, false, arg);
    if (editorRef.current) {
      editorRef.current.focus();
      handleContentInput();
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0 && editorRef.current) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      editorRef.current.innerHTML = prev;
      setIsCanvasEmpty(isHtmlBlank(prev));
      onChange(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && editorRef.current) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      editorRef.current.innerHTML = next;
      setIsCanvasEmpty(isHtmlBlank(next));
      onChange(next);
    }
  };

  const handleFormatStyle = (tag: string) => {
    setCurrentStyle(tag);
    if (tag === 'p') {
      executeCommand('formatBlock', '<p>');
    } else if (tag === 'h1') {
      executeCommand('formatBlock', '<h1>');
    } else if (tag === 'h2') {
      executeCommand('formatBlock', '<h2>');
    } else if (tag === 'h3') {
      executeCommand('formatBlock', '<h3>');
    } else if (tag === 'blockquote') {
      executeCommand('formatBlock', '<blockquote>');
    }
  };

  const handleAlignment = (align: 'left' | 'center' | 'right' | 'justify') => {
    setActiveAlign(align);
    if (align === 'left') {
      executeCommand('justifyLeft');
    } else if (align === 'center') {
      executeCommand('justifyCenter');
    } else if (align === 'right') {
      executeCommand('justifyRight');
    } else if (align === 'justify') {
      executeCommand('justifyFull');
    }
  };

  const insertCustomHtmlBlock = (
    htmlBlock: string,
    notificationTitle: string
  ) => {
    if (editorMode === 'preview') {
      setEditorMode('edit');
    }
    executeCommand('insertHTML', htmlBlock);
    setShowSyariahMenu(false);
    showToast({
      title: notificationTitle,
      description: 'Format materi syariah berhasil disisipkan.',
      type: 'success',
    });
  };

  const handleInsertLink = () => {
    const url = prompt('Masukkan tautan URL (contoh: https://bwi.go.id):');
    if (url) {
      executeCommand('createLink', url);
    }
  };

  const handleClearFormat = () => {
    executeCommand('removeFormat');
  };

  /**
   * Word/Google Docs paste carries inline `style` on every element (fonts,
   * colors, exact pixel spacing) — `document.execCommand('paste')`'s default
   * behavior keeps it verbatim. Reusing `sanitizeRichHtml` here strips
   * `style` (and every other non-allow-listed tag/attribute) the same way it
   * already does for saved content, so a pasted Word doc can't reintroduce
   * the messy markup finding 5 is about.
   */
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeRichHtml(html));
    } else {
      document.execCommand(
        'insertText',
        false,
        event.clipboardData.getData('text/plain')
      );
    }
    handleContentInput();
  };

  // Stats calculation
  const rawText = value
    ? value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  const charCount = rawText.length;
  const wordCount = rawText ? rawText.split(/\s+/).length : 0;
  const readTimeEst = Math.max(1, Math.ceil((wordCount || 1) / 180));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/10">
      {/* 1. MINIMALIST SINGLE-ROW TOOLBAR */}
      <div className="flex select-none flex-wrap items-center justify-between gap-2 border-slate-200 border-b bg-slate-50/80 p-2 text-slate-700 sm:p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {/* Undo & Redo */}
          <button
            className="cursor-pointer rounded-lg p-1.5 text-slate-600 transition hover:bg-white hover:shadow-xs disabled:opacity-30"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            title="Urungkan (Ctrl+Z)"
            type="button"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            className="cursor-pointer rounded-lg p-1.5 text-slate-600 transition hover:bg-white hover:shadow-xs disabled:opacity-30"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            title="Ulangi (Ctrl+Y)"
            type="button"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Style Selector */}
          <SelectField
            onChange={(e) => handleFormatStyle(e.target.value)}
            value={currentStyle}
          >
            <option value="p">Teks Normal</option>
            <option value="h1">Judul Bab (H1)</option>
            <option value="h2">Sub-Bab (H2)</option>
            <option value="h3">Poin Bahasan (H3)</option>
            <option value="blockquote">Kutipan / Quote</option>
          </SelectField>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Inline Formatting: Bold, Italic, Underline, Strike */}
          <div className="flex items-center gap-0.5">
            <button
              className="cursor-pointer rounded-lg p-1.5 font-bold text-slate-800 transition hover:bg-white hover:shadow-xs"
              onClick={() => executeCommand('bold')}
              title="Tebal (Ctrl+B)"
              type="button"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              className="cursor-pointer rounded-lg p-1.5 text-slate-800 italic transition hover:bg-white hover:shadow-xs"
              onClick={() => executeCommand('italic')}
              title="Miring (Ctrl+I)"
              type="button"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              className="cursor-pointer rounded-lg p-1.5 text-slate-800 transition hover:bg-white hover:shadow-xs"
              onClick={() => executeCommand('underline')}
              title="Garis Bawah (Ctrl+U)"
              type="button"
            >
              <Underline className="h-4 w-4" />
            </button>
            <button
              className="cursor-pointer rounded-lg p-1.5 text-slate-800 transition hover:bg-white hover:shadow-xs"
              onClick={() => executeCommand('strikeThrough')}
              title="Coretan"
              type="button"
            >
              <Strikethrough className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Alignment */}
          <div className="flex items-center gap-0.5">
            <button
              className={`cursor-pointer rounded-lg p-1.5 transition ${
                activeAlign === 'left'
                  ? 'bg-white font-bold text-[#1B5E20] shadow-xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
              onClick={() => handleAlignment('left')}
              title="Rata Kiri"
              type="button"
            >
              <AlignLeft className="h-4 w-4" />
            </button>
            <button
              className={`cursor-pointer rounded-lg p-1.5 transition ${
                activeAlign === 'center'
                  ? 'bg-white font-bold text-[#1B5E20] shadow-xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
              onClick={() => handleAlignment('center')}
              title="Rata Tengah"
              type="button"
            >
              <AlignCenter className="h-4 w-4" />
            </button>
            <button
              className={`cursor-pointer rounded-lg p-1.5 transition ${
                activeAlign === 'right'
                  ? 'bg-white font-bold text-[#1B5E20] shadow-xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
              onClick={() => handleAlignment('right')}
              title="Rata Kanan"
              type="button"
            >
              <AlignRight className="h-4 w-4" />
            </button>
            <button
              className={`cursor-pointer rounded-lg p-1.5 transition ${
                activeAlign === 'justify'
                  ? 'bg-white font-bold text-[#1B5E20] shadow-xs'
                  : 'text-slate-600 hover:bg-white'
              }`}
              onClick={() => handleAlignment('justify')}
              title="Rata Justify"
              type="button"
            >
              <AlignJustify className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Lists & Link */}
          <div className="flex items-center gap-0.5">
            <button
              className="cursor-pointer rounded-lg p-1.5 text-slate-700 transition hover:bg-white hover:shadow-xs"
              onClick={() => executeCommand('insertUnorderedList')}
              title="Daftar Butir (• List)"
              type="button"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              className="cursor-pointer rounded-lg p-1.5 text-slate-700 transition hover:bg-white hover:shadow-xs"
              onClick={() => executeCommand('insertOrderedList')}
              title="Daftar Angka (1, 2, 3)"
              type="button"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <button
              className="cursor-pointer rounded-lg p-1.5 text-slate-700 transition hover:bg-white hover:shadow-xs"
              onClick={handleInsertLink}
              title="Sisipkan Tautan Web"
              type="button"
            >
              <Link2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Syariah Quick Preset Dropdown */}
          <div className="relative">
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-[#1B5E20] text-xs transition hover:bg-emerald-100"
              onClick={() => setShowSyariahMenu(!showSyariahMenu)}
              title="Sisipkan Kotak Catatan"
              type="button"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Sisipkan Kotak Catatan</span>
            </button>

            {showSyariahMenu && (
              <div className="fade-in zoom-in-95 absolute top-8 left-0 z-30 w-72 animate-in space-y-1 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 text-xs shadow-xl">
                <button
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-emerald-50"
                  onClick={() =>
                    insertCustomHtmlBlock(
                      `<div class="my-4 p-4 bg-emerald-50/90 border-l-4 border-[#1B5E20] rounded-r-xl text-emerald-950 not-italic space-y-1"><div class="flex items-center gap-1.5 font-bold text-[#1B5E20] text-xs"><span>🕋 Rujukan Fiqih &amp; Dalil Syariah</span></div><p class="italic text-xs sm:text-sm text-slate-800 leading-relaxed">"Perumpamaan orang yang menafkahkan hartanya di jalan Allah adalah serupa dengan sebutir benih..." (QS. Al-Baqarah: 261)</p></div><p><br></p>`,
                      'Kotak Dalil Syariah'
                    )
                  }
                  type="button"
                >
                  <span className="rounded-md bg-emerald-100 p-1.5 text-[#1B5E20]">
                    🕋
                  </span>
                  <div>
                    <div className="font-bold text-slate-900">
                      Kotak Kutipan Ayat / Hadits
                    </div>
                    <div className="text-xs text-slate-500">
                      Kutipan ayat &amp; hadits sahih berlatar hijau
                    </div>
                  </div>
                </button>

                <button
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-amber-50"
                  onClick={() =>
                    insertCustomHtmlBlock(
                      `<div class="my-4 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-950 space-y-1"><div class="font-bold text-xs text-amber-900">📜 Rujukan Fatwa &amp; Regulasi</div><p class="text-xs text-slate-700">1. Fatwa DSN-MUI No. XX/DSN-MUI/2026<br/>2. Peraturan BWI No. 01 Tahun 2020 tentang Nazhir Profesional.</p></div><p><br></p>`,
                      'Rujukan Fatwa'
                    )
                  }
                  type="button"
                >
                  <span className="rounded-md bg-amber-100 p-1.5 text-amber-800">
                    📜
                  </span>
                  <div>
                    <div className="font-bold text-slate-900">
                      Fatwa DSN-MUI & Regulasi
                    </div>
                    <div className="text-xs text-slate-500">
                      Box dasar hukum formal dan nomor fatwa
                    </div>
                  </div>
                </button>

                <button
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-blue-50"
                  onClick={() =>
                    insertCustomHtmlBlock(
                      `<div class="my-4 p-3.5 bg-blue-50/90 border-l-4 border-blue-600 rounded-r-xl text-blue-950 space-y-1"><div class="font-bold text-xs text-blue-900">💡 Catatan Penting Nazhir / Amil</div><p class="text-xs text-slate-700 leading-relaxed">Pastikan akad wakalah ditegakkan secara transparan dan alokasi hak operasional amil tidak melampaui batas syar'i 12.5%.</p></div><p><br></p>`,
                      'Catatan Nazhir'
                    )
                  }
                  type="button"
                >
                  <span className="rounded-md bg-blue-100 p-1.5 text-blue-800">
                    💡
                  </span>
                  <div>
                    <div className="font-bold text-slate-900">
                      Catatan Nazhir / Amil
                    </div>
                    <div className="text-xs text-slate-500">
                      Peringatan kepatuhan & transparansi
                    </div>
                  </div>
                </button>

                <button
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left transition hover:bg-slate-100"
                  onClick={() =>
                    insertCustomHtmlBlock(
                      `<hr class="my-5 border-slate-200" /><p><br></p>`,
                      'Garis Pembatas'
                    )
                  }
                  type="button"
                >
                  <span className="rounded-md bg-slate-100 p-1.5 text-slate-700">
                    ➖
                  </span>
                  <div>
                    <div className="font-bold text-slate-900">
                      Garis Pembatas (Divider)
                    </div>
                    <div className="text-xs text-slate-500">
                      Pemisah bagian bab
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            className="ml-0.5 cursor-pointer rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-rose-600"
            onClick={handleClearFormat}
            title="Bersihkan Format Teks"
            type="button"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </div>

        {/* Right side: Mode Switch (Tulis / Pratinjau) & Counter */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 font-mono text-xs text-slate-400 sm:flex">
            <span>{wordCount} kata</span>
            <span>•</span>
            <span>~{readTimeEst} mnt</span>
          </div>

          <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5">
            <button
              className={`flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-bold text-xs transition ${
                editorMode === 'edit'
                  ? 'bg-white text-[#1B5E20] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setEditorMode('edit')}
              type="button"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Tulis</span>
            </button>
            <button
              className={`flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-bold text-xs transition ${
                editorMode === 'preview'
                  ? 'bg-white text-[#1B5E20] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setEditorMode('preview')}
              type="button"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Pratinjau</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MINIMALIST WRITING CANVAS */}
      <div className="relative min-h-[300px] bg-white p-5 sm:p-7">
        {editorMode === 'edit' && isCanvasEmpty && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute top-5 right-5 left-5 font-sans text-slate-400 text-sm leading-relaxed sm:top-7 sm:right-7 sm:left-7 sm:text-base"
          >
            Mulai ketik materi edukasi fiqih, rujukan hadits, dan panduan
            syariah di sini...
          </p>
        )}
        {editorMode === 'edit' ? (
          <div
            aria-label="Isi artikel"
            aria-multiline="true"
            className="google-docs-content min-h-[260px] space-y-3 font-sans text-slate-800 text-sm leading-relaxed outline-none sm:text-base"
            contentEditable
            key="editor-canvas-edit"
            onInput={handleContentInput}
            onPaste={handlePaste}
            ref={editorRef}
            role="textbox"
            suppressContentEditableWarning
          />
        ) : (
          <div
            className="min-h-[260px] space-y-3 font-sans text-slate-800 text-sm leading-relaxed sm:text-base"
            key="editor-canvas-preview"
          >
            {renderRichArticleContent(value)}
          </div>
        )}
      </div>

      {/* 3. MINIMAL FOOTER BAR */}
      <div className="flex items-center justify-between border-slate-100 border-t bg-slate-50/50 px-5 py-2 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span>Editor Aktif • Tersinkronisasi Otomatis</span>
        </span>
        <span className="font-mono">{charCount} karakter</span>
      </div>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dipulihkan 1:1 dari origin/awan (PR #28) — memecah fungsi ini berisiko mengubah struktur komponen
export function EducationManagementView() {
  const { showToast } = useToast();
  const { kategori } = useSearch({ from: '/admin/edukasi' });

  // Primary Active Tab: 'articles' | 'videos'
  const [mainTab, setMainTab] = useState<'articles' | 'videos'>(
    kategori === 'video' ? 'videos' : 'articles'
  );

  // Sub Views for Articles: 'list' | 'create' | 'quiz_manager' | 'discussion' | 'analytics'
  const [articleSubView, setArticleSubView] = useState<
    'list' | 'create' | 'quiz_manager' | 'discussion'
  >('list');

  // Sub Views for Videos: 'list' | 'upload_link' | 'discussion'
  const [videoSubView, setVideoSubView] = useState<
    'list' | 'upload_link' | 'discussion'
  >('list');

  // Articles & Videos State
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [videosError, setVideosError] = useState<string | null>(null);

  // Header stats — agregasi riil (COUNT/SUM), terpisah dari daftar artikel
  // & video di atas.
  const [educationStats, setEducationStats] = useState({
    totalArtikel: 0,
    totalVideo: 0,
    totalLike: 0,
  });

  const fetchEducationStats = async () => {
    try {
      setEducationStats(await getAdminEducationStats());
    } catch (_err) {
      // Header tetap menampilkan 0 saat backend gagal.
    }
  };

  const fetchEducationCategories = async () => {
    try {
      const [articleRows, videoRows] = await Promise.all([
        getAdminEducationCategories('article'),
        getAdminEducationCategories('video'),
      ]);
      setArticleCategories(articleRows.map((c) => c.name));
      setVideoCategories(videoRows.map((c) => c.name));
      setCategoryIdByName({
        articles: Object.fromEntries(articleRows.map((c) => [c.name, c.id])),
        videos: Object.fromEntries(videoRows.map((c) => [c.name, c.id])),
      });
    } catch (_err) {
      // Daftar kategori tetap kosong bila backend gagal; tidak ada nilai bawaan.
    }
  };

  // Video edukasi punya tabel & router khusus (`education_videos`), terpisah
  // dari `education_contents`/`admin.cms` yang cuma menaungi artikel.
  /** Id konten yang sudah disukai admin ini; gagal → kosong (daftar tetap tampil). */
  const fetchLikedIds = async (
    contentType: 'article' | 'video'
  ): Promise<Set<string>> => {
    try {
      const { data } = await orpc.education.likes.mine({ contentType });
      return new Set(data);
    } catch {
      return new Set();
    }
  };

  const fetchEducationVideos = async () => {
    try {
      const [rows, likedIds] = await Promise.all([
        getAdminEducationVideos(),
        fetchLikedIds('video'),
      ]);
      setVideos(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.categoryName || 'Tanpa Kategori',
          sourceType: row.sourceType === 'upload' ? 'upload' : 'link',
          videoUrl: row.videoUrl,
          thumbnailUrl: row.thumbnailUrl,
          speaker: row.speaker || 'Tim Edukasi Amwal',
          duration: '-', // ponytail: schema tidak menyimpan durasi
          description: row.description || '',
          publishDate: new Date(row.createdAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          status: row.status === 'draft' ? 'draft' : 'published',
          likesCount: row.likesCount,
          isLikedByUser: likedIds.has(row.id),
          viewsCount: 0,
          discussions: [],
        }))
      );
      setVideosError(null);
    } catch (err) {
      // Daftar yang sudah ada dipertahankan; galat ditampilkan beserta tombol
      // "Coba Lagi" (dulu senyap sehingga tampak seperti daftar kosong).
      setVideosError(describeRpcError(err, 'Daftar video gagal dimuat.'));
    }
  };

  // Artikel edukasi punya tabel & router khusus (`education_articles` +
  // `education_quiz_questions`), terpisah dari `admin.cms`/`education_contents`
  // yang menaungi konten CMS lama non-edukasi.
  const fetchEducationArticles = async () => {
    try {
      const [rows, likedIds] = await Promise.all([
        getAdminEducationArticles(),
        fetchLikedIds('article'),
      ]);
      setArticles(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.categoryName || 'Tanpa Kategori',
          coverImage: row.coverImageUrl || '',
          content: row.content,
          summary: articleTeaser(row.content),
          author: row.authorName,
          publishDate: new Date(row.createdAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          status: row.status === 'draft' ? 'draft' : 'published',
          likesCount: row.likesCount,
          isLikedByUser: likedIds.has(row.id),
          viewsCount: 0,
          readTime: `${Math.max(2, Math.ceil(row.content.split(' ').length / 150))} mnt`,
          quiz: [],
          quizCount: row.quizQuestionsCount,
          discussions: [],
        }))
      );
      setArticlesError(null);
    } catch (err) {
      setArticlesError(describeRpcError(err, 'Daftar artikel gagal dimuat.'));
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: pemuatan sekali saat mount; fungsi-fungsi ini dibuat ulang tiap render sehingga memasukkannya ke daftar dependensi akan memicu pemanggilan berulang tanpa henti
  useEffect(() => {
    fetchEducationArticles();
    fetchEducationVideos();
    fetchEducationStats();
    fetchEducationCategories();
  }, []);

  // Selected item for Quiz / Discussion / Preview
  const [selectedArticleId, setSelectedArticleId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [previewArticle, setPreviewArticle] = useState<ArticleItem | null>(
    null
  );
  const [previewVideo, setPreviewVideo] = useState<VideoItem | null>(null);

  // Custom confirm dialog terpadu (menggantikan window.confirm) untuk aksi
  // hapus video maupun artikel.
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'video' | 'article';
    id: string;
    title: string;
  } | null>(null);

  const handleConfirmDelete = () => {
    if (!deleteConfirm) {
      return;
    }
    if (deleteConfirm.type === 'video') {
      handleDeleteVideo(deleteConfirm.id, deleteConfirm.title);
    } else {
      handleDeleteArticle(deleteConfirm.id, deleteConfirm.title);
    }
    setDeleteConfirm(null);
  };

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Dynamic Category Management (Admin can add, edit, and delete categories)
  const [articleCategories, setArticleCategories] = useState<string[]>([]);
  // name -> id, dipakai handler edit/hapus untuk memanggil backend; hanya
  // untuk keperluan itu — daftar tampilan tetap array nama string di atas
  // supaya seluruh dropdown/filter yang sudah ada tidak perlu diubah.
  const [categoryIdByName, setCategoryIdByName] = useState<{
    articles: Record<string, string>;
    videos: Record<string, string>;
  }>({ articles: {}, videos: {} });

  const [videoCategories, setVideoCategories] = useState<string[]>([]);

  // Modal Category Management State
  // Pintasan dari Master Data (`?kategori=`) langsung membuka pengelola kategori.
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(
    Boolean(kategori)
  );
  const [categoryModalTab, setCategoryModalTab] = useState<
    'articles' | 'videos'
  >(kategori === 'video' ? 'videos' : 'articles');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<
    number | null
  >(null);
  const [editingCategoryText, setEditingCategoryText] = useState<string>('');

  // Inline Quick Add Category State
  const [showInlineAddCategory, setShowInlineAddCategory] = useState<
    'article' | 'video_link' | null
  >(null);
  const [inlineCategoryInput, setInlineCategoryInput] = useState('');

  // Form State: Create Article
  const [uploadedImageFileName, setUploadedImageFileName] =
    useState<string>('');
  const [articleForm, setArticleForm] = useState<{
    title: string;
    category: string;
    coverImage: string;
    content: string;
    author: string;
    quiz: QuizQuestion[];
  }>({
    title: '',
    category: 'Fiqih Wakaf',
    coverImage: '',
    content: '',
    author: 'Super Admin Edukasi Amwal',
    quiz: [],
  });
  const hasArticleDraft =
    articleSubView === 'create' &&
    Boolean(articleForm.title.trim() || articleForm.content.trim());
  /** `null` = membuat artikel baru; berisi id = form ini sedang mengedit artikel itu. */
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);

  // Draf artikel disimpan ke sessionStorage selama form diisi/diubah, supaya
  // refresh yang tak disengaja tidak membuang tulisan dan kuisnya (UAT #4).
  type ArticleDraft = {
    editingId: string | null;
    form: typeof articleForm;
  };
  const { isDirty: isArticleFormDirty } = useDirtyGuard({
    open: articleSubView === 'create',
    value: {
      ...articleForm,
      coverImage: articleForm.coverImage.length,
      editingArticleId,
    },
    onClose: () => undefined,
  });
  const articleDraftRef = useRef<ArticleDraft>({
    editingId: null,
    form: articleForm,
  });
  articleDraftRef.current = {
    editingId: editingArticleId,
    form: {
      ...articleForm,
      coverImage: articleForm.coverImage.startsWith('data:')
        ? ''
        : articleForm.coverImage,
    },
  };
  const articleDraftJson = JSON.stringify(articleDraftRef.current);
  // biome-ignore lint/correctness/useExhaustiveDependencies: articleDraftJson mewakili isi draf terbaru (dibaca lewat ref)
  useEffect(() => {
    if (!(articleSubView === 'create' && isArticleFormDirty)) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeDraft(
        ARTICLE_DRAFT_KEY,
        articleDraftRef.current,
        articleForm.coverImage.startsWith('data:')
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [articleDraftJson, articleSubView, isArticleFormDirty]);

  const [articleDraftOffer, setArticleDraftOffer] =
    useState<StoredDraft<ArticleDraft> | null>(null);
  useEffect(() => {
    setArticleDraftOffer(readDraft<ArticleDraft>(ARTICLE_DRAFT_KEY));
  }, []);

  const restoreArticleDraft = () => {
    if (!articleDraftOffer) {
      return;
    }
    setArticleForm(articleDraftOffer.value.form);
    setEditingArticleId(articleDraftOffer.value.editingId);
    setArticleSubView('create');
    setArticleDraftOffer(null);
  };

  const discardArticleDraft = () => {
    clearDraft(ARTICLE_DRAFT_KEY);
    setArticleDraftOffer(null);
  };

  // Quiz Builder within Article Creation Form
  const [showArticleQuizBuilder, setShowArticleQuizBuilder] = useState(false);
  const [articleQuizQuestion, setArticleQuizQuestion] = useState('');
  const [articleQuizOptions, setArticleQuizOptions] = useState<string[]>([
    '',
    '',
    '',
    '',
  ]);
  const [articleQuizCorrectIndex, setArticleQuizCorrectIndex] =
    useState<number>(0);
  const [articleQuizExplanation, setArticleQuizExplanation] = useState('');
  const [editingArticleQuizIndex, setEditingArticleQuizIndex] = useState<
    number | null
  >(null);

  // Form State: Upload Video Link
  const [videoLinkUploadedImageName, setVideoLinkUploadedImageName] =
    useState<string>('');
  const [videoLinkForm, setVideoLinkForm] = useState({
    title: '',
    category: 'Webinar Wakaf',
    speaker: '',
    description: '',
    videoUrl: '',
    thumbnailUrl: '',
  });
  // Thumbnail YouTube otomatis ikut URL selama user belum mengunggah/menautkan
  // gambar kustomnya sendiri.
  const [videoLinkThumbnailAuto, setVideoLinkThumbnailAuto] = useState(true);

  // Form State: Edit Video Modal
  const [editingVideo, setEditingVideo] = useState<VideoItem | null>(null);
  const [editingVideoForm, setEditingVideoForm] = useState({
    id: '',
    title: '',
    category: 'Kajian Fiqih',
    speaker: '',
    videoUrl: '',
    thumbnailUrl: '',
    description: '',
  });
  const [isUpdatingVideo, setIsUpdatingVideo] = useState(false);
  const [isSavingArticle, setIsSavingArticle] = useState(false);
  const [isPublishingVideo, setIsPublishingVideo] = useState(false);
  const [quizScoreModalData, setQuizScoreModalData] = useState<{
    totalQuestions: number;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!quizScoreModalData) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuizScoreModalData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quizScoreModalData]);
  // Quiz Builder State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<string[]>(['', '', '', '']);
  const [correctOptIndex, setCorrectOptIndex] = useState<number>(0);
  const [newExplanation, setNewExplanation] = useState('');
  const [newPoints, setNewPoints] = useState<number>(25);

  // New Discussion Reply State
  const [replyText, setReplyText] = useState('');
  const [videoCommentTimestamp, setVideoCommentTimestamp] = useState('00:00');

  // Selected Article & Video Objects
  const currentArticle =
    articles.find((a) => a.id === selectedArticleId) || articles[0];
  const currentVideo =
    videos.find((v) => v.id === selectedVideoId) || videos[0];

  // Handlers for Articles
  const addArticleQuizOption = () =>
    setArticleQuizOptions((prev) =>
      prev.length < MAX_QUIZ_OPTIONS ? [...prev, ''] : prev
    );

  const removeArticleQuizOption = (index: number) => {
    if (articleQuizOptions.length <= MIN_QUIZ_OPTIONS) {
      return;
    }
    setArticleQuizOptions((prev) => prev.filter((_, i) => i !== index));
    // Kunci jawaban ikut bergeser; bila opsi kuncinya yang dihapus, kembali ke A.
    setArticleQuizCorrectIndex((current) => {
      if (current === index) {
        return 0;
      }
      return current > index ? current - 1 : current;
    });
  };

  const handleSaveQuizInArticleForm = () => {
    if (
      !articleQuizQuestion.trim() ||
      articleQuizOptions.some((opt) => !opt.trim())
    ) {
      showToast({
        title: 'Soal Kuis Belum Lengkap',
        description:
          'Pertanyaan dan semua opsi jawaban yang tampil wajib diisi. Hapus opsi yang tidak dipakai (minimal 2 opsi).',
        type: 'error',
      });
      return;
    }

    const questionObj: QuizQuestion = {
      id:
        editingArticleQuizIndex !== null &&
        articleForm.quiz[editingArticleQuizIndex]
          ? articleForm.quiz[editingArticleQuizIndex].id
          : `q-art-${Date.now()}`,
      question: articleQuizQuestion.trim(),
      options: articleQuizOptions.map((text, idx) => ({
        id: `opt-${idx}`,
        text: text.trim(),
      })),
      correctOptionId: `opt-${articleQuizCorrectIndex}`,
      explanation:
        articleQuizExplanation.trim() ||
        'Kunci jawaban sesuai kaidah fiqih syariah.',
      points: 0, // ponytail: bobot dihitung dinamis (100 / total soal) saat ditampilkan, tidak disimpan per-soal
    };

    const updatedQuiz = [...articleForm.quiz];
    if (editingArticleQuizIndex !== null) {
      updatedQuiz[editingArticleQuizIndex] = questionObj;
      showToast({
        title: 'Soal Kuis Diperbarui',
        description: 'Perubahan pada butir soal kuis berhasil disimpan.',
        type: 'success',
      });
    } else {
      updatedQuiz.push(questionObj);
      showToast({
        title: 'Soal Kuis Ditambahkan',
        description:
          'Butir soal kuis pilihan ganda berhasil ditambahkan ke artikel.',
        type: 'success',
      });
    }

    setArticleForm((prev) => ({ ...prev, quiz: updatedQuiz }));
    // Reset quiz inputs
    setArticleQuizQuestion('');
    setArticleQuizOptions(['', '', '', '']);
    setArticleQuizCorrectIndex(0);
    setArticleQuizExplanation('');
    setEditingArticleQuizIndex(null);
    setShowArticleQuizBuilder(false);
  };

  const handleEditQuizInArticleForm = (index: number) => {
    const q = articleForm.quiz[index];
    if (!q) {
      return;
    }
    setArticleQuizQuestion(q.question);
    setArticleQuizOptions(q.options.map((o) => o.text));
    const correctIdx = q.options.findIndex((o) => o.id === q.correctOptionId);
    setArticleQuizCorrectIndex(correctIdx >= 0 ? correctIdx : 0);
    setArticleQuizExplanation(q.explanation || '');
    setEditingArticleQuizIndex(index);
    setShowArticleQuizBuilder(true);
  };

  const handleDeleteQuizInArticleForm = (index: number) => {
    const updated = articleForm.quiz.filter((_, i) => i !== index);
    setArticleForm((prev) => ({ ...prev, quiz: updated }));
    showToast({
      title: 'Soal Kuis Dihapus',
      description: 'Butir soal telah dihapus dari artikel.',
      type: 'info',
    });
  };

  // Daftar hanya membawa jumlah soal; pratinjau memuat artikel lengkap (dengan kuis).
  const openArticlePreview = async (art: ArticleItem) => {
    try {
      const full = await getAdminEducationArticle(art.id);
      setPreviewArticle({
        ...art,
        content: full.content,
        quiz: quizQuestionsFromPayload(full.quiz),
      });
    } catch (err: unknown) {
      showToast({
        title: 'Gagal Memuat Pratinjau',
        description: describeRpcError(err, 'Artikel tidak dapat dimuat.'),
        type: 'error',
      });
    }
  };

  const handleStartEditArticle = async (id: string) => {
    try {
      const article = await getAdminEducationArticle(id);
      const categoryName =
        Object.entries(categoryIdByName.articles).find(
          ([, catId]) => catId === article.categoryId
        )?.[0] ?? articleCategories[0];

      setArticleForm({
        title: article.title,
        category: categoryName,
        coverImage: article.coverImageUrl || '',
        content: article.content,
        author: article.authorName,
        quiz: quizQuestionsFromPayload(article.quiz),
      });
      setEditingArticleId(id);
      setArticleSubView('create');
    } catch (err: unknown) {
      showToast({
        title: 'Gagal Memuat Artikel',
        description:
          (err instanceof Error && err.message) ||
          'Terjadi kesalahan saat memuat data artikel untuk diedit.',
        type: 'error',
      });
    }
  };

  const resetArticleForm = () => {
    clearDraft(ARTICLE_DRAFT_KEY);
    setArticleForm({
      title: '',
      category: 'Fiqih Wakaf',
      coverImage: '',
      content: '',
      author: 'Super Admin Edukasi Amwal',
      quiz: [],
    });
    setEditingArticleId(null);
    setArticleQuizQuestion('');
    setArticleQuizOptions(['', '', '', '']);
    setArticleQuizCorrectIndex(0);
    setArticleQuizExplanation('');
    setEditingArticleQuizIndex(null);
    setShowArticleQuizBuilder(false);
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingArticle) {
      return;
    }
    setIsSavingArticle(true);
    try {
      await saveArticle();
    } finally {
      setIsSavingArticle(false);
    }
  };

  const saveArticle = async () => {
    if (!(articleForm.title.trim() && articleForm.content.trim())) {
      showToast({
        title: 'Form Belum Lengkap',
        description: 'Judul dan isi artikel edukasi wajib diisi.',
        type: 'error',
      });
      return;
    }

    const categoryId = categoryIdByName.articles[articleForm.category];
    const payload = {
      title: articleForm.title.trim(),
      categoryId: categoryId ?? null,
      coverImageUrl: articleForm.coverImage || undefined,
      authorName: articleForm.author || undefined,
      content: articleForm.content.trim(),
      quiz: quizQuestionsToPayload(articleForm.quiz),
    };

    try {
      const saved = editingArticleId
        ? await updateAdminEducationArticle(editingArticleId, payload)
        : await createAdminEducationArticle(payload);

      const savedArticle: ArticleItem = {
        id: saved.id,
        title: saved.title,
        category: articleForm.category,
        coverImage: saved.coverImageUrl || '',
        content: saved.content,
        summary: articleTeaser(saved.content),
        author: saved.authorName,
        publishDate: new Date(saved.createdAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        status: 'published',
        likesCount: saved.likesCount,
        isLikedByUser: false,
        viewsCount: 0,
        readTime: `${Math.max(2, Math.ceil(saved.content.split(' ').length / 150))} mnt`,
        quiz: articleForm.quiz,
        quizCount: articleForm.quiz.length,
        discussions: [],
      };

      setArticles((prev) =>
        editingArticleId
          ? prev.map((art) =>
              art.id === editingArticleId ? savedArticle : art
            )
          : [savedArticle, ...prev]
      );
      setArticleSubView('list');
      fetchEducationStats();
      showToast({
        title: editingArticleId
          ? 'Artikel Edukasi Berhasil Diperbarui'
          : 'Artikel Edukasi Berhasil Diterbitkan',
        description: `Artikel "${articleForm.title.slice(0, 35)}..." beserta ${articleForm.quiz.length} soal kuis telah disimpan ke database.`,
        type: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Gagal Menyimpan Artikel',
        description: describeRpcError(err, 'Terjadi kesalahan saat menyimpan.'),
        type: 'error',
      });
      return;
    }

    resetArticleForm();
  };

  const handleDeleteArticle = async (id: string, title: string) => {
    try {
      await deleteAdminEducationArticle(id);
      setArticles((prev) => prev.filter((art) => art.id !== id));
      fetchEducationStats();
      showToast({
        title: 'Artikel Dihapus',
        description: `Artikel "${title}" telah dihapus permanen.`,
        type: 'info',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menghapus Artikel',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  const handleToggleArticleLike = async (articleId: string) => {
    try {
      const { data } = await orpc.education.likes.toggle({
        contentType: 'article',
        contentId: articleId,
      });
      setArticles((prev) =>
        prev.map((art) =>
          art.id === articleId
            ? { ...art, isLikedByUser: data.liked, likesCount: data.likesCount }
            : art
        )
      );
      fetchEducationStats();
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menyimpan Suka',
        description: describeRpcError(error, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  // Handlers for Quiz
  const handleOpenQuizManager = (article: ArticleItem) => {
    setSelectedArticleId(article.id);
    setQuizQuestions(article.quiz || []);
    setArticleSubView('quiz_manager');
  };

  const handleAddQuizQuestion = () => {
    if (!newQuestionText.trim() || newOptions.some((opt) => !opt.trim())) {
      showToast({
        title: 'Soal Kuis Belum Lengkap',
        description:
          'Pertanyaan dan keempat opsi jawaban (A, B, C, D) wajib diisi.',
        type: 'error',
      });
      return;
    }

    const questionId = `q-${Date.now()}`;
    const questionObj: QuizQuestion = {
      id: questionId,
      question: newQuestionText,
      options: newOptions.map((text, idx) => ({
        id: `opt-${idx}`,
        text: text.trim(),
      })),
      correctOptionId: `opt-${correctOptIndex}`,
      explanation: newExplanation || 'Kunci jawaban sesuai kaidah fiqih.',
      points: newPoints || 25,
    };

    const updatedQuestions = [...quizQuestions, questionObj];
    setQuizQuestions(updatedQuestions);

    // Save to article
    setArticles((prev) =>
      prev.map((a) =>
        a.id === selectedArticleId ? { ...a, quiz: updatedQuestions } : a
      )
    );

    // Reset Quiz Form
    setNewQuestionText('');
    setNewOptions(['', '', '', '']);
    setCorrectOptIndex(0);
    setNewExplanation('');
    setNewPoints(25);

    showToast({
      title: 'Soal Kuis Ditambahkan',
      description: 'Pertanyaan pilihan ganda berhasil ditautkan ke artikel.',
      type: 'success',
    });
  };

  const handleDeleteQuizQuestion = (qId: string) => {
    const updated = quizQuestions.filter((q) => q.id !== qId);
    setQuizQuestions(updated);
    setArticles((prev) =>
      prev.map((a) =>
        a.id === selectedArticleId ? { ...a, quiz: updated } : a
      )
    );
    showToast({
      title: 'Soal Dihapus',
      description: 'Butir soal kuis pilihan ganda telah dihapus.',
      type: 'info',
    });
  };

  // Handlers for Category Management (Article & Video) — CRUD nyata ke
  // `education_categories` (filter `type`); state array nama di atas hanya
  // untuk dropdown/filter yang sudah ada, id sebenarnya dilacak via
  // `categoryIdByName`.
  const handleAddCategory = async (
    type: 'articles' | 'videos',
    name: string
  ) => {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast({
        title: 'Nama Kategori Kosong',
        description: 'Tuliskan nama kategori edukasi yang valid.',
        type: 'error',
      });
      return;
    }

    const list = type === 'articles' ? articleCategories : videoCategories;
    if (list.some((cat) => cat.toLowerCase() === trimmed.toLowerCase())) {
      showToast({
        title: 'Kategori Sudah Terdaftar',
        description: `Kategori "${trimmed}" sudah ada di dalam daftar.`,
        type: 'info',
      });
      return;
    }

    try {
      const created = await createAdminEducationCategory(
        trimmed,
        type === 'articles' ? 'article' : 'video'
      );

      if (type === 'articles') {
        setArticleCategories((prev) => [...prev, trimmed]);
        setArticleForm((prev) => ({ ...prev, category: trimmed }));
        setCategoryIdByName((prev) => ({
          ...prev,
          articles: { ...prev.articles, [trimmed]: created.id },
        }));
      } else {
        setVideoCategories((prev) => [...prev, trimmed]);
        setVideoLinkForm((prev) => ({ ...prev, category: trimmed }));
        setCategoryIdByName((prev) => ({
          ...prev,
          videos: { ...prev.videos, [trimmed]: created.id },
        }));
      }

      setNewCategoryName('');
      setShowInlineAddCategory(null);
      setInlineCategoryInput('');
      showToast({
        title: 'Kategori Berhasil Dibuat',
        description: `Kategori baru "${trimmed}" kini aktif dan dapat digunakan.`,
        type: 'success',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Membuat Kategori',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  const handleUpdateCategory = async (
    type: 'articles' | 'videos',
    index: number,
    newName: string
  ) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }

    const oldName =
      type === 'articles' ? articleCategories[index] : videoCategories[index];
    const categoryId = categoryIdByName[type][oldName];
    if (!categoryId) {
      showToast({
        title: 'Kategori Contoh Belum Tersimpan',
        description:
          'Kategori bawaan ini belum ada di database — buat kategori baru untuk mengaktifkan edit/hapus.',
        type: 'error',
      });
      return;
    }

    try {
      await updateAdminEducationCategory(categoryId, trimmed);

      if (type === 'articles') {
        const updated = [...articleCategories];
        updated[index] = trimmed;
        setArticleCategories(updated);
        setArticles((prev) =>
          prev.map((art) =>
            art.category === oldName ? { ...art, category: trimmed } : art
          )
        );
        if (articleForm.category === oldName) {
          setArticleForm((prev) => ({ ...prev, category: trimmed }));
        }
      } else {
        const updated = [...videoCategories];
        updated[index] = trimmed;
        setVideoCategories(updated);
        setVideos((prev) =>
          prev.map((vid) =>
            vid.category === oldName ? { ...vid, category: trimmed } : vid
          )
        );
        if (videoLinkForm.category === oldName) {
          setVideoLinkForm((prev) => ({ ...prev, category: trimmed }));
        }
      }

      setCategoryIdByName((prev) => {
        const next = { ...prev[type] };
        delete next[oldName];
        next[trimmed] = categoryId;
        return { ...prev, [type]: next };
      });

      setEditingCategoryIndex(null);
      setEditingCategoryText('');
      showToast({
        title: 'Kategori Diperbarui',
        description: `Nama kategori berhasil diubah menjadi "${trimmed}".`,
        type: 'success',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Memperbarui Kategori',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  const handleDeleteCategory = async (
    type: 'articles' | 'videos',
    index: number
  ) => {
    const list = type === 'articles' ? articleCategories : videoCategories;
    if (list.length <= 1) {
      showToast({
        title: 'Tidak Dapat Dihapus',
        description: 'Minimal harus ada 1 kategori edukasi aktif.',
        type: 'error',
      });
      return;
    }

    const removedName = list[index];
    const categoryId = categoryIdByName[type][removedName];
    if (!categoryId) {
      showToast({
        title: 'Kategori Contoh Belum Tersimpan',
        description:
          'Kategori bawaan ini belum ada di database — buat kategori baru untuk mengaktifkan edit/hapus.',
        type: 'error',
      });
      return;
    }

    const confirmed = await confirmAction({
      title: 'Hapus Kategori?',
      description: `Kategori "${removedName}" akan dihapus.`,
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminEducationCategory(categoryId);

      const updated = list.filter((_, i) => i !== index);
      if (type === 'articles') {
        setArticleCategories(updated);
        if (articleForm.category === removedName) {
          setArticleForm((prev) => ({ ...prev, category: updated[0] }));
        }
      } else {
        setVideoCategories(updated);
        if (videoLinkForm.category === removedName) {
          setVideoLinkForm((prev) => ({ ...prev, category: updated[0] }));
        }
      }
      setCategoryIdByName((prev) => {
        const next = { ...prev[type] };
        delete next[removedName];
        return { ...prev, [type]: next };
      });

      showToast({
        title: 'Kategori Dihapus',
        description: `Kategori "${removedName}" telah dihapus.`,
        type: 'info',
      });
    } catch (error: unknown) {
      // Guardrail backend: kategori masih dipakai artikel/video aktif.
      showToast({
        title: 'Kategori Masih Digunakan',
        description:
          (error instanceof Error && error.message) ||
          'Kategori ini masih dipakai dan tidak dapat dihapus',
        type: 'error',
      });
    }
  };

  // Handlers for Video Thumbnail Upload (File picker / Drag & drop)
  const handleVideoThumbnailUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast({
        title: 'Format Berkas Salah',
        description: 'Pilih berkas gambar berekstensi JPG, PNG, atau WebP.',
        type: 'error',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast({
        title: 'Ukuran Gambar Terlalu Besar',
        description: 'Maksimal ukuran berkas gambar thumbnail adalah 5 MB.',
        type: 'error',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setVideoLinkForm((prev) => ({ ...prev, thumbnailUrl: dataUrl }));
      setVideoLinkUploadedImageName(file.name);
      setVideoLinkThumbnailAuto(false);
      showToast({
        title: 'Thumbnail Berhasil Diunggah',
        description: `Berkas "${file.name}" diterapkan sebagai sampul video.`,
        type: 'success',
      });
    };
    reader.readAsDataURL(file);
  };

  // Handlers for Video
  const publishVideo = async (
    form: {
      title: string;
      category: string;
      speaker: string;
      description: string;
      thumbnailUrl: string;
    },
    videoUrl: string
  ): Promise<VideoItem> => {
    const categoryId = categoryIdByName.videos[form.category];
    const created = await createAdminEducationVideo({
      title: form.title,
      categoryId: categoryId ?? null,
      videoUrl,
      speaker: form.speaker || undefined,
      thumbnailUrl: form.thumbnailUrl || undefined,
      description: form.description || undefined,
    });

    return {
      id: created.id,
      title: created.title,
      category: form.category,
      sourceType: 'link',
      videoUrl: created.videoUrl,
      thumbnailUrl: created.thumbnailUrl,
      speaker: created.speaker || 'Tim Ahli Fiqih Amwal',
      duration: '-', // ponytail: schema tidak menyimpan durasi
      description: created.description || '',
      publishDate: new Date(created.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      status: 'published',
      likesCount: created.likesCount,
      isLikedByUser: false,
      viewsCount: 0,
      discussions: [],
    };
  };

  const handleOpenEditVideo = (vid: VideoItem) => {
    setEditingVideo(vid);
    setEditingVideoForm({
      id: vid.id,
      title: vid.title,
      category: vid.category,
      speaker: vid.speaker || '',
      // Video berkas lama tidak punya tautan YouTube: kosongkan agar admin menggantinya.
      videoUrl: vid.sourceType === 'upload' ? '' : vid.videoUrl,
      thumbnailUrl: vid.thumbnailUrl,
      description: vid.description || '',
    });
  };

  const handleCloseEditVideo = () => {
    setEditingVideo(null);
  };

  const handleSaveEditVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideoForm.title.trim()) {
      showToast({
        title: 'Judul Wajib Diisi',
        description: 'Masukkan judul materi video kajian.',
        type: 'error',
      });
      return;
    }

    try {
      setIsUpdatingVideo(true);
      const targetVideoUrl = editingVideoForm.videoUrl;
      const youtubeId = parseYoutubeVideoId(targetVideoUrl);

      if (!youtubeId) {
        showToast({
          title: 'Tautan YouTube Tidak Valid',
          description:
            'Tempel tautan video YouTube (youtube.com/watch?v=... atau youtu.be/...).',
          type: 'error',
        });
        return;
      }

      const categoryId =
        categoryIdByName.videos[editingVideoForm.category] ?? null;

      await updateAdminEducationVideo({
        id: editingVideoForm.id,
        title: editingVideoForm.title.trim(),
        categoryId,
        speaker: editingVideoForm.speaker.trim(),
        authorName: editingVideoForm.speaker.trim(),
        videoUrl: targetVideoUrl.trim(),
        thumbnailUrl:
          editingVideoForm.thumbnailUrl.trim() ||
          youtubeThumbnailUrl(youtubeId),
        description: editingVideoForm.description.trim(),
      });

      setVideos((prev) =>
        prev.map((vid) =>
          vid.id === editingVideoForm.id
            ? {
                ...vid,
                title: editingVideoForm.title.trim(),
                category: editingVideoForm.category,
                speaker: editingVideoForm.speaker.trim() || 'Tim Edukasi Amwal',
                sourceType: 'link',
                videoUrl: targetVideoUrl.trim(),
                thumbnailUrl:
                  editingVideoForm.thumbnailUrl.trim() ||
                  youtubeThumbnailUrl(youtubeId),
                description: editingVideoForm.description.trim(),
              }
            : vid
        )
      );

      fetchEducationVideos();
      handleCloseEditVideo();

      showToast({
        title: 'Sukses',
        description: 'Video kajian berhasil diperbarui',
        type: 'success',
      });
    } catch (err: unknown) {
      showToast({
        title: 'Gagal Memperbarui Video',
        description: describeRpcError(
          err,
          'Terjadi kesalahan saat memperbarui data video.'
        ),
        type: 'error',
      });
    } finally {
      setIsUpdatingVideo(false);
    }
  };

  const handleUploadVideoLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublishingVideo) {
      return;
    }
    setIsPublishingVideo(true);
    try {
      await publishVideoLink();
    } finally {
      setIsPublishingVideo(false);
    }
  };

  const publishVideoLink = async () => {
    if (!videoLinkForm.title.trim()) {
      showToast({
        title: 'Judul Video Wajib Diisi',
        description: 'Masukkan judul materi video edukasi.',
        type: 'error',
      });
      return;
    }
    if (!parseYoutubeVideoId(videoLinkForm.videoUrl)) {
      showToast({
        title: 'Tautan YouTube Tidak Valid',
        description:
          'Tempel tautan video YouTube (youtube.com/watch?v=... atau youtu.be/...).',
        type: 'error',
      });
      return;
    }

    try {
      const newVideo = await publishVideo(
        videoLinkForm,
        videoLinkForm.videoUrl
      );
      setVideos((prev) => [newVideo, ...prev]);
      setVideoSubView('list');
      setVideoLinkForm((prev) => ({
        ...prev,
        title: '',
        speaker: '',
        description: '',
        videoUrl: '',
        thumbnailUrl: '',
      }));
      setVideoLinkUploadedImageName('');
      setVideoLinkThumbnailAuto(true);
      fetchEducationStats();
      showToast({
        title: 'Video Edukasi Berhasil Diterbitkan',
        description: 'Video streaming berhasil disematkan ke katalog edukasi.',
        type: 'success',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menerbitkan Video',
        description: describeRpcError(error, 'Terjadi kesalahan sistem'),
        type: 'error',
      });
    }
  };

  const handleToggleVideoLike = async (videoId: string) => {
    try {
      const { data } = await orpc.education.likes.toggle({
        contentType: 'video',
        contentId: videoId,
      });
      setVideos((prev) =>
        prev.map((vid) =>
          vid.id === videoId
            ? { ...vid, isLikedByUser: data.liked, likesCount: data.likesCount }
            : vid
        )
      );
      fetchEducationStats();
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menyimpan Suka',
        description: describeRpcError(error, 'Silakan coba lagi.'),
        type: 'error',
      });
    }
  };

  const handleDeleteVideo = async (videoId: string, title: string) => {
    try {
      await deleteAdminEducationVideo(videoId);
      setVideos((prev) => prev.filter((vid) => vid.id !== videoId));
      fetchEducationStats();
      showToast({
        title: 'Video Dihapus',
        description: `Video "${title}" telah dihapus permanen.`,
        type: 'info',
      });
    } catch (error: unknown) {
      showToast({
        title: 'Gagal Menghapus Video',
        description:
          (error instanceof Error && error.message) ||
          'Terjadi kesalahan sistem',
        type: 'error',
      });
    }
  };

  // Discussion Add Comment Handler
  const handleAddDiscussionReply = (
    targetType: 'article' | 'video',
    targetId: string
  ) => {
    if (!replyText.trim()) {
      return;
    }

    const newComment: DiscussionComment = {
      id: `comm-${Date.now()}`,
      authorName: 'Super Admin Amwal (Asatidz Hub)',
      authorRole: 'Admin',
      avatarText: 'SA',
      comment: replyText.trim(),
      timestamp: 'Baru saja',
      likes: 0,
      status: 'approved',
      videoTimestamp:
        targetType === 'video' ? videoCommentTimestamp : undefined,
    };

    if (targetType === 'article') {
      setArticles((prev) =>
        prev.map((art) => {
          if (art.id === targetId) {
            return {
              ...art,
              discussions: [newComment, ...art.discussions],
            };
          }
          return art;
        })
      );
    } else {
      setVideos((prev) =>
        prev.map((vid) => {
          if (vid.id === targetId) {
            return {
              ...vid,
              discussions: [newComment, ...vid.discussions],
            };
          }
          return vid;
        })
      );
    }

    setReplyText('');
    showToast({
      title: 'Tanggapan Terkirim',
      description:
        'Komentar jawaban admin telah dipublikasikan di forum diskusi.',
      type: 'success',
    });
  };

  // Filtered lists
  const filteredArticles = articles.filter((art) => {
    const matchSearch =
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory =
      selectedCategory === 'all' || art.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  const filteredVideos = videos.filter((vid) => {
    const matchSearch =
      vid.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vid.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vid.speaker.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory =
      selectedCategory === 'all' || vid.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Kelola artikel fiqih, kuis pilihan ganda interaktif, siaran video kajian, serta moderasi diskusi tanya-jawab jamaah dalam satu arsitektur terintegrasi."
        icon={<GraduationCap aria-hidden="true" />}
        title="Manajemen Edukasi &amp; Quiz"
      >
        {/* Quick Metrics — agregasi riil (COUNT/SUM) via admin.education.stats */}
        <div className="mt-5 grid max-w-md grid-cols-3 gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 text-center">
          <div className="px-3 py-1">
            <div className="font-medium text-emerald-100 text-xs">
              Total Artikel
            </div>
            <div className="font-black font-mono text-lg text-white">
              {educationStats.totalArtikel}
            </div>
          </div>
          <div className="border-white/20 border-x px-3 py-1">
            <div className="font-medium text-emerald-100 text-xs">
              Total Video
            </div>
            <div className="font-black font-mono text-lg text-white">
              {educationStats.totalVideo}
            </div>
          </div>
          <div className="px-3 py-1">
            <div className="font-medium text-emerald-100 text-xs">
              Total Like
            </div>
            <div className="font-black font-mono text-lg text-white">
              {educationStats.totalLike}
            </div>
          </div>
        </div>
      </AdminPageHeader>

      <AdminTabs
        label="Modul edukasi"
        onChange={(tab) => {
          // Kembali dari tab lain TIDAK boleh membuang formulir yang sedang
          // diisi (UAT admin: progres artikel hilang saat pindah ke "modul
          // video"); hanya klik pada tab aktif yang kembali ke daftar.
          if (tab === mainTab) {
            if (tab === 'articles') {
              setArticleSubView('list');
            } else {
              setVideoSubView('list');
            }
          }
          setMainTab(tab);
        }}
        tabs={[
          {
            id: 'articles',
            label: 'Modul Artikel',
            icon: <BookOpen className="h-4 w-4" />,
            count: articles.length,
            badge: hasArticleDraft ? (
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-xs text-amber-800"
                role="status"
              >
                Draf belum disimpan
              </span>
            ) : undefined,
          },
          {
            id: 'videos',
            label: 'Modul Video',
            icon: <Video className="h-4 w-4" />,
            count: videos.length,
          },
        ]}
        value={mainTab}
      />

      {/* Action CTA depending on active mainTab */}
      <div className="-mt-3 mb-6 flex flex-wrap items-center justify-end gap-2">
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2.5 font-bold text-slate-800 text-xs shadow-2xs transition hover:bg-slate-200"
          onClick={() => {
            setCategoryModalTab(mainTab === 'articles' ? 'articles' : 'videos');
            setShowCategoryModal(true);
          }}
          title="Kelola & Edit Daftar Kategori Edukasi"
          type="button"
        >
          <Settings2 className="h-4 w-4 text-slate-600" />
          <span>Kelola Kategori</span>
        </button>

        {mainTab === 'articles' ? (
          <>
            {articleSubView !== 'list' && (
              <button
                className="cursor-pointer rounded-xl bg-slate-100 px-3.5 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                onClick={() => {
                  resetArticleForm();
                  setArticleSubView('list');
                }}
                type="button"
              >
                ← Kembali ke List Artikel
              </button>
            )}
            {articleSubView === 'list' && (
              <button
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#1B5E20] px-4 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716]"
                onClick={() => {
                  resetArticleForm();
                  setArticleSubView('create');
                }}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Buat Artikel Baru
              </button>
            )}
          </>
        ) : (
          <>
            {videoSubView !== 'list' && (
              <button
                className="cursor-pointer rounded-xl bg-slate-100 px-3.5 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                onClick={() => setVideoSubView('list')}
                type="button"
              >
                ← Kembali ke List Video
              </button>
            )}
            {videoSubView === 'list' && (
              <div className="flex items-center gap-2">
                <button
                  className="flex cursor-pointer items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-red-700"
                  onClick={() => setVideoSubView('upload_link')}
                  type="button"
                >
                  <Youtube className="h-4 w-4" />
                  Sematkan Video YouTube
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: ARTIKEL (List, Buat Artikel, Quiz, Diskusi, Like)              */}
      {/* ========================================================================= */}
      {mainTab === 'articles' && (
        <div className="space-y-6">
          {articleSubView === 'list' && articleDraftOffer && (
            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 text-sm"
              role="status"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <strong>Ditemukan draf artikel yang belum disimpan.</strong>{' '}
                {articleDraftOffer.value.form.title
                  ? `"${articleDraftOffer.value.form.title}", `
                  : ''}
                {articleDraftOffer.value.form.quiz.length} soal kuis, disimpan
                pukul{' '}
                {new Date(articleDraftOffer.savedAt).toLocaleTimeString(
                  'id-ID',
                  { hour: '2-digit', minute: '2-digit' }
                )}
                . Pulihkan?
                {articleDraftOffer.hadFiles &&
                  ' Gambar sampul perlu diunggah ulang.'}
              </span>
              <button
                className="cursor-pointer rounded-lg bg-[#1B5E20] px-3.5 py-1.5 font-bold text-white hover:bg-[#144716]"
                onClick={restoreArticleDraft}
                type="button"
              >
                Pulihkan
              </button>
              <button
                className="cursor-pointer rounded-lg border border-amber-400 bg-white px-3.5 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
                onClick={discardArticleDraft}
                type="button"
              >
                Buang
              </button>
            </div>
          )}
          {articleSubView === 'list' && articlesError && (
            <LoadErrorBanner
              message={articlesError}
              onRetry={fetchEducationArticles}
            />
          )}
          {/* Search & Filter Bar for Articles */}
          {articleSubView === 'list' && (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:flex-row">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Daftar Artikel Edukasi ({filteredArticles.length})</span>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-slate-800 text-xs placeholder-slate-400 focus:border-[#1B5E20] focus:bg-white"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari judul artikel/kategori/penulis..."
                    type="text"
                    value={searchQuery}
                  />
                </div>
                <SelectField
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  value={selectedCategory}
                >
                  <option value="all">
                    Semua Kategori ({articleCategories.length})
                  </option>
                  {articleCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>
          )}

          {/* VIEW: LIST ARTIKEL */}
          {articleSubView === 'list' &&
            (filteredArticles.length === 0 ? (
              <div
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 border-dashed bg-white py-16 text-center ${articlesError ? 'hidden' : ''}`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-sm">
                    Belum Ada Artikel Diterbitkan
                  </p>
                  <p className="text-slate-500 text-xs">
                    Artikel edukasi yang diterbitkan lewat "Buat Artikel Baru"
                    akan muncul di sini.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredArticles.map((art) => (
                  <div
                    className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition hover:shadow-md"
                    key={art.id}
                  >
                    {/* Article Thumbnail */}
                    <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                      {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                      <img
                        alt={art.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        onError={handleCoverImageError}
                        src={art.coverImage || ARTICLE_COVER_PLACEHOLDER}
                      />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className="rounded-lg bg-slate-900/80 px-2.5 py-1 font-bold text-xs text-white uppercase backdrop-blur-xs">
                          {art.category}
                        </span>
                      </div>
                    </div>

                    {/* Body Content */}
                    <div className="flex flex-1 flex-col justify-between space-y-4 p-5">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                          <span>{art.publishDate}</span>
                          <span>•</span>
                          <span>{art.author}</span>
                        </div>
                        <h3 className="line-clamp-2 font-bold text-slate-900 text-sm leading-snug transition hover:text-[#1B5E20]">
                          {art.title}
                        </h3>
                        <p className="line-clamp-2 text-slate-500 text-xs leading-relaxed">
                          {art.summary}
                        </p>
                      </div>

                      {/* Meta stats: Like, Quiz */}
                      <div className="flex items-center justify-between border-slate-100 border-t pt-3 text-slate-500 text-xs">
                        <span
                          className="flex items-center gap-1 font-bold text-rose-700"
                          title="Jumlah Suka"
                        >
                          <Heart className="h-3 w-3 fill-rose-600" />{' '}
                          {art.likesCount}
                        </span>

                        {art.quizCount > 0 ? (
                          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-xs text-amber-900">
                            <HelpCircle className="h-2.5 w-2.5" />
                            {art.quizCount} Soal Kuis
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Tanpa Kuis
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          className="flex cursor-pointer items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 py-1.5 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                          onClick={() => openArticlePreview(art)}
                          type="button"
                        >
                          <Eye className="h-3 w-3" />
                          Baca
                        </button>
                        <button
                          className="flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1.5 font-bold text-emerald-700 text-xs transition hover:bg-emerald-100"
                          onClick={() => handleStartEditArticle(art.id)}
                          type="button"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          className="flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 font-bold text-rose-700 text-xs transition hover:bg-rose-100"
                          onClick={() =>
                            setDeleteConfirm({
                              type: 'article',
                              id: art.id,
                              title: art.title,
                            })
                          }
                          type="button"
                        >
                          <Trash2 className="h-3 w-3" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* VIEW: BUAT ARTIKEL (Form Gambar, Judul, Kategori, Isi, Kuis) */}
          {articleSubView === 'create' && (
            <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-bold text-lg text-slate-900">
                    {editingArticleId
                      ? 'Edit Artikel Edukasi'
                      : 'Formulir Pembuatan Artikel Edukasi Baru'}
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Lengkapi thumbnail ilustrasi, judul, kategori fiqih, isi
                    materi materi, serta rancang kuis interaktif pemahaman
                    jamaah.
                  </p>
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleCreateArticle}>
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Kolom Kiri: Banner / Sampul Ilustrasi */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-700 text-xs">
                      Banner / Gambar Ilustrasi Artikel{' '}
                      <span className="font-normal text-slate-400">
                        (Opsional)
                      </span>
                    </label>
                    <div className="group relative aspect-video overflow-hidden rounded-xl border-2 border-slate-300 border-dashed bg-slate-50 transition hover:border-[#1B5E20]">
                      {articleForm.coverImage ? (
                        <>
                          {/* biome-ignore lint/performance/noImgElement: mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                          <img
                            alt="Pratinjau Banner Artikel"
                            className="h-full w-full object-cover"
                            onError={handleCoverImageError}
                            src={articleForm.coverImage}
                          />
                          <button
                            className="absolute top-2 right-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-slate-900/80 text-white shadow-xs transition hover:bg-rose-600"
                            onClick={() => {
                              setArticleForm((prev) => ({
                                ...prev,
                                coverImage: '',
                              }));
                              setUploadedImageFileName('');
                            }}
                            title="Hapus / Ganti Gambar"
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center p-4 text-center">
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[#1B5E20] transition group-hover:scale-110">
                            <Upload className="h-5 w-5" />
                          </div>
                          <span className="font-bold text-slate-700 text-xs">
                            Pilih atau seret gambar sampul ke sini (Opsional)
                          </span>
                          <span className="mt-0.5 text-xs text-slate-400">
                            PNG, JPG, WebP - Maks. 5MB, Rekomendasi 16:9
                          </span>
                          <input
                            accept="image/png, image/jpeg, image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 5 * 1024 * 1024) {
                                  showToast({
                                    title: 'File Terlalu Besar',
                                    description:
                                      'Ukuran file gambar maksimal 5 MB.',
                                    type: 'error',
                                  });
                                  return;
                                }
                                setUploadedImageFileName(file.name);
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const dataUrl = event.target
                                    ?.result as string;
                                  setArticleForm({
                                    ...articleForm,
                                    coverImage: dataUrl,
                                  });
                                  showToast({
                                    title: 'Gambar Berhasil Diunggah',
                                    description: `File "${file.name}" siap digunakan sebagai banner artikel.`,
                                    type: 'success',
                                  });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            type="file"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Kolom Kanan: Informasi Inti Artikel */}
                  <div className="space-y-4">
                    {/* Judul Artikel */}
                    <div className="space-y-1.5">
                      <label
                        className="block font-bold text-slate-700 text-xs"
                        htmlFor="educationmanagement-f2928"
                      >
                        Judul Artikel Edukasi{' '}
                        <span className="text-rose-500">*</span>
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 font-semibold text-slate-900 text-sm focus:border-[#1B5E20] focus:bg-white"
                        id="educationmanagement-f2928"
                        onChange={(e) =>
                          setArticleForm({
                            ...articleForm,
                            title: e.target.value,
                          })
                        }
                        placeholder="Contoh: Panduan Fiqih Wakaf Saham & Sukuk Produktif untuk Generasi Muda..."
                        required
                        type="text"
                        value={articleForm.title}
                      />
                    </div>

                    {/* Kategori */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label
                          className="block font-bold text-slate-700 text-xs"
                          htmlFor="edu-article-category"
                        >
                          Kategori Fiqih / Topik{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="flex cursor-pointer items-center gap-1 font-bold text-[#1B5E20] text-xs hover:underline"
                            onClick={() => {
                              setShowInlineAddCategory(
                                showInlineAddCategory === 'article'
                                  ? null
                                  : 'article'
                              );
                              setInlineCategoryInput('');
                            }}
                            type="button"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Kategori Baru</span>
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            className="cursor-pointer font-semibold text-xs text-slate-500 hover:text-slate-800"
                            onClick={() => {
                              setCategoryModalTab('articles');
                              setShowCategoryModal(true);
                            }}
                            type="button"
                          >
                            Kelola List
                          </button>
                        </div>
                      </div>

                      {/* Inline Quick Add Category Input */}
                      {showInlineAddCategory === 'article' && (
                        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-2">
                          <input
                            autoFocus
                            className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-slate-900 text-xs focus:outline-hidden"
                            onChange={(e) =>
                              setInlineCategoryInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCategory(
                                  'articles',
                                  inlineCategoryInput
                                );
                              }
                            }}
                            placeholder="Nama kategori baru..."
                            type="text"
                            value={inlineCategoryInput}
                          />
                          <button
                            className="cursor-pointer rounded-lg bg-[#1B5E20] px-3 py-1.5 font-bold text-white text-xs hover:bg-[#144716]"
                            onClick={() =>
                              handleAddCategory('articles', inlineCategoryInput)
                            }
                            type="button"
                          >
                            Simpan
                          </button>
                          <button
                            className="cursor-pointer px-2 py-1.5 font-bold text-slate-400 text-xs hover:text-slate-700"
                            onClick={() => {
                              setShowInlineAddCategory(null);
                              setInlineCategoryInput('');
                            }}
                            type="button"
                          >
                            Batal
                          </button>
                        </div>
                      )}

                      <SelectField
                        className="w-full"
                        id="edu-article-category"
                        onChange={(e) =>
                          setArticleForm({
                            ...articleForm,
                            category: e.target.value,
                          })
                        }
                        value={articleForm.category}
                      >
                        {articleCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </SelectField>
                    </div>

                    {/* Penulis */}
                    <div className="space-y-1.5">
                      <label
                        className="block font-bold text-slate-700 text-xs"
                        htmlFor="educationmanagement-f3259"
                      >
                        Nama Penulis / Asatidz
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-slate-800 text-xs"
                        id="educationmanagement-f3259"
                        onChange={(e) =>
                          setArticleForm({
                            ...articleForm,
                            author: e.target.value,
                          })
                        }
                        type="text"
                        value={articleForm.author}
                      />
                    </div>
                  </div>
                </div>

                {/* Isi Lengkap Artikel Edukasi with Minimalist WYSIWYG Editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: dipulihkan 1:1 dari origin/awan (PR #28) — label ini menaungi satu GRUP kontrol (toggle unggah/tautan, preset, editor), bukan satu kontrol tunggal; perbaikan sebenarnya butuh fieldset/legend yang mengubah DOM */}
                    <label className="block font-bold text-slate-800 text-xs">
                      Isi Dokumen Materi Edukasi{' '}
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="font-medium text-xs text-slate-400">
                      Editor Teks Minimalis (Poin, Format, Perataan &amp; Dalil
                      Fiqih)
                    </span>
                  </div>

                  <MinimalArticleEditor
                    onChange={(val) =>
                      setArticleForm((prev) => ({ ...prev, content: val }))
                    }
                    title={articleForm.title || 'Materi Edukasi Syariah'}
                    value={articleForm.content}
                  />
                </div>

                {/* ========================================================================= */}
                {/* FITUR QUIZ: PEMBUATAN & PENGATURAN KUIS ARTIKEL                          */}
                {/* ========================================================================= */}
                <div
                  className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/90 p-5 sm:p-6"
                  id="article-quiz-section"
                >
                  <div className="flex flex-col justify-between gap-3 border-slate-200/80 border-b pb-3.5 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-extrabold text-xs text-amber-900">
                          <HelpCircle className="h-3.5 w-3.5" />
                          Kuis Interaktif Pemahaman Materi
                        </span>
                        <span className="font-bold font-mono text-slate-500 text-xs">
                          {articleForm.quiz.length} Butir Soal Terpasang
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500 text-xs">
                        Sertakan pertanyaan pilihan ganda untuk menguji
                        pemahaman syariah jamaah setelah membaca artikel ini.
                      </p>
                    </div>

                    {/* Tombol Buat Kuis & Distribusi Skor */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 font-bold text-[#1B5E20] text-xs shadow-2xs transition hover:bg-emerald-100"
                        onClick={() => {
                          setQuizScoreModalData({
                            totalQuestions: articleForm.quiz.length,
                            title: articleForm.title || 'Artikel Edukasi Baru',
                          });
                        }}
                        type="button"
                      >
                        <HelpCircle className="h-3.5 w-3.5 text-[#1B5E20]" />
                        <span>Lihat Distribusi Skor / XP</span>
                      </button>
                      <button
                        className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-2xs transition hover:bg-[#144716]"
                        onClick={() => {
                          if (showArticleQuizBuilder) {
                            setShowArticleQuizBuilder(false);
                            setEditingArticleQuizIndex(null);
                          } else {
                            setArticleQuizQuestion('');
                            setArticleQuizOptions(['', '', '', '']);
                            setArticleQuizCorrectIndex(0);
                            setArticleQuizExplanation('');
                            setEditingArticleQuizIndex(null);
                            setShowArticleQuizBuilder(true);
                          }
                        }}
                        type="button"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>
                          {showArticleQuizBuilder
                            ? 'Tutup Form Soal'
                            : 'Buat Soal Kuis'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Form Tambah/Edit Soal Kuis */}
                  {showArticleQuizBuilder && (
                    <div className="fade-in zoom-in-95 animate-in space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-center justify-between border-slate-100 border-b pb-2.5">
                        <h4 className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          {editingArticleQuizIndex !== null
                            ? `Edit Butir Soal #${editingArticleQuizIndex + 1}`
                            : 'Form Pembuatan Soal Kuis Pilihan Ganda'}
                        </h4>
                        <span className="font-mono text-xs text-slate-400">
                          2 sampai 5 Pilihan (A sampai E)
                        </span>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div>
                          <label
                            className="mb-1 block font-bold text-slate-700"
                            htmlFor="educationmanagement-f3419"
                          >
                            Pertanyaan Kuis{' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 font-medium text-slate-900 text-xs focus:border-[#1B5E20] focus:bg-white"
                            id="educationmanagement-f3419"
                            onChange={(e) =>
                              setArticleQuizQuestion(e.target.value)
                            }
                            placeholder="Contoh: Berapa batas persentase maksimal hak operasional Amil dalam fiqih zakat?"
                            type="text"
                            value={articleQuizQuestion}
                          />
                        </div>

                        {/* Opsi jawaban: 2 sampai 5 pilihan */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {articleQuizOptions.map((optionText, idx) => {
                              const letter = QUIZ_OPTION_LETTERS[idx];
                              return (
                                <div className="space-y-1" key={letter}>
                                  <div className="flex items-center justify-between gap-2">
                                    <label
                                      className="font-semibold text-slate-700 text-xs"
                                      htmlFor={`edu-article-quiz-opt-${letter}`}
                                    >
                                      Opsi {letter}
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <label className="flex cursor-pointer items-center gap-1 font-bold text-emerald-800 text-xs">
                                        <input
                                          checked={
                                            articleQuizCorrectIndex === idx
                                          }
                                          className="accent-[#1B5E20]"
                                          name="article_quiz_correct"
                                          onChange={() =>
                                            setArticleQuizCorrectIndex(idx)
                                          }
                                          type="radio"
                                        />
                                        Kunci Jawaban Benar
                                      </label>
                                      {articleQuizOptions.length >
                                        MIN_QUIZ_OPTIONS && (
                                        <button
                                          aria-label={`Hapus opsi ${letter}`}
                                          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                                          onClick={() =>
                                            removeArticleQuizOption(idx)
                                          }
                                          type="button"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <input
                                    className={`w-full rounded-xl border px-3.5 py-2 text-xs transition ${
                                      articleQuizCorrectIndex === idx
                                        ? 'border-emerald-400 bg-emerald-50/80 font-bold text-emerald-950 ring-1 ring-emerald-300'
                                        : 'border-slate-300 bg-white text-slate-800'
                                    }`}
                                    id={`edu-article-quiz-opt-${letter}`}
                                    onChange={(e) => {
                                      const updated = [...articleQuizOptions];
                                      updated[idx] = e.target.value;
                                      setArticleQuizOptions(updated);
                                    }}
                                    placeholder={`Jawaban opsi ${letter}...`}
                                    type="text"
                                    value={optionText}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          {articleQuizOptions.length < MAX_QUIZ_OPTIONS && (
                            <button
                              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 font-bold text-emerald-800 text-xs hover:bg-emerald-50"
                              onClick={addArticleQuizOption}
                              type="button"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Tambah Opsi{' '}
                              {QUIZ_OPTION_LETTERS[articleQuizOptions.length]}
                            </button>
                          )}
                        </div>

                        <div>
                          <label
                            className="mb-1 block font-semibold text-slate-700"
                            htmlFor="educationmanagement-f3476"
                          >
                            Penjelasan Fiqih / Dalil Rujukan Singkat
                          </label>
                          <input
                            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs"
                            id="educationmanagement-f3476"
                            onChange={(e) =>
                              setArticleQuizExplanation(e.target.value)
                            }
                            placeholder="Contoh: Sesuai QS. At-Taubah:60 dan fatwa DSN-MUI batas operasional amil adalah 1/8 (12.5%)."
                            type="text"
                            value={articleQuizExplanation}
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 border-slate-100 border-t pt-2">
                          <button
                            className="cursor-pointer rounded-xl bg-slate-100 px-3.5 py-2 font-semibold text-slate-600 text-xs hover:bg-slate-200"
                            onClick={() => {
                              setShowArticleQuizBuilder(false);
                              setEditingArticleQuizIndex(null);
                            }}
                            type="button"
                          >
                            Batal
                          </button>
                          <button
                            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716]"
                            onClick={handleSaveQuizInArticleForm}
                            type="button"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {editingArticleQuizIndex !== null
                              ? 'Perbarui Soal'
                              : 'Simpan Soal ke Artikel'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Daftar Soal yang Sudah Terpasang pada Form Artikel */}
                  <div className="space-y-2">
                    {articleForm.quiz.length === 0 ? (
                      <div className="rounded-2xl border border-slate-300 border-dashed bg-white/70 p-6 text-center text-slate-400 text-xs">
                        Belum ada soal kuis untuk artikel ini. Klik tombol{' '}
                        <strong>&quot;Buat Soal Kuis&quot;</strong> untuk
                        menyematkan kuis.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {articleForm.quiz.map((q, idx) => (
                          <div
                            className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:p-4"
                            key={q.id || idx}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-xs text-emerald-900">
                                  {idx + 1}
                                </span>
                                <div>
                                  <h5 className="font-bold text-slate-900 text-xs leading-snug sm:text-sm">
                                    {q.question}
                                  </h5>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
                                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">
                                      +
                                      {Math.round(
                                        100 / articleForm.quiz.length
                                      )}{' '}
                                      Poin
                                    </span>
                                    {q.explanation && (
                                      <span className="line-clamp-1 text-slate-600 italic">
                                        Dalil: {q.explanation}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                  onClick={() =>
                                    handleEditQuizInArticleForm(idx)
                                  }
                                  title="Edit Butir Soal"
                                  type="button"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  className="cursor-pointer rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                                  onClick={() =>
                                    handleDeleteQuizInArticleForm(idx)
                                  }
                                  title="Hapus Butir Soal"
                                  type="button"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Opsi Jawaban Preview */}
                            <div className="grid grid-cols-1 gap-2 pt-1 text-xs sm:grid-cols-2">
                              {q.options.map((opt, optIdx) => {
                                const isCorrect =
                                  opt.id === q.correctOptionId ||
                                  `opt-${optIdx}` === q.correctOptionId;
                                const letter =
                                  QUIZ_OPTION_LETTERS[optIdx] || optIdx + 1;
                                return (
                                  <div
                                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
                                      isCorrect
                                        ? 'border-emerald-300 bg-emerald-50 font-bold text-[#1B5E20] ring-1 ring-emerald-200'
                                        : 'border-slate-200 bg-slate-50 text-slate-700'
                                    }`}
                                    key={opt.id || optIdx}
                                  >
                                    <span
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-bold text-[9px] ${
                                        isCorrect
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {letter}
                                    </span>
                                    <span className="flex-1 truncate">
                                      {opt.text}
                                    </span>
                                    {isCorrect && (
                                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 font-extrabold text-[#1B5E20] text-xs">
                                        Kunci
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit CTA */}
                <div className="flex flex-col justify-between gap-3 border-slate-200 border-t pt-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      Artikel siap diterbitkan{' '}
                      {articleForm.quiz.length > 0
                        ? `bersama ${articleForm.quiz.length} soal kuis interaktif`
                        : '(tanpa kuis)'}
                      .
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      className="cursor-pointer rounded-xl bg-slate-100 px-5 py-2.5 font-bold text-slate-700 text-xs hover:bg-slate-200"
                      onClick={() => {
                        resetArticleForm();
                        setArticleSubView('list');
                      }}
                      type="button"
                    >
                      Batal
                    </button>
                    <button
                      className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#1B5E20] px-6 py-2.5 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716] disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={isSavingArticle}
                      type="submit"
                    >
                      {isSavingArticle ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      {isSavingArticle && 'Menyimpan...'}
                      {!isSavingArticle &&
                        (editingArticleId
                          ? 'Simpan Perubahan Artikel'
                          : 'Simpan & Terbitkan Artikel')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* VIEW: MANAJEMEN QUIZ PILIHAN GANDA */}
          {articleSubView === 'quiz_manager' && (
            <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-extrabold text-xs text-amber-900">
                      <HelpCircle className="h-3 w-3" />
                      Kuis Interaktif
                    </span>
                    <span className="font-bold text-slate-400 text-xs">
                      Total: {quizQuestions.length} Butir Soal
                    </span>
                  </div>
                  <h2 className="mt-1 font-bold text-lg text-slate-900">
                    Manajemen Quiz Pilihan Ganda: {currentArticle.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 font-bold text-[#1B5E20] text-xs shadow-2xs transition hover:bg-emerald-100"
                    onClick={() => {
                      setQuizScoreModalData({
                        totalQuestions: quizQuestions.length,
                        title: currentArticle.title,
                      });
                    }}
                    type="button"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-[#1B5E20]" />
                    <span>Lihat Distribusi Skor / XP</span>
                  </button>
                  <SelectField
                    onChange={(e) => {
                      setSelectedArticleId(e.target.value);
                      const target = articles.find(
                        (a) => a.id === e.target.value
                      );
                      setQuizQuestions(target?.quiz || []);
                    }}
                    value={selectedArticleId}
                  >
                    {articles.map((art) => (
                      <option key={art.id} value={art.id}>
                        {art.title.slice(0, 35)}...
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>

              {/* Form Tambah Soal Baru */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <h3 className="flex items-center gap-1.5 font-bold text-slate-900 text-xs uppercase tracking-wider">
                  <Plus className="h-3.5 w-3.5 text-[#1B5E20]" />
                  Tambah Butir Soal Pilihan Ganda
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label
                      className="mb-1 block font-semibold text-slate-700"
                      htmlFor="educationmanagement-f3722"
                    >
                      Pertanyaan Kuis <span className="text-rose-500">*</span>
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-900 text-xs focus:border-[#1B5E20]"
                      id="educationmanagement-f3722"
                      onChange={(e) => setNewQuestionText(e.target.value)}
                      placeholder="Contoh: Berapa batas persentase maksimal hak operasional Amil dalam fiqih zakat?"
                      type="text"
                      value={newQuestionText}
                    />
                  </div>

                  {/* 4 Opsi Jawaban (A, B, C, D) */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {['A', 'B', 'C', 'D'].map((letter, idx) => (
                      <div className="space-y-1" key={letter}>
                        <div className="flex items-center justify-between">
                          <label
                            className="font-semibold text-xs text-slate-700"
                            htmlFor={`edu-quiz-opt-${letter}`}
                          >
                            Opsi {letter}
                          </label>
                          <label className="flex cursor-pointer items-center gap-1 font-bold text-xs text-emerald-800">
                            <input
                              checked={correctOptIndex === idx}
                              className="accent-[#1B5E20]"
                              name="correct_answer"
                              onChange={() => setCorrectOptIndex(idx)}
                              type="radio"
                            />
                            Kunci Jawaban Benar
                          </label>
                        </div>
                        <input
                          className={`w-full rounded-xl border px-3 py-1.5 text-xs ${
                            correctOptIndex === idx
                              ? 'border-emerald-400 bg-emerald-50/70 font-bold text-emerald-950'
                              : 'border-slate-300 bg-white text-slate-800'
                          }`}
                          id={`edu-quiz-opt-${letter}`}
                          onChange={(e) => {
                            const updated = [...newOptions];
                            updated[idx] = e.target.value;
                            setNewOptions(updated);
                          }}
                          placeholder={`Jawaban ${letter}...`}
                          type="text"
                          value={newOptions[idx]}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    <div>
                      <label
                        className="mb-1 block font-semibold text-slate-700"
                        htmlFor="educationmanagement-f3774"
                      >
                        Penjelasan Fiqih / Dalil Rujukan
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs"
                        id="educationmanagement-f3774"
                        onChange={(e) => setNewExplanation(e.target.value)}
                        placeholder="Contoh: Sesuai QS. At-Taubah:60 dan fatwa DSN MUI batas amil adalah 1/8 (12.5%)."
                        type="text"
                        value={newExplanation}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1 block font-semibold text-slate-700"
                        htmlFor="educationmanagement-f3786"
                      >
                        Bobot Poin Soal
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-bold font-mono text-xs"
                        id="educationmanagement-f3786"
                        onChange={(e) =>
                          setNewPoints(
                            Number.parseInt(e.target.value, 10) || 25
                          )
                        }
                        type="number"
                        value={newPoints}
                      />
                    </div>
                  </div>

                  <button
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716]"
                    onClick={handleAddQuizQuestion}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Simpan Soal ke Kuis
                  </button>
                </div>
              </div>

              {/* Daftar Soal yang Sudah Ada */}
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Daftar Soal Kuis Terpasang ({quizQuestions.length})
                </h3>

                {quizQuestions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-300 border-dashed bg-slate-50 p-8 text-center text-slate-400 text-xs">
                    Belum ada soal kuis pada artikel ini. Tambahkan pertanyaan
                    melalui form di atas.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quizQuestions.map((q, qIdx) => (
                      <div
                        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                        key={q.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-black text-[#1B5E20] text-xs">
                              {qIdx + 1}
                            </span>
                            <div>
                              <h4 className="font-bold text-slate-900 text-xs">
                                {q.question}
                              </h4>
                              <div className="mt-0.5 font-mono text-xs text-slate-500">
                                Bobot: {q.points} Poin
                              </div>
                            </div>
                          </div>
                          <button
                            className="cursor-pointer rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
                            onClick={() => handleDeleteQuizQuestion(q.id)}
                            title="Hapus soal ini"
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Opsi List */}
                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = opt.id === q.correctOptionId;
                            return (
                              <div
                                className={`flex items-center justify-between rounded-xl border p-2.5 text-xs ${
                                  isCorrect
                                    ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-950'
                                    : 'border-slate-200 bg-slate-50 text-slate-700'
                                }`}
                                key={opt.id}
                              >
                                <span>
                                  {String.fromCharCode(65 + oIdx)}. {opt.text}
                                </span>
                                {isCorrect && (
                                  <span className="rounded bg-emerald-200 px-1.5 py-0.5 font-extrabold text-[9px] text-emerald-900">
                                    KUNCI
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {q.explanation && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <strong>Penjelasan Syariah:</strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW: DISKUSI PEMBACA ARTIKEL */}
          {articleSubView === 'discussion' && (
            <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-lg text-slate-900">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    Forum Diskusi Jamaah: {currentArticle.title}
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Moderasi tanya jawab syariah dan berikan penjelasan resmi
                    asatidz.
                  </p>
                </div>
                <SelectField
                  onChange={(e) => setSelectedArticleId(e.target.value)}
                  value={selectedArticleId}
                >
                  {articles.map((art) => (
                    <option key={art.id} value={art.id}>
                      {art.title.slice(0, 35)}...
                    </option>
                  ))}
                </SelectField>
              </div>

              {/* Balas Diskusi Baru */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <label
                  className="block font-bold text-slate-800 text-xs"
                  htmlFor="educationmanagement-f3923"
                >
                  Tulis Tanggapan Resmi Super Admin / Asatidz
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 text-xs focus:border-[#1B5E20]"
                    id="educationmanagement-f3923"
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddDiscussionReply('article', selectedArticleId);
                      }
                    }}
                    placeholder="Tuliskan jawaban atau fatwa penjelasan atas diskusi artikel..."
                    type="text"
                    value={replyText}
                  />
                  <button
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716]"
                    onClick={() =>
                      handleAddDiscussionReply('article', selectedArticleId)
                    }
                    type="button"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Kirim
                  </button>
                </div>
              </div>

              {/* Daftar Thread Komentar */}
              <div className="space-y-4">
                {currentArticle.discussions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-300 border-dashed bg-slate-50 p-8 text-center text-slate-400 text-xs">
                    Belum ada diskusi pembaca pada artikel ini.
                  </div>
                ) : (
                  currentArticle.discussions.map((disc) => (
                    <div
                      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                      key={disc.id}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 font-bold text-[#1B5E20] text-xs">
                            {disc.avatarText}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">
                                {disc.authorName}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-xs text-slate-700">
                                {disc.authorRole}
                              </span>
                            </div>
                            <span className="font-mono text-xs text-slate-400">
                              {disc.timestamp}
                            </span>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 font-mono text-slate-500 text-xs">
                          <ThumbsUp className="h-3 w-3 text-slate-400" />{' '}
                          {disc.likes}
                        </span>
                      </div>

                      <p className="pl-9 text-slate-800 text-xs leading-relaxed">
                        {disc.comment}
                      </p>

                      {/* Sub-replies */}
                      {disc.replies && disc.replies.length > 0 && (
                        <div className="ml-9 space-y-2 border-slate-100 border-t pt-2">
                          {disc.replies.map((rep) => (
                            <div
                              className="space-y-1 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-xs"
                              key={rep.id}
                            >
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-bold text-emerald-950">
                                  <ShieldCheck className="h-3.5 w-3.5 text-[#1B5E20]" />
                                  {rep.authorName} ({rep.authorRole})
                                </span>
                                <span className="font-mono text-xs text-emerald-800">
                                  {rep.timestamp}
                                </span>
                              </div>
                              <p className="text-xs text-emerald-900 leading-relaxed">
                                {rep.comment}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: VIDEO (List, Upload Video, Upload Link, Diskusi Video, Like)   */}
      {/* ========================================================================= */}
      {mainTab === 'videos' && (
        <div className="space-y-6">
          {/* Search & Filter Bar for Videos */}
          {videoSubView === 'list' && (
            <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:flex-row">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Katalog Video Edukasi ({filteredVideos.length})</span>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-400" />
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-slate-800 text-xs placeholder-slate-400 focus:border-[#1B5E20] focus:bg-white"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari video / pemateri..."
                    type="text"
                    value={searchQuery}
                  />
                </div>
                <SelectField
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  value={selectedCategory}
                >
                  <option value="all">
                    Semua Kategori ({videoCategories.length})
                  </option>
                  {videoCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>
          )}

          {videoSubView === 'list' && videosError && (
            <LoadErrorBanner
              message={videosError}
              onRetry={fetchEducationVideos}
            />
          )}

          {/* VIEW: LIST VIDEO */}
          {videoSubView === 'list' &&
            (filteredVideos.length === 0 ? (
              <div
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 border-dashed bg-white py-16 text-center ${videosError ? 'hidden' : ''}`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Video className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-sm">
                    Belum Ada Video Diterbitkan
                  </p>
                  <p className="text-slate-500 text-xs">
                    Video edukasi yang diterbitkan lewat "Sematkan Video
                    YouTube" akan muncul di sini.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredVideos.map((vid) => (
                  <div
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition hover:shadow-md sm:flex-row sm:items-center"
                    key={vid.id}
                  >
                    {/* Thumbnail */}
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: setara pola kartu horizontal modul Wakaf */}
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: aksi putar juga tersedia lewat tombol "Putar Video" di kanan */}
                    {/* biome-ignore lint/nursery/noNoninteractiveElementInteractions: setara pola kartu horizontal modul Wakaf */}
                    <div
                      className="group relative aspect-video w-full shrink-0 cursor-pointer overflow-hidden rounded-lg bg-slate-900 sm:w-48 md:w-56"
                      onClick={() => setPreviewVideo(vid)}
                    >
                      {/* biome-ignore lint/performance/noImgElement: mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                      <img
                        alt={vid.title}
                        className="h-full w-full object-cover opacity-90 transition group-hover:scale-105 group-hover:opacity-100"
                        src={vid.thumbnailUrl}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B5E20]/90 text-white shadow-lg transition group-hover:scale-110">
                          <Play className="ml-0.5 h-4 w-4 fill-current" />
                        </div>
                      </div>
                      {vid.sourceType === 'upload' ? (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-slate-900/90 px-2 py-0.5 font-bold text-[9px] text-white uppercase backdrop-blur-xs">
                          <Upload className="h-2.5 w-2.5 text-emerald-400" />
                          <span>Berkas Lama (tidak tampil)</span>
                        </span>
                      ) : (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded bg-red-600/95 px-2 py-0.5 font-bold text-[9px] text-white uppercase shadow-2xs backdrop-blur-xs">
                          <Youtube className="h-3 w-3 text-white" />
                          <span>YouTube Embed</span>
                        </span>
                      )}
                    </div>

                    {/* Middle */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-xs text-emerald-900 uppercase">
                          {vid.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          {vid.speaker}
                        </span>
                      </div>
                      <h3 className="line-clamp-1 font-semibold text-base text-slate-800">
                        {vid.title}
                      </h3>
                      <p className="line-clamp-2 text-slate-500 text-xs leading-relaxed">
                        {vid.description}
                      </p>
                      <div className="flex items-center gap-3 pt-0.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {vid.publishDate}
                        </span>
                        <span className="flex items-center gap-1 font-bold text-rose-700">
                          <Heart className="h-3 w-3 fill-rose-600" />
                          {vid.likesCount}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex shrink-0 flex-row items-center justify-end gap-1.5 border-slate-100 border-t pt-2 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                      <button
                        className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-3 py-1.5 font-bold text-white text-xs shadow-2xs transition hover:bg-[#144716]"
                        onClick={() => setPreviewVideo(vid)}
                        type="button"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Putar Video
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          className="cursor-pointer rounded-lg bg-emerald-50 p-1.5 text-[#1B5E20] transition hover:bg-emerald-100"
                          onClick={() => handleOpenEditVideo(vid)}
                          title="Edit Video"
                          type="button"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="cursor-pointer rounded-lg bg-rose-50 p-1.5 text-rose-700 transition hover:bg-rose-100"
                          onClick={() =>
                            setDeleteConfirm({
                              type: 'video',
                              id: vid.id,
                              title: vid.title,
                            })
                          }
                          title="Hapus Video"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* VIEW: UPLOAD LINK VIDEO (YouTube / Vimeo / Streaming) */}
          {videoSubView === 'upload_link' && (
            <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex flex-col justify-between gap-2 border-b pb-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-lg text-slate-900">
                    <Youtube className="h-5 w-5 text-red-600" />
                    Sematkan Video YouTube
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Video disajikan lewat pemutar YouTube. Berkas video tidak
                    dapat diunggah.
                  </p>
                </div>
              </div>

              <form className="space-y-6" onSubmit={handleUploadVideoLink}>
                {/* Media Berdampingan: Tautan URL (kiri) & Preview Thumbnail (kanan) */}
                <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Kolom Kiri: satu-satunya input sumber video */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <YoutubeLinkField
                      id="educationmanagement-youtube-link"
                      onChange={(videoUrl) => {
                        const youtubeId = parseYoutubeVideoId(videoUrl);
                        setVideoLinkForm((prev) => ({
                          ...prev,
                          videoUrl,
                          thumbnailUrl:
                            youtubeId && videoLinkThumbnailAuto
                              ? youtubeThumbnailUrl(youtubeId)
                              : prev.thumbnailUrl,
                        }));
                      }}
                      required
                      title="Pratinjau video YouTube"
                      value={videoLinkForm.videoUrl}
                    />
                  </div>

                  {/* Kolom Kanan: Preview / Unggah Thumbnail */}
                  <div className="group relative flex aspect-video flex-col items-center justify-center space-y-2 rounded-2xl border-2 border-slate-300 border-dashed bg-slate-50 text-center transition hover:border-emerald-500">
                    {videoLinkForm.thumbnailUrl ? (
                      <>
                        {/* biome-ignore lint/performance/noImgElement: tidak ada komponen Image teroptimasi di TanStack Start */}
                        <img
                          alt="Pratinjau Thumbnail"
                          className="absolute inset-0 h-full w-full rounded-2xl object-cover"
                          src={videoLinkForm.thumbnailUrl}
                        />
                        <div className="absolute inset-0 rounded-2xl bg-black/10" />
                      </>
                    ) : (
                      <>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-[#1B5E20] transition group-hover:scale-105">
                          <Camera className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="block font-bold text-slate-900 text-sm">
                            Preview Thumbnail
                          </span>
                          <span className="text-slate-500 text-xs">
                            Terisi otomatis dari URL YouTube, atau unggah manual
                          </span>
                        </div>
                      </>
                    )}
                    <input
                      accept="image/*"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      onChange={(e) => {
                        handleVideoThumbnailUpload(e);
                        setVideoLinkThumbnailAuto(false);
                      }}
                      type="file"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {/* Judul Video */}
                  <div className="space-y-1.5">
                    <label
                      className="block font-bold text-slate-700 text-xs"
                      htmlFor="educationmanagement-f4604"
                    >
                      Judul Video <span className="text-rose-500">*</span>
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 font-semibold text-slate-900 text-sm focus:bg-white"
                      id="educationmanagement-f4604"
                      onChange={(e) =>
                        setVideoLinkForm({
                          ...videoLinkForm,
                          title: e.target.value,
                        })
                      }
                      placeholder="Contoh: Webinar Nasional: Optimalisasi CWLS untuk Kemaslahatan Ummat..."
                      required
                      type="text"
                      value={videoLinkForm.title}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {/* Kategori Video Dinamis */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label
                          className="block font-bold text-slate-700 text-xs"
                          htmlFor="edu-video-link-category"
                        >
                          Kategori Video{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="flex cursor-pointer items-center gap-1 font-bold text-[#1B5E20] text-xs hover:underline"
                            onClick={() => {
                              setShowInlineAddCategory(
                                showInlineAddCategory === 'video_link'
                                  ? null
                                  : 'video_link'
                              );
                              setInlineCategoryInput('');
                            }}
                            type="button"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Kategori Baru</span>
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            className="cursor-pointer font-semibold text-xs text-slate-500 hover:text-slate-800"
                            onClick={() => {
                              setCategoryModalTab('videos');
                              setShowCategoryModal(true);
                            }}
                            type="button"
                          >
                            Kelola List
                          </button>
                        </div>
                      </div>

                      {/* Inline Quick Add Category Input */}
                      {showInlineAddCategory === 'video_link' && (
                        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-2">
                          <input
                            autoFocus
                            className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-slate-900 text-xs focus:outline-hidden"
                            onChange={(e) =>
                              setInlineCategoryInput(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCategory(
                                  'videos',
                                  inlineCategoryInput
                                );
                              }
                            }}
                            placeholder="Nama kategori video baru..."
                            type="text"
                            value={inlineCategoryInput}
                          />
                          <button
                            className="cursor-pointer rounded-lg bg-[#1B5E20] px-3 py-1.5 font-bold text-white text-xs hover:bg-[#144716]"
                            onClick={() =>
                              handleAddCategory('videos', inlineCategoryInput)
                            }
                            type="button"
                          >
                            Simpan
                          </button>
                          <button
                            className="cursor-pointer px-2 py-1.5 font-bold text-slate-400 text-xs hover:text-slate-700"
                            onClick={() => {
                              setShowInlineAddCategory(null);
                              setInlineCategoryInput('');
                            }}
                            type="button"
                          >
                            Batal
                          </button>
                        </div>
                      )}

                      <SelectField
                        className="w-full"
                        id="edu-video-link-category"
                        onChange={(e) =>
                          setVideoLinkForm({
                            ...videoLinkForm,
                            category: e.target.value,
                          })
                        }
                        value={videoLinkForm.category}
                      >
                        {videoCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </SelectField>
                    </div>

                    {/* Narasumber / Lembaga Penyelenggara */}
                    <div className="space-y-1.5">
                      <label
                        className="block font-bold text-slate-700 text-xs"
                        htmlFor="educationmanagement-f4720"
                      >
                        Narasumber / Pemateri
                      </label>
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-slate-800 text-xs focus:bg-white"
                        id="educationmanagement-f4720"
                        onChange={(e) =>
                          setVideoLinkForm({
                            ...videoLinkForm,
                            speaker: e.target.value,
                          })
                        }
                        placeholder="Contoh: Komite Nasional Ekonomi dan Keuangan Syariah (KNEKS)"
                        type="text"
                        value={videoLinkForm.speaker}
                      />
                    </div>
                  </div>

                  {/* Deskripsi Video */}
                  <div className="space-y-1.5">
                    <label
                      className="block font-bold text-slate-700 text-xs"
                      htmlFor="educationmanagement-f4911"
                    >
                      Deskripsi Ringkas Video
                    </label>
                    <textarea
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 text-slate-800 text-xs focus:border-[#1B5E20] focus:bg-white"
                      id="educationmanagement-f4911"
                      onChange={(e) =>
                        setVideoLinkForm({
                          ...videoLinkForm,
                          description: e.target.value,
                        })
                      }
                      placeholder="Deskripsi singkat konten webinar..."
                      rows={3}
                      value={videoLinkForm.description}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-slate-200 border-t pt-4">
                  <button
                    className="cursor-pointer rounded-xl bg-slate-100 px-5 py-2.5 font-bold text-slate-700 text-xs hover:bg-slate-200"
                    onClick={() => setVideoSubView('list')}
                    type="button"
                  >
                    Batal
                  </button>
                  <button
                    className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#1B5E20] px-6 py-2.5 font-bold text-white text-xs shadow-xs hover:bg-[#144716] disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={isPublishingVideo}
                    type="submit"
                  >
                    {isPublishingVideo ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Youtube className="h-4 w-4" />
                    )}
                    {isPublishingVideo ? 'Menyematkan...' : 'Sematkan Video'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* VIEW: DISKUSI VIDEO (Dengan Timestamp Materi) */}
          {videoSubView === 'discussion' && (
            <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="flex items-center gap-2 font-bold text-lg text-slate-900">
                    <MessageSquare className="h-5 w-5 text-indigo-600" />
                    Tanya Jawab & Diskusi Video: {currentVideo.title}
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Diskusi berstempel waktu (timestamp) untuk membedah materi
                    kajian.
                  </p>
                </div>
                <SelectField
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  value={selectedVideoId}
                >
                  {videos.map((vid) => (
                    <option key={vid.id} value={vid.id}>
                      {vid.title.slice(0, 35)}...
                    </option>
                  ))}
                </SelectField>
              </div>

              {/* Form Tambah Diskusi Video dengan Timestamp */}
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="w-full sm:w-36">
                    <label
                      className="mb-1 block font-bold text-xs text-slate-500"
                      htmlFor="educationmanagement-f4979"
                    >
                      Timestamp
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center font-bold font-mono text-xs"
                      id="educationmanagement-f4979"
                      onChange={(e) => setVideoCommentTimestamp(e.target.value)}
                      placeholder="MM:SS (misal 04:20)"
                      type="text"
                      value={videoCommentTimestamp}
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      className="mb-1 block font-bold text-xs text-slate-500"
                      htmlFor="educationmanagement-f4991"
                    >
                      Jawaban / Catatan Admin
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 text-xs focus:border-[#1B5E20]"
                        id="educationmanagement-f4991"
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddDiscussionReply('video', selectedVideoId);
                          }
                        }}
                        placeholder="Tuliskan catatan kajian atau klarifikasi hukum syariah..."
                        type="text"
                        value={replyText}
                      />
                      <button
                        className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs hover:bg-[#144716]"
                        onClick={() =>
                          handleAddDiscussionReply('video', selectedVideoId)
                        }
                        type="button"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Kirim
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daftar Diskusi Video */}
              <div className="space-y-3">
                {currentVideo.discussions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-300 border-dashed bg-slate-50 p-8 text-center text-slate-400 text-xs">
                    Belum ada diskusi jamaah pada video ini.
                  </div>
                ) : (
                  currentVideo.discussions.map((disc) => (
                    <div
                      className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                      key={disc.id}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-900 text-xs">
                            {disc.avatarText}
                          </div>
                          <span className="font-bold text-slate-900 text-xs">
                            {disc.authorName}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-xs text-slate-600">
                            {disc.authorRole}
                          </span>
                        </div>
                        {disc.videoTimestamp && (
                          <span className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-bold font-mono text-xs text-indigo-800">
                            <Clock className="h-3 w-3" />
                            {disc.videoTimestamp}
                          </span>
                        )}
                      </div>
                      <p className="pl-9 text-slate-800 text-xs leading-relaxed">
                        {disc.comment}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BACA ARTIKEL LENGKAP & SIMULASI KUIS                                */}
      {/* ========================================================================= */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-xs sm:p-6">
          <div className="fade-in zoom-in-95 flex max-h-[90vh] w-full max-w-3xl animate-in flex-col overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
            {/* Minimalist Reader Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-slate-100 border-b bg-white/90 px-6 py-4 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-bold text-[#1B5E20] text-xs">
                  {previewArticle.category}
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="font-medium text-slate-500 text-xs">
                  {previewArticle.publishDate}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="cursor-pointer rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => window.print()}
                  title="Cetak Artikel"
                  type="button"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  className="cursor-pointer rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => setPreviewArticle(null)}
                  title="Tutup"
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Reading Content Area */}
            <div className="space-y-6 p-6 sm:p-10">
              {/* Header Title & Author */}
              <div className="space-y-3">
                <h1 className="font-black text-2xl text-slate-900 leading-tight tracking-tight sm:text-3xl">
                  {previewArticle.title}
                </h1>

                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    Ditulis oleh <strong>{previewArticle.author}</strong>
                  </span>
                </div>
              </div>

              {/* Banner Cover Image */}
              {previewArticle.coverImage && (
                <div className="h-60 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xs sm:h-72">
                  {/* biome-ignore lint/performance/noImgElement: dipulihkan 1:1 dari origin/awan (PR #28) — mengganti <img> akan mengubah DOM; tidak ada komponen Image teroptimasi di TanStack Start */}
                  <img
                    alt={previewArticle.title}
                    className="h-full w-full object-cover"
                    src={previewArticle.coverImage}
                  />
                </div>
              )}

              {/* Ringkasan / Lead paragraph */}
              {previewArticle.summary && (
                <div className="rounded-r-xl border-emerald-600 border-l-3 bg-slate-50 p-4 font-medium text-slate-700 text-sm italic leading-relaxed whitespace-pre-line">
                  {previewArticle.summary}
                </div>
              )}

              {/* Isi Dokumen Formatted */}
              <div className="space-y-4 pt-2 text-slate-800 text-sm leading-relaxed sm:text-base">
                {renderRichArticleContent(previewArticle.content)}
              </div>

              {/* Kuis Interaktif Section */}
              {previewArticle.quiz && previewArticle.quiz.length > 0 && (
                <QuizPreview
                  key={previewArticle.id}
                  quiz={previewArticle.quiz}
                />
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between border-slate-100 border-t pt-6">
                <button
                  className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-bold text-xs transition ${
                    previewArticle.isLikedByUser
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-600'
                  }`}
                  onClick={() => handleToggleArticleLike(previewArticle.id)}
                  type="button"
                >
                  <Heart
                    className={`h-3.5 w-3.5 ${previewArticle.isLikedByUser ? 'fill-current' : ''}`}
                  />
                  <span>Suka ({previewArticle.likesCount})</span>
                </button>

                <button
                  className="cursor-pointer rounded-xl bg-slate-900 px-5 py-2 font-bold text-white text-xs transition hover:bg-slate-800"
                  onClick={() => setPreviewArticle(null)}
                  type="button"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PLAYER VIDEO                                                      */}
      {/* ========================================================================= */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="fade-in zoom-in-95 w-full max-w-3xl animate-in space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-extrabold text-[#1B5E20] text-xs uppercase">
                    {previewVideo.category}
                  </span>
                  {parseYoutubeVideoId(previewVideo.videoUrl) ? (
                    <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 font-bold text-xs text-white uppercase">
                      <Youtube className="h-3 w-3" />
                      YouTube
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-bold text-xs text-white uppercase">
                      <Upload className="h-3 w-3 text-emerald-400" />
                      Berkas Lama
                    </span>
                  )}
                </div>
                <h3 className="mt-1 font-bold text-slate-900 text-sm sm:text-base">
                  {previewVideo.title}
                </h3>
              </div>
              <button
                className="cursor-pointer rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setPreviewVideo(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Video Player Box */}
            {(() => {
              const youtubeId = parseYoutubeVideoId(previewVideo.videoUrl);
              if (youtubeId) {
                return (
                  <YoutubeEmbed
                    autoplay
                    lazy={false}
                    title={previewVideo.title}
                    videoId={youtubeId}
                  />
                );
              }
              return (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 p-6 text-center text-slate-600 text-xs">
                  <p className="font-bold text-slate-800">
                    Video berkas lama tidak ditampilkan ke publik
                  </p>
                  <p>
                    Klik Edit dan ganti dengan Tautan Video YouTube agar video
                    ini muncul kembali.
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center justify-between font-mono text-slate-500 text-xs">
              <span>
                Pemateri:{' '}
                <strong className="text-slate-900">
                  {previewVideo.speaker}
                </strong>
              </span>
              <span>Terbit: {previewVideo.publishDate}</span>
            </div>

            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600 text-xs leading-relaxed whitespace-pre-line">
              {previewVideo.description}
            </p>

            <div className="flex items-center justify-between border-t pt-2">
              <button
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 font-bold text-xs transition ${
                  previewVideo.isLikedByUser
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-600'
                }`}
                onClick={() => handleToggleVideoLike(previewVideo.id)}
                type="button"
              >
                <Heart
                  className={`h-3.5 w-3.5 ${previewVideo.isLikedByUser ? 'fill-current' : ''}`}
                />
                <span>Suka ({previewVideo.likesCount})</span>
              </button>

              <button
                className="cursor-pointer rounded-xl bg-slate-900 px-5 py-2 font-bold text-white text-xs hover:bg-slate-800"
                onClick={() => setPreviewVideo(null)}
                type="button"
              >
                Selesai Menonton
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT VIDEO EDUKASI                                                 */}
      {/* ========================================================================= */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="fade-in zoom-in-95 max-h-[90vh] w-full max-w-2xl animate-in overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="rounded bg-emerald-100 px-2 py-0.5 font-extrabold text-[#1B5E20] text-xs uppercase">
                  Edit Video
                </span>
                <h3 className="mt-1 font-bold text-slate-900 text-base">
                  Edit Video Kajian Edukasi
                </h3>
              </div>
              <button
                className="cursor-pointer rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={handleCloseEditVideo}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSaveEditVideo}>
              {/* Judul Kajian */}
              <div>
                <label className="mb-1 block font-bold text-slate-700 text-xs">
                  Judul Kajian / Video <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-900 text-xs transition focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  onChange={(e) =>
                    setEditingVideoForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  placeholder="Masukkan judul video kajian..."
                  required
                  type="text"
                  value={editingVideoForm.title}
                />
              </div>

              {/* Grid 2 Kolom: Kategori & Pemateri */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-bold text-slate-700 text-xs">
                    Kategori Fiqih <span className="text-rose-500">*</span>
                  </label>
                  <SelectField
                    className="w-full"
                    onChange={(e) =>
                      setEditingVideoForm((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    value={editingVideoForm.category}
                  >
                    {videoCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-slate-700 text-xs">
                    Nama Pemateri / Ustadz
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-900 text-xs transition focus:border-emerald-500 focus:outline-hidden"
                    onChange={(e) =>
                      setEditingVideoForm((prev) => ({
                        ...prev,
                        speaker: e.target.value,
                      }))
                    }
                    placeholder="Nama ustadz / narasumber..."
                    type="text"
                    value={editingVideoForm.speaker}
                  />
                </div>
              </div>

              {/* Sumber video: hanya tautan YouTube */}
              <YoutubeLinkField
                id="educationmanagement-edit-youtube-link"
                onChange={(videoUrl) =>
                  setEditingVideoForm((prev) => ({ ...prev, videoUrl }))
                }
                required
                title="Pratinjau video YouTube"
                value={editingVideoForm.videoUrl}
              />

              {/* Gambar Sampul (Thumbnail) */}
              <div>
                <label className="mb-1 block font-bold text-slate-700 text-xs">
                  URL Thumbnail / Gambar Sampul
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-900 text-xs transition focus:border-emerald-500 focus:outline-hidden"
                    onChange={(e) =>
                      setEditingVideoForm((prev) => ({
                        ...prev,
                        thumbnailUrl: e.target.value,
                      }))
                    }
                    placeholder="https://.../thumbnail.jpg"
                    type="text"
                    value={editingVideoForm.thumbnailUrl}
                  />
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-700 text-xs hover:bg-slate-100">
                    <Camera className="h-4 w-4 text-emerald-600" />
                    <span>Pilih Foto</span>
                    <input
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const dataUrl = event.target?.result as string;
                            setEditingVideoForm((prev) => ({
                              ...prev,
                              thumbnailUrl: dataUrl,
                            }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      type="file"
                    />
                  </label>
                </div>
              </div>

              {/* Deskripsi Video */}
              <div>
                <label className="mb-1 block font-bold text-slate-700 text-xs">
                  Deskripsi Ringkas Video
                </label>
                <textarea
                  className="h-20 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-slate-900 text-xs transition focus:border-emerald-500 focus:outline-hidden"
                  onChange={(e) =>
                    setEditingVideoForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Ringkasan isi kajian..."
                  rows={3}
                  value={editingVideoForm.description}
                />
              </div>

              {/* Tombol Aksi */}
              <div className="flex items-center justify-end gap-2.5 border-t pt-4">
                <button
                  className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 text-xs hover:bg-slate-50"
                  disabled={isUpdatingVideo}
                  onClick={handleCloseEditVideo}
                  type="button"
                >
                  Batal
                </button>
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-5 py-2 font-bold text-white text-xs shadow-sm hover:bg-[#144716] disabled:bg-slate-300"
                  disabled={isUpdatingVideo}
                  type="submit"
                >
                  {isUpdatingVideo && (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {isUpdatingVideo ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DISTRIBUSI SKOR KUIS & REWARD BERKAH XP                            */}
      {/* ========================================================================= */}
      {quizScoreModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setQuizScoreModalData(null);
            }
          }}
        >
          <div className="fade-in zoom-in-95 w-full max-w-xl animate-in space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-slate-100 border-b pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-extrabold text-xs text-amber-900 uppercase">
                    <Sparkles className="h-3 w-3 text-amber-600" />
                    Transparansi Skoring & XP
                  </span>
                  <h3 className="mt-1 font-bold text-lg text-slate-900">
                    Distribusi Skor Kuis & Berkah XP
                  </h3>
                  <p className="line-clamp-1 text-slate-500 text-xs">
                    Materi: {quizScoreModalData.title || 'Materi Edukasi'}
                  </p>
                </div>
              </div>
              <button
                className="cursor-pointer rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setQuizScoreModalData(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            {quizScoreModalData.totalQuestions === 0 ? (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
                <HelpCircle className="mx-auto h-8 w-8 text-amber-600" />
                <h4 className="font-bold text-amber-950 text-sm">
                  Belum Ada Soal Kuis
                </h4>
                <p className="mx-auto max-w-sm text-amber-800 text-xs leading-relaxed">
                  Belum ada butir soal kuis yang terpasang pada materi ini.
                  Tambahkan minimal 1 butir soal untuk melihat simulasi
                  kalkulasi skor dan ambang kelulusan.
                </p>
              </div>
            ) : (
              (() => {
                const totalQ = quizScoreModalData.totalQuestions;
                const pointsPerQ = Math.round(100 / totalQ);
                const exactPointsPerQ = (100 / totalQ)
                  .toFixed(1)
                  .replace(/\.0$/, '');
                const passingThresholdPercent = 80;
                const minCorrectAnswers = Math.ceil(
                  (passingThresholdPercent / 100) * totalQ
                );

                return (
                  <div className="space-y-4">
                    {/* Grid 4 Metrik */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <span className="block font-semibold text-xs text-slate-500">
                          Total Soal
                        </span>
                        <span className="mt-1 block font-black font-mono text-slate-900 text-xl">
                          {totalQ}
                        </span>
                        <span className="text-xs text-slate-400">
                          Butir Pilihan Ganda
                        </span>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <span className="block font-semibold text-xs text-slate-500">
                          Bobot per Soal
                        </span>
                        <span className="mt-1 block font-black font-mono text-[#1B5E20] text-xl">
                          ~{pointsPerQ}%
                        </span>
                        <span className="text-xs text-slate-400">
                          {exactPointsPerQ} poin / soal
                        </span>
                      </div>

                      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-center">
                        <span className="block font-semibold text-xs text-amber-800">
                          Syarat Lulus
                        </span>
                        <span className="mt-1 block font-black font-mono text-amber-950 text-xl">
                          ≥ {passingThresholdPercent}%
                        </span>
                        <span className="font-semibold text-xs text-amber-700">
                          Min. {minCorrectAnswers} benar
                        </span>
                      </div>

                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-center">
                        <span className="block font-semibold text-xs text-emerald-800">
                          Hadiah XP
                        </span>
                        <span className="mt-1 block font-black font-mono text-[#1B5E20] text-xl">
                          +100 XP
                        </span>
                        <span className="font-semibold text-xs text-emerald-700">
                          Berkah Jamaah
                        </span>
                      </div>
                    </div>

                    {/* Simulasi Tabel Skor */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">
                          Tabel Simulasi Hasil Kuis Jamaah:
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          Skala 100 Poin
                        </span>
                      </div>

                      <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700">
                            <tr>
                              <th className="px-3 py-2">Jawaban Benar</th>
                              <th className="px-3 py-2">Skor Akhir</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2 text-right">
                                Reward Berkah
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {Array.from(
                              { length: totalQ + 1 },
                              (_, i) => totalQ - i
                            ).map((correctCount) => {
                              const scorePercent = Math.round(
                                (correctCount / totalQ) * 100
                              );
                              const isPassed =
                                scorePercent >= passingThresholdPercent;

                              return (
                                <tr
                                  className={
                                    isPassed
                                      ? 'bg-emerald-50/40 font-semibold'
                                      : 'text-slate-600'
                                  }
                                  key={correctCount}
                                >
                                  <td className="px-3 py-2">
                                    {correctCount} dari {totalQ} soal
                                  </td>
                                  <td className="px-3 py-2 font-mono">
                                    {scorePercent}%
                                  </td>
                                  <td className="px-3 py-2">
                                    {isPassed ? (
                                      <span className="inline-flex items-center gap-1 font-bold text-xs text-emerald-800">
                                        <Check className="h-3 w-3 text-emerald-600" />
                                        Lulus Kuis
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-400">
                                        Belum Lulus
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-bold font-mono">
                                    {isPassed ? (
                                      <span className="text-[#1B5E20]">
                                        +100 XP
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">
                                        0 XP
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Keterangan Sistem */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
                      <strong>Catatan Sistem:</strong> Skor dihitung secara
                      proporsional dari seluruh butir pertanyaan aktif. Jamaah
                      yang mencapai batas minimal kelulusan{' '}
                      <strong>{passingThresholdPercent}%</strong> akan otomatis
                      menerima lencana kelulusan dan reward{' '}
                      <strong>100 Berkah XP</strong> ke akun Amwal mereka.
                    </div>
                  </div>
                );
              })()
            )}

            {/* Modal Footer */}
            <div className="flex justify-end border-slate-100 border-t pt-4">
              <button
                className="cursor-pointer rounded-xl bg-[#1B5E20] px-5 py-2.5 font-bold text-white text-xs shadow-xs hover:bg-[#144716]"
                onClick={() => setQuizScoreModalData(null)}
                type="button"
              >
                Mengerti & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: KELOLA KATEGORI EDUKASI (ARTIKEL & VIDEO)                          */}
      {/* ========================================================================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="fade-in zoom-in-95 w-full max-w-lg animate-in space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-slate-100 border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-[#1B5E20]">
                  <FolderPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Kelola Kategori Edukasi
                  </h3>
                  <p className="text-slate-500 text-xs">
                    Tambah, perbarui, atau hapus kategori untuk artikel dan
                    video.
                  </p>
                </div>
              </div>
              <button
                className="cursor-pointer rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategoryIndex(null);
                }}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Selector: Artikel vs Video */}
            <AdminTabs
              label="Jenis kategori"
              onChange={(tab) => {
                setCategoryModalTab(tab);
                setEditingCategoryIndex(null);
              }}
              tabs={[
                {
                  id: 'articles',
                  label: `Kategori Artikel (${articleCategories.length})`,
                  icon: <BookOpen className="h-3.5 w-3.5" />,
                },
                {
                  id: 'videos',
                  label: `Kategori Video (${videoCategories.length})`,
                  icon: <Video className="h-3.5 w-3.5" />,
                },
              ]}
              value={categoryModalTab}
            />

            {/* Form Tambah Kategori Baru */}
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <label
                className="block font-bold text-slate-700 text-xs"
                htmlFor="educationmanagement-f5370"
              >
                Tambah Kategori{' '}
                {categoryModalTab === 'articles' ? 'Artikel' : 'Video'} Baru
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-semibold text-slate-900 text-xs placeholder-slate-400 focus:border-[#1B5E20] focus:outline-hidden"
                  id="educationmanagement-f5370"
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory(categoryModalTab, newCategoryName);
                    }
                  }}
                  placeholder={`Contoh: ${categoryModalTab === 'articles' ? 'Zakat Saham, Sukuk Ritel...' : 'Podcast Syariah, Live Webinar...'}`}
                  type="text"
                  value={newCategoryName}
                />
                <button
                  className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#1B5E20] px-4 py-2 font-bold text-white text-xs shadow-xs transition hover:bg-[#144716]"
                  onClick={() =>
                    handleAddCategory(categoryModalTab, newCategoryName)
                  }
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            {/* List Kategori yang Ada */}
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              <div className="flex items-center justify-between px-2 font-bold text-xs text-slate-400 uppercase tracking-wider">
                <span>Daftar Kategori</span>
                <span>Tindakan</span>
              </div>

              {(categoryModalTab === 'articles'
                ? articleCategories
                : videoCategories
              ).map((cat, idx) => {
                const isEditing = editingCategoryIndex === idx;
                const usageCount =
                  categoryModalTab === 'articles'
                    ? articles.filter((a) => a.category === cat).length
                    : videos.filter((v) => v.category === cat).length;

                return (
                  <div
                    className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 transition hover:bg-slate-50"
                    key={cat}
                  >
                    {isEditing ? (
                      <div className="flex flex-1 items-center gap-1.5">
                        <input
                          autoFocus
                          className="flex-1 rounded-lg border border-emerald-400 bg-slate-50 px-2.5 py-1 font-semibold text-slate-900 text-xs focus:outline-hidden"
                          onChange={(e) =>
                            setEditingCategoryText(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUpdateCategory(
                                categoryModalTab,
                                idx,
                                editingCategoryText
                              );
                            }
                          }}
                          type="text"
                          value={editingCategoryText}
                        />
                        <button
                          className="cursor-pointer rounded-lg bg-[#1B5E20] px-2.5 py-1 font-bold text-white text-xs hover:bg-[#144716]"
                          onClick={() =>
                            handleUpdateCategory(
                              categoryModalTab,
                              idx,
                              editingCategoryText
                            )
                          }
                          type="button"
                        >
                          Simpan
                        </button>
                        <button
                          className="cursor-pointer px-2 py-1 font-bold text-slate-400 text-xs hover:text-slate-700"
                          onClick={() => setEditingCategoryIndex(null)}
                          type="button"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="font-bold text-slate-800 text-xs">
                            {cat}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
                            {usageCount}{' '}
                            {categoryModalTab === 'articles'
                              ? 'artikel'
                              : 'video'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                            onClick={() => {
                              setEditingCategoryIndex(idx);
                              setEditingCategoryText(cat);
                            }}
                            title="Edit Kategori"
                            type="button"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            onClick={() =>
                              handleDeleteCategory(categoryModalTab, idx)
                            }
                            title="Hapus Kategori"
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-slate-100 border-t pt-3">
              <button
                className="cursor-pointer rounded-xl bg-slate-900 px-5 py-2 font-bold text-white text-xs hover:bg-slate-800"
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategoryIndex(null);
                }}
                type="button"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: KONFIRMASI HAPUS TERPADU (Video & Artikel)                          */}
      {/* ========================================================================= */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="fade-in zoom-in-95 w-full max-w-sm animate-in space-y-4 rounded-3xl border border-rose-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Hapus {deleteConfirm.type === 'video' ? 'Video' : 'Artikel'}?
                </h3>
                <p className="text-slate-500 text-xs">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </div>

            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700 text-xs leading-relaxed">
              Apakah Anda yakin ingin menghapus{' '}
              {deleteConfirm.type === 'video' ? 'video' : 'artikel'}{' '}
              <strong>&quot;{deleteConfirm.title}&quot;</strong>? Tindakan ini
              tidak dapat dibatalkan.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 text-xs transition hover:bg-slate-200"
                onClick={() => setDeleteConfirm(null)}
                type="button"
              >
                Batal
              </button>
              <button
                className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 font-bold text-white text-xs shadow-xs transition hover:bg-rose-700"
                onClick={handleConfirmDelete}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
