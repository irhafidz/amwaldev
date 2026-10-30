import { askDeepSeek } from '@amwal/core/llm/deepseek';
import { ORPCError } from '@orpc/server';
import { asc, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { env } from '@/env/server';
import { assertGuestAskAllowed } from '@/lib/ask-ai-guest-limit';
import { chatbotConversations, chatbotMessages } from '@/lib/db/schema';
import {
  askRag,
  RAG_MAX_QUESTION,
  RAG_MIN_QUESTION,
  RagError,
  type RagSource,
  withSources,
} from '@/lib/rag/client';
import { protectedProcedure, publicProcedure } from '../procedures';

/**
 * oRPC Ask-AI router (Putaran 17, feature replay N-14) — a 1:1 port of
 * `apps/server/src/routes/ask-ai.ts`. Simple chat, no RAG. Auth required and
 * a per-user rate limit (AMW-06 — an unmetered LLM endpoint is forbidden).
 * API key stays server-side only.
 */

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const rateBuckets = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(userId) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );

  if (bucket.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(userId, bucket);
    return true;
  }

  bucket.push(now);
  rateBuckets.set(userId, bucket);
  return false;
}

function generateSyariahKnowledgeResponse(query: string): string {
  const lower = query.toLowerCase();

  if (
    lower.includes('nisab') ||
    lower.includes('profesi') ||
    lower.includes('penghasilan') ||
    lower.includes('gaji')
  ) {
    return `Alhamdulillah, berikut ketentuan Zakat Penghasilan (Profesi) sesuai Fiqih Muamalah dan Fatwa MUI:

1. **Nisab**: Setara dengan 85 gram emas murni per tahun (atau rata-rata sekitar Rp 7.500.000 – Rp 8.500.000 per bulan, tergantung harga emas terkini).
2. **Kadar / Tarif Zakat**: Sebesar 2,5% dari penghasilan bersih atau bruto.
3. **Waktu Penunaian**: Dapat ditunaikan setiap bulan saat menerima gaji agar lebih ringan, atau diakumulasikan dalam satu tahun.
4. **Dalil Syariah**: Firman Allah SWT dalam QS. Al-Baqarah: 267:
   *"Wahai orang-orang yang beriman! Infakkanlah sebagian dari hasil usahamu yang baik-baik..."*

Gunakan fitur Kalkulator Zakat Amwal untuk menghitung kewajiban zakat Anda secara presisi.`;
  }

  if (
    lower.includes('wakaf uang') ||
    lower.includes('cash waqf') ||
    lower.includes('syarat sah wakaf') ||
    lower.includes('wakaf')
  ) {
    if (
      lower.includes('orang tua') ||
      lower.includes('wafat') ||
      lower.includes('meninggal')
    ) {
      return `Alhamdulillah, berwakaf atas nama orang tua yang telah wafat diperbolehkan dan sah menurut ijma' para ulama (Madzhab Hanafi, Maliki, Syafi'i, dan Hanbali).

**Dalil Hadits**:
Dari Sa'ad bin 'Ubadah RA: *"Wahai Rasulullah, sesungguhnya ibuku telah meninggal dunia, apakah sedekah (wakaf) bermanfaat baginya?"* Rasulullah SAW menjawab: *"Ya."* (HR. Abu Dawud & An-Nasa'i).

Pahala dari wakaf tersebut akan terus mengalir sebagai amal jariyah abadi kepada almarhum/almarhumah selama pokok wakaf terus memberikan manfaat kepada umat.`;
    }

    return `Alhamdulillah, berikut panduan mengenai Wakaf Uang (Cash Waqf) dalam syariat Islam:

1. **Definisi**: Wakaf uang adalah penyerahan sejumlah uang tunai untuk dikelola secara produktif dan amanah, di mana pokok dana dijaga abadi dan surplus/manfaatnya disalurkan bagi kemaslahatan umat (mauquf 'alaih).
2. **Prinsip Utama (Invarian Fiqih)**:
   - **Pokok Dana Abadi**: Nilai nominal uang wakaf TIDAK BOLEH berkurang, dijual, atau dihibahkan.
   - **Penyaluran Imbal Hasil**: Yang dibagikan kepada penerima manfaat adalah hasil pengelolaan produktif.
3. **Syarat Sah Wakaf**:
   - Wakif: Baligh, berakal, atas kehendak sendiri.
   - Harta (Mauquf bih): Uang tunai yang sah (Rupiah).
   - Penerima (Mauquf 'alaih): Tujuan kebajikan syariah yang jelas.
   - Shighat: Adanya ijab/akad wakaf.
4. **Landasan Hukum**:
   - Fatwa Komisi Fatwa Majelis Ulama Indonesia (MUI) tanggal 11 Mei 2002.
   - Undang-Undang No. 41 Tahun 2004 tentang Wakaf.`;
  }

  if (
    lower.includes('zakat maal') ||
    lower.includes('emas') ||
    lower.includes('tabungan')
  ) {
    return `Alhamdulillah, berikut ketentuan Zakat Maal (Simpanan / Emas / Tabungan):

1. **Nisab**: Setara dengan 85 gram emas murni.
2. **Syarat Haul**: Harta simpanan telah mengendap dan dimiliki secara penuh selama 1 tahun Hijriyah (haul).
3. **Kadar Zakat**: Sebesar 2,5% dari total saldo simpanan setelah dikurangi hutang jatuh tempo.
4. **Perhitungan**:
   *(Total Saldo Tabungan + Nilai Emas) × 2,5% = Kewajiban Zakat Maal*.`;
  }

  if (lower.includes('qurban') || lower.includes('kurban')) {
    return `Alhamdulillah, berikut ketentuan ibadah Qurban:

1. **Hewan Qurban**:
   - Kambing/Domba: Minimal umur 1 tahun untuk 1 orang shohibul qurban.
   - Sapi/Kerbau: Minimal umur 2 tahun untuk 7 orang shohibul qurban.
2. **Syarat Fisik**: Sehat, tidak buta sebelah, tidak pincang, tidak berpenyakit, dan cukup umur.
3. **Waktu**: Mulai 10 Dzulhijjah setelah shalat Idul Adha hingga 13 Dzulhijjah sebelum maghrib.`;
  }

  return `Alhamdulillah, terima kasih atas pertanyaan Anda kepada Asisten AI Syariah Amwal.

Dalam syariat Islam, pengelolaan harta diarahkan untuk mendatangkan keberkahan dan kemaslahatan melalui:
1. **Zakat**: Kewajiban rukun Islam untuk membersihkan harta (nisab 85 gram emas, 2,5%).
2. **Wakaf Uang**: Investasi akhirat di mana pokok dana abadi dijaga utuh dan manfaatnya terus mengalir.
3. **Infaq & Sedekah**: Amal jariyah sukarela yang dapat ditunaikan kapan saja.

Silakan ajukan pertanyaan seputar zakat profesi, wakaf uang produktif, atau fiqih muamalah lainnya.`;
}

