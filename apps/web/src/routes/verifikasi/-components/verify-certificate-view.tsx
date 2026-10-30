'use client';

import type { CertificateVerification } from '@amwal/core/certificate/service';
import { BadgeCheck, CalendarClock, FileWarning, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useResource } from '@/lib/amwal-api/use-resource';
import { orpc } from '@/lib/orpc/client';

/**
 * Public certificate verification surface (`I-5`).
 *
 * Anyone who scans the QR on a printed certificate lands here, with no
 * session — so the page renders exactly what the public contract returns and
 * nothing else: number, validity, module & program title, transaction
 * date-time, and the donor name (masked by the server when the donation was
 * anonymous). The nominal is deliberately absent, and saying so out loud is
 * better than letting a reader assume a hidden field exists.
 */

type Verification =
  | { status: 'found'; data: CertificateVerification }
  | { status: 'missing' };

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'NOT_FOUND'
  );
}

/** Maps oRPC's `NOT_FOUND` to a first-class state; other failures stay errors. */
async function verify(nomor: string): Promise<Verification> {
  try {
    return { status: 'found', data: await orpc.certificate.verify({ nomor }) };
  } catch (error) {
    if (isNotFound(error)) {
      return { status: 'missing' };
    }
    throw error;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-border-subtle border-b py-3 last:border-b-0">
      <dt className="shrink-0 text-label-caption text-text-secondary">
        {label}
      </dt>
      <dd className="text-right font-semibold text-label-caption text-text-primary">
        {value}
      </dd>
    </div>
  );
}

function Verdict({ valid }: { valid: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-card border p-4 ${
        valid
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      {valid ? (
        <BadgeCheck aria-hidden="true" className="size-6 shrink-0" />
      ) : (
        <ShieldX aria-hidden="true" className="size-6 shrink-0" />
      )}
      <div>
        <p className="font-bold text-title-s">
          {valid ? 'Sertifikat sah' : 'Sertifikat tidak sah'}
        </p>
        <p className="text-label-caption">
          {valid
            ? 'Transaksi tercatat LUNAS dan sertifikat terbit dari platform Amwal.'
            : 'Sertifikat terdaftar, tetapi transaksinya belum tercatat LUNAS. Jangan menganggapnya sah sebelum pembayaran diverifikasi.'}
        </p>
      </div>
    </div>
  );
}

function MissingState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border-subtle border-dashed bg-bg-cream px-6 py-12 text-center">
      <FileWarning aria-hidden="true" className="size-8 text-amber-500" />
      <p className="font-bold text-text-primary text-title-s">
        Sertifikat tidak ditemukan
      </p>
      <p className="max-w-sm text-label-caption text-text-secondary">
        Nomor ini tidak terdaftar di platform Amwal. Periksa kembali penulisan
        nomor pada sertifikat — nomor selalu berformat{' '}
        <code className="font-mono">CERT-AMW-TAHUN-NNNN</code>.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-20 w-full rounded-card" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/5" />
      <span className="sr-only">Memeriksa sertifikat…</span>
    </div>
  );
}

export function VerifyCertificateView({ nomor }: { nomor: string }) {
  const resource = useResource(() => verify(nomor));

  return (
    <main className="flex min-h-dvh justify-center bg-bg-cream px-4 py-8">
      <div className="w-full max-w-md">
        <header className="mb-5">
          <p className="font-semibold text-brand-primary text-label-caption uppercase tracking-wide">
            Amwal · Platform Islamic Social Finance
          </p>
          <h1 className="mt-1 font-bold text-heading-l text-text-primary">
            Verifikasi Sertifikat
          </h1>
          <p className="mt-1 text-label-caption text-text-secondary">
            Halaman ini hanya menampilkan status keabsahan sertifikat. Nominal
            donasi tidak ditampilkan.
          </p>
        </header>

        <section className="rounded-card border border-border-subtle bg-white p-5 shadow-card">
          {resource.state.status === 'loading' && <LoadingState />}

          {resource.state.status === 'error' && (
            <output
              aria-live="polite"
              className="flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-amber-800 text-label-caption"
            >
              <FileWarning aria-hidden="true" className="size-5 shrink-0" />
              <span>
                Gagal memeriksa sertifikat: {resource.state.error}. Coba muat
                ulang halaman ini.
              </span>
            </output>
          )}

          {resource.state.status === 'success' &&
            resource.state.data.status === 'missing' && <MissingState />}

          {resource.state.status === 'success' &&
            resource.state.data.status === 'found' && (
              <div className="flex flex-col gap-4">
                <Verdict valid={resource.state.data.data.valid} />

                <div className="flex items-center gap-2 text-label-caption text-text-secondary">
                  <CalendarClock aria-hidden="true" className="size-4" />
                  <span>Diperiksa langsung dari basis data platform Amwal</span>
                </div>

                <dl className="mt-1">
                  <Row
                    label="Nomor sertifikat"
                    value={resource.state.data.data.nomor}
                  />
                  <Row
                    label="Jenis"
                    value={resource.state.data.data.jenis ?? '—'}
                  />
                  <Row
                    label="Program"
                    value={resource.state.data.data.programTitle ?? '—'}
                  />
                  <Row
                    label="Tanggal transaksi"
                    value={resource.state.data.data.tanggalTransaksiLabel}
                  />
                  <Row
                    label="Donatur"
                    value={resource.state.data.data.namaDonatur ?? '—'}
                  />
                </dl>

                <Badge
                  className="self-start border-border-subtle text-text-secondary"
                  variant="outline"
                >
                  Nominal tidak ditampilkan · nama sebagai inisial
                </Badge>
              </div>
            )}
        </section>
      </div>
    </main>
  );
}
