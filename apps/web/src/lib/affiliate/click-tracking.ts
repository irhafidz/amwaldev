import { createHmac } from 'node:crypto';
import { wibParts } from '@amwal/core/time/wib';
import { ulid } from 'ulidx';
import { env } from '@/env/server';
import { clientIp } from '@/lib/auth/login-throttle';
import { db } from '@/lib/db';
import { affiliateClicks } from '@/lib/db/schema';

const FALLBACK_USER_AGENT = 'unknown-user-agent';

function wibDateKey(date: Date): string {
  const parts = wibParts(date);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');

  return `${parts.year}-${month}-${day}`;
}

/**
 * Hash harian IP + User-Agent. IP mentah tidak pernah disimpan; hanya HMAC
 * yang dipakai untuk deduplikasi klik per kode per hari WIB.
 */
export function hashClick(ip: string, userAgent: string, date: Date): string {
  return createHmac('sha256', env.INTERNAL_SECRET)
    .update(`${ip}\n${userAgent}\n${wibDateKey(date)}`)
    .digest('hex');
}

export async function recordAffiliateClick(
  code: string,
  request: Request
): Promise<void> {
  const now = new Date();
  const userAgent =
    request.headers.get('user-agent')?.trim() || FALLBACK_USER_AGENT;

  await db
    .insert(affiliateClicks)
    .values({
      id: `CLK-${ulid()}`,
      referralCode: code,
      clickHash: hashClick(clientIp(request), userAgent, now),
      clickDate: wibDateKey(now),
    })
    .onConflictDoNothing();
}
