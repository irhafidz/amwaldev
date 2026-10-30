import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  Bot,
  LoaderCircle,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SessionUser } from '@/lib/auth/types';
import { ChatMarkdown } from './chat-markdown';
import {
  type ChatMessage,
  GUEST_MAX_QUESTION_LENGTH,
  loadHistory,
  MAX_QUESTION_LENGTH,
  QUICK_PROMPTS,
  retryLast,
  sendMessage,
  setGuestMode,
  useChat,
} from './chat-store';

export type ChatVariant = 'widget' | 'page';

const THINKING_STEPS = [
  'Menelusuri referensi syariah…',
  'Membaca sumber yang relevan…',
  'Menyusun jawaban…',
] as const;
const THINKING_STEP_MS = 2600;
const COUNTER_MARGIN = 100;

function Avatar({ author }: { author: ChatMessage['role'] }) {
  const isUser = author === 'USER';
  return (
    <div
      className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
        isUser
          ? 'bg-[#356152] text-white shadow-xs'
          : 'bg-white text-[#356152] shadow-xs ring-1 ring-gray-200'
      }`}
    >
      {isUser ? (
        <User aria-hidden="true" className="size-4" />
      ) : (
        <Bot aria-hidden="true" className="size-4" />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  variant,
}: {
  message: ChatMessage;
  variant: ChatVariant;
}) {
  const isUser = message.role === 'USER';
  const width =
    variant === 'widget' ? 'max-w-[86%]' : 'max-w-[88%] sm:max-w-[78%]';

  return (
    <div
      className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <Avatar author={message.role} />
      <div
        className={`${width} rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed sm:text-sm ${
          isUser
            ? `rounded-tr-xs bg-[#356152] text-white shadow-sm ${message.failed ? 'opacity-60' : ''}`
            : 'rounded-tl-xs border border-[#e2ece8] bg-white text-gray-900 shadow-xs'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-line break-words">{message.content}</p>
        ) : (
          <ChatMarkdown content={message.content} />
        )}
      </div>
    </div>
  );
}

/** Three bouncing dots plus a status line that changes while the assistant works. */
function ThinkingBubble() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () =>
        setStep((current) => Math.min(current + 1, THINKING_STEPS.length - 1)),
      THINKING_STEP_MS
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-start gap-2.5">
      <Avatar author="ASSISTANT" />
      <output
        aria-live="polite"
        className="flex items-center gap-2 rounded-2xl rounded-tl-xs border border-[#e2ece8] bg-white px-3.5 py-3 shadow-xs"
      >
        <span aria-hidden="true" className="flex items-center gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-[#356152]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[#356152] [animation-delay:0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-[#356152] [animation-delay:0.3s]" />
        </span>
        <span className="text-gray-500 text-xs">{THINKING_STEPS[step]}</span>
      </output>
    </div>
  );
}

function QuickPrompts({
  variant,
  onPick,
}: {
  variant: ChatVariant;
  onPick: (prompt: string) => void;
}) {
  const prompts =
    variant === 'widget' ? QUICK_PROMPTS.slice(0, 3) : QUICK_PROMPTS;
  return (
    <div className="rounded-2xl border border-emerald-100 bg-[#f2f6f4] p-3.5">
      <p className="flex items-center gap-1.5 font-bold text-[#356152] text-xs">
        <Sparkles aria-hidden="true" className="size-3.5" />
        Pertanyaan populer
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            className="cursor-pointer rounded-xl border border-[#356152]/20 bg-white px-3 py-1.5 text-left font-medium text-gray-800 text-xs shadow-xs transition hover:border-[#356152] hover:bg-[#356152] hover:text-white"
            key={prompt}
            onClick={() => onPick(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ErrorNotice({
  message,
  canRetry,
}: {
  message: string;
  canRetry: boolean;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-xs"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {canRetry && (
        <button
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-rose-300 bg-white px-2 py-1 font-semibold transition hover:bg-rose-100"
          onClick={() => {
            retryLast();
          }}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          Coba lagi
        </button>
      )}
    </div>
  );
}

function Composer({ guest, sending }: { guest: boolean; sending: boolean }) {
  const maxLength = guest ? GUEST_MAX_QUESTION_LENGTH : MAX_QUESTION_LENGTH;
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!text.trim() || sending) {
      return;
    }
    sendMessage(text);
    setText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  const grow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
  };

  return (
    <form
      className="border-gray-200 border-t bg-white p-3"
      onSubmit={handleSubmit}
    >
      <div className="flex items-end gap-2">
        <textarea
          aria-label="Tulis pertanyaan"
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-gray-200 bg-slate-50 px-4 py-2.5 text-gray-900 text-sm transition placeholder:text-gray-400 focus:border-[#356152] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#356152]/20"
          maxLength={maxLength}
          onChange={(event) => {
            setText(event.target.value);
            grow(event.target);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tanya zakat, wakaf, atau fiqih…"
          ref={inputRef}
          rows={1}
          value={text}
        />
        <button
          aria-label="Kirim pertanyaan"
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-[#356152] text-white shadow-[#356152]/20 shadow-md transition hover:bg-[#2b4f43] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={sending || text.trim() === ''}
          type="submit"
        >
          {sending ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <Send aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>
      <p className="mt-1.5 flex justify-between text-[10px] text-gray-400">
        <span>Dapat keliru. Konfirmasikan hukum syariah kepada asatidz.</span>
        {text.length >= maxLength - COUNTER_MARGIN && (
          <span className="tabular-nums">
            {text.length}/{maxLength}
          </span>
        )}
      </p>
    </form>
  );
}

function GuestNotice() {
  return (
    <p className="border-amber-200 border-t bg-amber-50/80 px-4 py-2 text-center text-[11px] text-amber-900">
      Anda bertanya sebagai tamu: riwayat tidak disimpan dan jumlah pertanyaan
      dibatasi.{' '}
      <Link className="font-bold underline" to="/auth/login">
        Masuk
      </Link>{' '}
      untuk menyimpan riwayat.
    </p>
  );
}

/**
 * The conversation itself: message list, quick prompts, thinking indicator,
 * error with retry, and the composer. Header chrome is supplied by the caller
 * (the widget or the /tanya-ai page), so both share exactly this component.
 */
export function ChatPanel({
  user,
  variant,
}: {
  user: SessionUser | null;
  variant: ChatVariant;
}) {
  const chat = useChat();
  const endRef = useRef<HTMLDivElement>(null);
  const signedIn = Boolean(user);
  setGuestMode(!signedIn);

  useEffect(() => {
    if (signedIn) {
      loadHistory();
    }
  }, [signedIn]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the list grows or the thinking bubble appears
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length, chat.sending]);

  const showPrompts = chat.messages.length === 1 && !chat.sending;
  const canRetry = chat.messages.some((message) => message.failed);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div
          className={`mx-auto space-y-3.5 ${variant === 'page' ? 'max-w-3xl' : ''}`}
        >
          {chat.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              variant={variant}
            />
          ))}
          {chat.sending && <ThinkingBubble />}
          {showPrompts && (
            <QuickPrompts onPick={sendMessage} variant={variant} />
          )}
          {chat.error && (
            <ErrorNotice canRetry={canRetry} message={chat.error} />
          )}
          <div ref={endRef} />
        </div>
      </div>
      {!signedIn && <GuestNotice />}
      <Composer guest={!signedIn} sending={chat.sending} />
    </div>
  );
}
