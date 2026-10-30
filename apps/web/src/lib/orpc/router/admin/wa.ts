import { callWaBot } from '@/lib/whatsapp/bot-client';
import { adminProcedure } from '../../procedures';

export type WaGatewayState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'SCAN_QR'
  | 'SERVICE_OFFLINE';

export interface WaGatewayStatus {
  phone?: string;
  qrCodeDataUrl?: string;
  reason?: string;
  status: WaGatewayState;
}

/**
 * wa-bot answers 401 when its `INTERNAL_SECRET` differs from this app's. Say
 * so instead of a bare `http-401`: the two live in separate env files
 * (`apps/web/.env` and `apps/wa-bot/.env`) and silently drift apart.
 */
function describeFailure(result: { reason: string; status: number | null }) {
  if (result.status === 401 || result.status === 403) {
    return `Ditolak wa-bot (${result.reason}): INTERNAL_SECRET di apps/wa-bot/.env harus sama dengan apps/web/.env`;
  }
  return result.reason;
}

async function proxyWaBot(path: string, init?: RequestInit) {
  const result = await callWaBot(path, init);
  if (result.ok) {
    return result.body;
  }
  return { status: 'SERVICE_OFFLINE', reason: describeFailure(result) };
}

const getStatus = adminProcedure.handler(async () => {
  return { data: (await proxyWaBot('/api/wa/status')) as WaGatewayStatus };
});

const disconnect = adminProcedure.handler(async () => {
  const body = await proxyWaBot('/api/wa/logout', { method: 'POST' });
  return { data: body as WaGatewayStatus };
});

export const wa = {
  getStatus,
  disconnect,
};