const list = protectedProcedure.handler(async ({ context }) => {
  const user = context.user;
  if (!user) {
    throw new ORPCError('UNAUTHORIZED');
  }

  const [conversation] = await context.db
    .select({ id: chatbotConversations.id })
    .from(chatbotConversations)
    .where(eq(chatbotConversations.userId, user.userId))
    .orderBy(desc(chatbotConversations.createdAt))
    .limit(1);

  if (!conversation) {
    return { data: [] };
  }

  const messages = await context.db
    .select()
    .from(chatbotMessages)
    .where(eq(chatbotMessages.conversationId, conversation.id))
    .orderBy(asc(chatbotMessages.createdAt));

  return { data: messages };
});

/** What the user sees when the RAG service cannot answer. */
const RAG_MESSAGES = {
  busy: 'Asisten sedang melayani banyak pertanyaan. Coba lagi beberapa saat lagi.',
  timeout: 'Asisten membutuhkan waktu terlalu lama. Silakan coba lagi.',
  unavailable: 'Asisten AI sedang tidak tersedia. Silakan coba lagi nanti.',
} as const;

/** Turns a RAG failure into an `ORPCError` with a friendly message. */
function toOrpcError(error: unknown): ORPCError<string, unknown> {
  if (!(error instanceof RagError)) {
    return new ORPCError('SERVICE_UNAVAILABLE', {
      message: RAG_MESSAGES.unavailable,
    });
  }
  switch (error.kind) {
    case 'busy':
      return new ORPCError('TOO_MANY_REQUESTS', { message: RAG_MESSAGES.busy });
    case 'timeout':
      return new ORPCError('GATEWAY_TIMEOUT', {
        message: RAG_MESSAGES.timeout,
      });
    case 'invalid':
      return new ORPCError('BAD_REQUEST', { message: error.message });
    default:
      if (error.kind === 'misconfigured') {
        // biome-ignore lint/suspicious/noConsole: a rejected API key is a deployment problem the operator must see
        console.error('[ask-ai] amwal-rag menolak RAG_API_KEY (HTTP 401/500)');
      }
      return new ORPCError('SERVICE_UNAVAILABLE', {
        message: RAG_MESSAGES.unavailable,
      });
  }
}

