export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT =
  'Kamu adalah asisten fiqih Amwal (wakaf, zakat, infaq, qurban) untuk platform Amwal. ' +
  'Jawab dalam Bahasa Indonesia, ringkas, dan rujuk mazhab yang umum dipakai di Indonesia. ' +
  'Selalu akhiri dengan pengingat bahwa jawaban ini bukan fatwa resmi dan pengguna sebaiknya ' +
  'berkonsultasi dengan lembaga yang berwenang.';

/**
 * Calls the DeepSeek chat-completions endpoint (OpenAI-compatible). Env-free:
 * the API key and base URL are explicit parameters, so a shared kernel package
 * never assumes an app's environment (Putaran 17, Batch 1 rule).
 */
export async function askDeepSeek(
  messages: ChatMessage[],
  opts: { apiKey: string; baseUrl: string }
): Promise<string> {
  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}
