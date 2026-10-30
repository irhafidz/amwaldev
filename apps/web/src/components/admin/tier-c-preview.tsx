'use client';

import { LockKeyhole, ServerOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { probeTierCEndpoint } from '@/lib/amwal-api/admin';

/**
 * Standardised honest placeholder for a Tier C scaffold. Renders no numbers,
 * no rows, nothing that can be mistaken for live data (AMW-10 / AMW-11). The
 * visual chrome around it (headers, filters, table headings) is ported 1:1,
 * but the data surface always resolves to this panel until the module leaves
 * Tier C scope.
 */
export function TierCPreview({
  headline = 'Pratinjau — data belum tersedia',
  detail,
  endpoint,
}: {
  headline?: string;
  detail: string;
  endpoint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 border-dashed bg-amber-50/40 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
        <LockKeyhole aria-hidden="true" className="size-6" />
      </div>
      <p className="font-bold text-slate-700 text-sm">{headline}</p>
      <p className="max-w-md text-slate-500 text-xs leading-relaxed">
        {detail}
      </p>
      {endpoint && (
        <code className="rounded-md border border-amber-200 bg-white px-2 py-1 font-mono text-[11px] text-amber-700">
          {endpoint} → belum tersedia
        </code>
      )}
    </div>
  );
}

/** Table-body variant: keeps the ported column headers, empties the rows. */
export function TierCTableRow({
  colSpan,
  detail,
}: {
  colSpan: number;
  detail: string;
}) {
  return (
    <tr>
      <td className="px-4 py-16 text-center" colSpan={colSpan}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-2">
          <LockKeyhole aria-hidden="true" className="size-6 text-amber-500" />
          <p className="font-semibold text-slate-600 text-sm">
            Pratinjau — belum ada data
          </p>
          <p className="text-slate-400 text-xs leading-relaxed">{detail}</p>
        </div>
      </td>
    </tr>
  );
}

function describeProbe(status: number | null): string {
  if (status === null) {
    return 'sedang diperiksa…';
  }
  if (status === 501) {
    return 'mengembalikan 501 (belum diimplementasikan). Tampilan di bawah adalah kerangka UI final.';
  }
  if (status === 404) {
    return 'belum punya backend sama sekali. Tampilan di bawah adalah kerangka UI final.';
  }
  return `mengembalikan status ${status}. Konten belum aktif.`;
}

/**
 * Live probe of a Tier C stub endpoint. Shows whatever HTTP status the server
 * actually returns rather than assuming one — so the banner can never drift
 * from what the backend really does.
 *
 * Since `apps/server` was decommissioned (Batch 6) these paths return 404,
 * not the 501 the Hono-era stubs used to serve: nothing answers them at all
 * now. Both readings are honest and both are handled above; the module stays
 * Tier C either way.
 */
export function TierCStubBanner({ endpoint }: { endpoint: string }) {
  const [status, setStatus] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    probeTierCEndpoint(endpoint)
      .then((r) => {
        if (alive) {
          setStatus(r.status);
        }
      })
      .catch(() => {
        if (alive) {
          setStatus(0);
        }
      });
    return () => {
      alive = false;
    };
  }, [endpoint]);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <ServerOff
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-600"
      />
      <div className="text-xs leading-relaxed">
        <p className="font-bold text-amber-900">
          Modul ini masih Tier C (PRATINJAU).
        </p>
        <p className="text-amber-800">
          Endpoint <code className="font-mono">{endpoint}</code>{' '}
          {describeProbe(status)}
        </p>
      </div>
    </div>
  );
}