interface Answer {
  content: string;
  sources: RagSource[];
}

/**
 * The RAG service when `RAG_API_KEY` is set (failures surface as errors: no
 * invented answer is better than a wrong one on religious questions);
 * otherwise the previous DeepSeek-then-canned path, so a dev machine without
 * the service keeps working.
 */
async function answerQuestion(question: string): Promise<Answer> {
  if (env.RAG_API_KEY) {
    try {
      const result = await askRag(question, {
        apiKey: env.RAG_API_KEY,
        baseUrl: env.RAG_SERVICE_URL,
        timeoutMs: env.RAG_TIMEOUT_MS,
      });
      return { content: withSources(result), sources: result.sources };
    } catch (error) {
      throw toOrpcError(error);
    }
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (apiKey) {
    try {
      const content = await askDeepSeek([{ role: 'user', content: question }], {
        apiKey,
        baseUrl: env.DEEPSEEK_BASE_URL,
      });
      return { content, sources: [] };
    } catch {
      // fall through to the canned answer
    }
  }
  return { content: generateSyariahKnowledgeResponse(question), sources: [] };
}

const send = protectedProcedure
  .input(
    z.object({
      conversationId: z.string().optional(),
      message: z
        .string()
        .trim()
        .min(1, 'Pesan tidak boleh kosong')
        .min(
          RAG_MIN_QUESTION,
          `Pertanyaan minimal ${RAG_MIN_QUESTION} karakter`
        )
        .max(
          RAG_MAX_QUESTION,
          `Pertanyaan maksimal ${RAG_MAX_QUESTION} karakter`
        ),
    })
  )
  .handler(async ({ input, context }) => {
    const user = context.user;
    if (!user) {
      throw new ORPCError('UNAUTHORIZED');
    }

    if (isRateLimited(user.userId)) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: 'Terlalu banyak permintaan. Coba lagi nanti.',
      });
    }

    // Answer first, store after: a failed or timed-out call leaves no orphaned
    // question in the history, so a retry never duplicates it.
    const answer = await answerQuestion(input.message);

    let conversationId = input.conversationId;
    if (!conversationId) {
      conversationId = `CHT-${ulid()}`;
      await context.db.insert(chatbotConversations).values({
        id: conversationId,
        userId: user.userId,
      });
    }

    await context.db.insert(chatbotMessages).values([
      {
        id: `MSG-${ulid()}`,
        conversationId,
        role: 'USER',
        content: input.message,
      },
      {
        id: `MSG-${ulid()}`,
        conversationId,
        role: 'ASSISTANT',
        content: answer.content,
      },
    ]);

    return {
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: answer.content,
        sources: answer.sources,
        disclaimer: 'Jawaban ini bukan fatwa resmi.',
      },
    };
  });

/** Panjang maksimum pertanyaan tamu; lebih ketat dari donatur (QA-09). */
export const GUEST_MAX_QUESTION = 300;

/**
 * Membuang karakter kontrol dan merapikan spasi, supaya tamu tidak bisa
 * menyelundupkan baris/escape ke prompt atau memboroskan token dengan spasi.
 */
function sanitizeQuestion(raw: string): string {
  return [...raw.replace(/\s+/g, ' ')]
    .filter((char) => char >= ' ' && char !== '')
    .join('')
    .trim();
}

/**
 * Tanya Amwal tanpa login (QA-09): tanpa riwayat, tanpa tabel percakapan.
 * Jalur yang sama dengan `send` ke RAG/LLM, tetapi dibatasi per IP, kuota
 * harian, dan panjang pertanyaan.
 */
const ask = publicProcedure
  .input(
    z.object({
      message: z
        .string()
        .transform(sanitizeQuestion)
        .pipe(
          z
            .string()
            .min(1, 'Pesan tidak boleh kosong')
            .min(
              RAG_MIN_QUESTION,
              `Pertanyaan minimal ${RAG_MIN_QUESTION} karakter`
            )
            .max(
              GUEST_MAX_QUESTION,
              `Pertanyaan tamu maksimal ${GUEST_MAX_QUESTION} karakter`
            )
        ),
    })
  )
  .handler(async ({ input, context }) => {
    assertGuestAskAllowed(context.request);
    const answer = await answerQuestion(input.message);
    return {
      data: {
        role: 'ASSISTANT',
        content: answer.content,
        sources: answer.sources,
        disclaimer: 'Jawaban ini bukan fatwa resmi.',
      },
    };
  });

export const askAi = { list, send, ask };
