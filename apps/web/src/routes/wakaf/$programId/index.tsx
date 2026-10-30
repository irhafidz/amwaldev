import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';
import { UserShell } from '@/components/user-shell';
import { WaqfDetail } from '@/components/wakaf/waqf-detail';
import { getWaqfOrderStatus } from '@/lib/amwal-api';

const wakafDetailSearchSchema = z.object({
  status: z.string().optional(),
  orderId: z.coerce.string().optional(),
});

export const Route = createFileRoute('/wakaf/$programId/')({
  validateSearch: wakafDetailSearchSchema,
  component: WaqfDetailPage,
});

interface OrderCandidate {
  id: string;
  programId?: string;
  createdAt?: number;
}

function parseOrderCandidate(key: string): OrderCandidate | null {
  if (!key.startsWith('amwal_order_')) {
    return null;
  }
  const id = key.slice('amwal_order_'.length);
  if (!id) {
    return null;
  }

  let programId: string | undefined;
  let createdAt: number | undefined;

  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.orderId) {
        programId = parsed.programId;
        createdAt =
          typeof parsed.createdAt === 'number' ? parsed.createdAt : undefined;
      }
    }
  } catch {
    // Ignore JSON errors
  }

  return { id, programId, createdAt };
}

function getStoredOrderCandidates(): OrderCandidate[] {
  const candidates: OrderCandidate[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const candidate = parseOrderCandidate(key);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return candidates;
}

function compareCandidates(a: OrderCandidate, b: OrderCandidate): number {
  if (a.createdAt && b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id);
}

function findLatestSessionOrderId(currentProgramId?: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const direct = sessionStorage.getItem('amwal_last_order_id');
  const candidates = getStoredOrderCandidates();

  if (candidates.length === 0) {
    return direct || null;
  }

  if (currentProgramId) {
    const matching = candidates.filter((c) => c.programId === currentProgramId);
    if (matching.length > 0) {
      matching.sort(compareCandidates);
      return matching.at(-1)?.id ?? null;
    }
  }

  candidates.sort(compareCandidates);
  return candidates.at(-1)?.id ?? direct ?? null;
}

function WaqfDetailPage() {
  const { programId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { status, orderId } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (status !== 'success') {
      return;
    }

    const targetOrderId = orderId || findLatestSessionOrderId(programId);
    if (!targetOrderId) {
      return;
    }

    let navigated = false;
    const doNavigate = () => {
      if (!navigated) {
        navigated = true;
        navigate({
          to: '/wakaf/status',
          search: { orderId: targetOrderId },
          replace: true,
        });
      }
    };

    // Safety timeout ensures navigation occurs even if network inquiry is delayed
    const timer = setTimeout(doNavigate, 1500);

    // Ask the server to re-check with the provider; the URL never settles an order.
    getWaqfOrderStatus(targetOrderId)
      .catch(() => {
        // Ignore network errors, status page will also attempt reconciliation
      })
      .finally(() => {
        clearTimeout(timer);
        doNavigate();
      });

    return () => {
      clearTimeout(timer);
    };
  }, [status, orderId, programId, navigate]);

  return (
    <UserShell frame="catalog" showNav={false} user={user}>
      <WaqfDetail programId={programId} user={user} />
    </UserShell>
  );
}
