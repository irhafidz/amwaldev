import { Link } from '@tanstack/react-router';
import { ArrowLeft, Bot, RotateCcw, Sparkles } from 'lucide-react';
import { ChatPanel } from '@/components/chat/chat-panel';
import { resetChat, useChat } from '@/components/chat/chat-store';
import type { SessionUser } from '@/lib/auth/types';

/**
 * `/tanya-ai` — the full-page assistant. The conversation itself is the shared
 * `ChatPanel`, the same one the floating widget shows, and the same stored
 * messages, so expanding the widget continues where it left off.
 */
export function TanyaAiView({ user }: { user: SessionUser | null }) {
  const { messages } = useChat();

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-slate-50 lg:h-[calc(100vh-3rem)]">
      <header className="z-10 flex shrink-0 items-center justify-between border-gray-200 border-b bg-white px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            className="flex size-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
            title="Kembali ke Edukasi"
            to="/edukasi"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1d352d] via-[#2b4f43] to-[#356152] text-white shadow-xs">
            <Bot aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h1 className="font-bold text-base text-gray-900 leading-none">
              Tanya Amwal
            </h1>
            <p className="mt-1 flex items-center gap-1 text-gray-500 text-xs">
              <Sparkles aria-hidden="true" className="size-3 text-amber-500" />
              Asisten AI Literasi Fiqih &amp; Muamalah
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 1 && (
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 font-medium text-gray-600 text-xs transition hover:bg-gray-100 hover:text-gray-900"
              onClick={resetChat}
              type="button"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              <span className="hidden sm:inline">Percakapan Baru</span>
            </button>
          )}
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-[11px] text-gray-500">
            Bukan Fatwa Resmi
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ChatPanel user={user} variant="page" />
      </div>
    </div>
  );
}
