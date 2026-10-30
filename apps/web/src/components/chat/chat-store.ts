import { useSyncExternalStore } from 'react';
import { orpc } from '@/lib/orpc/client';

/**
 * One conversation shared by every place the assistant appears (the floating
 * widget and the /tanya-ai page). Expanding the widget to the full page, or
 * navigating between pages, keeps the same messages, the same in-flight
 * request and the same open/minimized state.
 *
 * State lives at module level and only changes from event handlers and
 * effects, never while rendering, so server rendering always sees the initial
 * snapshot.
 */

export interface ChatMessage {
  content: string;
  createdAt: string;
  /** The request for this question failed; it can be retried. */
  failed?: boolean;
  id: string;
  role: 'USER' | 'ASSISTANT';
}

export type WidgetMode = 'closed' | 'open' | 'minimized';

interface ChatState {
  conversationId: string | undefined;
  error: string | null;
  historyLoaded: boolean;
  messages: ChatMessage[];
  sending: boolean;
  widget: WidgetMode;
}

export const MAX_QUESTION_LENGTH = 500;
/** Cermin `GUEST_MAX_QUESTION` di router ask-ai: tamu bertanya lebih pendek. */
export const GUEST_MAX_QUESTION_LENGTH = 300;

/** Tamu bertanya lewat `askAi.ask`: tanpa akun, tanpa riwayat tersimpan. */
let guestMode = false;

export function setGuestMode(guest: boolean): void {
  guestMode = guest;
}

export const GREETING: ChatMessage = {
  id: 'greeting',
  role: 'ASSISTANT',
  content:
    "Assalamu'alaikum Warahmatullahi Wabarakatuh! Saya Asisten AI Syariah Amwal. Ada yang bisa saya bantu terkait zakat, wakaf uang, infaq, atau fiqih muamalah sehari-hari?",
  createdAt: '',
};

export const QUICK_PROMPTS = [
  'Berapa nisab zakat penghasilan?',
  'Apa syarat sah wakaf uang?',
  'Cara hitung zakat maal emas & tabungan',
  'Bolehkah wakaf atas nama orang tua yang wafat?',
  'Apa perbedaan zakat, infaq, sedekah, dan wakaf?',
] as const;

const GENERIC_ERROR =
  'Tidak dapat menghubungi asisten saat ini. Silakan coba lagi.';

const initialState = (): ChatState => ({
  conversationId: undefined,
  error: null,
  historyLoaded: false,
  messages: [GREETING],
  sending: false,
  widget: 'closed',
});

let state: ChatState = initialState();
/** Bumped by `resetChat` so an answer to an abandoned question is ignored. */
let generation = 0;
const listeners = new Set<() => void>();

function update(patch: Partial<ChatState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChat(): ChatState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  );
}

export function setWidgetMode(widget: WidgetMode): void {
  update({ widget });
}

export function resetChat(): void {
  generation += 1;
  update({
    conversationId: undefined,
    error: null,
    messages: [GREETING],
    sending: false,
  });
}

/** Test hook: back to a pristine store. */
export function resetChatStoreForTests(): void {
  generation += 1;
  state = initialState();
  for (const listener of listeners) {
    listener();
  }
}

/** Loads the signed-in user's latest conversation once. */
export async function loadHistory(): Promise<void> {
  if (state.historyLoaded) {
    return;
  }
  update({ historyLoaded: true });
  try {
    const response = await orpc.askAi.list();
    const loaded = response.data;
    // The user may already have asked something while this was loading.
    if (loaded.length === 0 || state.messages.length > 1) {
      return;
    }
    update({
      conversationId: loaded.at(-1)?.conversationId,
      messages: [
        GREETING,
        ...loaded.map(
          (message): ChatMessage => ({
            content: message.content,
            createdAt: message.createdAt,
            id: message.id,
            role: message.role === 'USER' ? 'USER' : 'ASSISTANT',
          })
        ),
      ],
    });
  } catch {
    // Keep the greeting; history is a convenience.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : GENERIC_ERROR;
}

export async function sendMessage(text: string): Promise<void> {
  const question = text
    .trim()
    .slice(0, guestMode ? GUEST_MAX_QUESTION_LENGTH : MAX_QUESTION_LENGTH);
  if (!question || state.sending) {
    return;
  }

  const mine = generation;
  const asked: ChatMessage = {
    content: question,
    createdAt: new Date().toISOString(),
    id: `user-${Date.now()}`,
    role: 'USER',
  };
  update({ error: null, messages: [...state.messages, asked], sending: true });

  try {
    const answer = guestMode
      ? {
          conversationId: undefined,
          ...(await orpc.askAi.ask({ message: question })).data,
        }
      : (
          await orpc.askAi.send({
            conversationId: state.conversationId,
            message: question,
          })
        ).data;
    if (mine !== generation) {
      return;
    }
    update({
      conversationId: answer.conversationId,
      messages: [
        ...state.messages,
        {
          content: answer.content,
          createdAt: new Date().toISOString(),
          id: `ai-${Date.now()}`,
          role: 'ASSISTANT',
        },
      ],
      sending: false,
    });
  } catch (error) {
    if (mine !== generation) {
      return;
    }
    update({
      error: errorMessage(error),
      messages: state.messages.map((message) =>
        message.id === asked.id ? { ...message, failed: true } : message
      ),
      sending: false,
    });
  }
}

/** Asks the last failed question again, without duplicating it in the list. */
export function retryLast(): Promise<void> {
  const failed = [...state.messages]
    .reverse()
    .find((message) => message.failed);
  if (!failed || state.sending) {
    return Promise.resolve();
  }
  update({
    error: null,
    messages: state.messages.filter((message) => message.id !== failed.id),
  });
  return sendMessage(failed.content);
}
