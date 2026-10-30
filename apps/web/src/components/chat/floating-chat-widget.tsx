import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  Maximize2,
  MessageCircle,
  Minus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import type { SessionUser } from '@/lib/auth/types';
import { ChatPanel } from './chat-panel';
import { resetChat, setWidgetMode, useChat } from './chat-store';

/**
 * The floating assistant lives ONLY on the home dashboard. On checkout, program
 * catalogs, donation forms, history and settings it sat on top of the primary
 * action (and, on phones, over the sticky pay button). The full page
 * `/tanya-ai` stays reachable from the sidebar and the help links.
 */
const TRAILING_SLASH = /\/+$/;
const SHOWN_ON = new Set(['/dashboard', '/beranda']);

const normalizePath = (pathname: string) =>
  pathname.length > 1 ? pathname.replace(TRAILING_SLASH, '') : pathname;

export const isChatWidgetPath = (pathname: string) =>
  SHOWN_ON.has(normalizePath(pathname));
const DESKTOP_QUERY = '(min-width: 768px)';

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function Title() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
        <Bot aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-bold text-sm leading-tight">Tanya Amwal</p>
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-100">
          <span className="size-1.5 rounded-full bg-emerald-300" />
          Asisten AI Syariah
        </p>
      </div>
    </div>
  );
}

/**
 * Instagram-DM style assistant: a pill in the bottom-right corner that opens a
 * floating chat box on desktop. On phones the box would fight the on-screen
 * keyboard, so the pill goes straight to the full-page /tanya-ai instead.
 */
export function FloatingChatWidget({ user }: { user: SessionUser | null }) {
  const { widget, messages } = useChat();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hidden = !isChatWidgetPath(pathname);

  useEffect(() => {
    if (widget !== 'open') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWidgetMode('closed');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [widget]);

  if (hidden) {
    return null;
  }

  const openFromBubble = () => {
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      setWidgetMode('open');
    } else {
      navigate({ to: '/tanya-ai' });
    }
  };

  const expand = () => {
    setWidgetMode('closed');
    navigate({ to: '/tanya-ai' });
  };

  return (
    <>
      <button
        aria-label="Buka asisten Tanya Amwal"
        className={`fixed right-4 bottom-24 z-50 items-center gap-2 rounded-full bg-gradient-to-br from-[#2b4f43] to-[#356152] py-3 pr-5 pl-4 font-bold text-sm text-white shadow-[#356152]/30 shadow-lg ring-2 ring-white/70 transition hover:scale-105 active:scale-95 md:right-6 md:bottom-6 ${
          widget === 'closed' ? 'flex' : 'flex md:hidden'
        }`}
        onClick={openFromBubble}
        type="button"
      >
        <span className="relative flex">
          <MessageCircle aria-hidden="true" className="size-5" />
          <Sparkles
            aria-hidden="true"
            className="-top-1.5 -right-1.5 absolute size-3 text-amber-300"
          />
        </span>
        Tanya Amwal
      </button>

      {widget === 'minimized' && (
        <button
          aria-label="Perbesar asisten Tanya Amwal"
          className="fixed right-6 bottom-6 z-50 hidden w-72 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-[#2b4f43] to-[#356152] px-3 py-2.5 text-left text-white shadow-lg ring-1 ring-black/5 md:flex"
          onClick={() => setWidgetMode('open')}
          type="button"
        >
          <Title />
          <Maximize2
            aria-hidden="true"
            className="size-4 shrink-0 opacity-80"
          />
        </button>
      )}

      {widget === 'open' && (
        <aside
          aria-label="Asisten Tanya Amwal"
          className="fade-in slide-in-from-bottom-4 fixed right-6 bottom-6 z-50 hidden h-[520px] max-h-[calc(100vh-3rem)] w-[380px] animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-200 md:flex"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 bg-gradient-to-br from-[#2b4f43] to-[#356152] px-3 py-2.5 text-white">
            <Title />
            <div className="flex shrink-0 items-center">
              {messages.length > 1 && (
                <HeaderButton label="Percakapan baru" onClick={resetChat}>
                  <RotateCcw aria-hidden="true" className="size-4" />
                </HeaderButton>
              )}
              <HeaderButton
                label="Perkecil"
                onClick={() => setWidgetMode('minimized')}
              >
                <Minus aria-hidden="true" className="size-4" />
              </HeaderButton>
              <HeaderButton label="Buka halaman penuh" onClick={expand}>
                <Maximize2 aria-hidden="true" className="size-4" />
              </HeaderButton>
              <HeaderButton
                label="Tutup"
                onClick={() => setWidgetMode('closed')}
              >
                <X aria-hidden="true" className="size-4" />
              </HeaderButton>
            </div>
          </header>
          <div className="min-h-0 flex-1">
            <ChatPanel user={user} variant="widget" />
          </div>
        </aside>
      )}
    </>
  );
}
