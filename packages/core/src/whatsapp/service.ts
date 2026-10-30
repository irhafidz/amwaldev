const TRAILING_SLASH_PATTERN = /\/+$/;

export interface SendWhatsAppDeps {
  /** `undefined`/missing means the Baileys service isn't configured. */
  baileysServiceUrl: string | undefined;
  internalSecret: string;
}

/**
 * Sends a WhatsApp notification through the standalone Baileys microservice.
 *
 * Ported from `apps/server/src/lib/whatsapp/service.ts` (Putaran 17, Batch
 * 6) — the only behavioural change is that `baileysServiceUrl`/
 * `internalSecret` are now explicit parameters instead of reading a
 * module-level `env` (a shared package cannot assume any one app's
 * environment). Best-effort: never throws. Returns `false` on missing
 * configuration, timeout, network error, or a non-OK response — a failed
 * notification must never roll back a settled payment (SECURITY §4).
 */
export async function sendWhatsAppNotification(
  phone: string,
  message: string,
  deps: SendWhatsAppDeps
): Promise<boolean> {
  const baseUrl = deps.baileysServiceUrl;
  if (!baseUrl) {
    return false;
  }
  if (!(phone && message)) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const cleanBase = baseUrl.replace(TRAILING_SLASH_PATTERN, '');
    const targetUrl =
      cleanBase.endsWith('/api/wa/send') || cleanBase.endsWith('/send-message')
        ? cleanBase
        : `${cleanBase}/api/wa/send`;

    let response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': deps.internalSecret,
      },
      body: JSON.stringify({ to: phone, phone, message }),
      signal: controller.signal,
    });

    if (response.status === 404 && !cleanBase.endsWith('/send-message')) {
      response = await fetch(`${cleanBase}/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': deps.internalSecret,
        },
        body: JSON.stringify({ to: phone, phone, message }),
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}
