import { Link } from '@tanstack/react-router';
import { Building2, CheckCircle2, ChevronRight, MapPin } from 'lucide-react';
import { nadzirKategoriLabel } from '@/lib/nadzir-labels';

interface WakafNazhirCardProps {
  nazhir?: {
    id: string;
    namaLembaga?: string | null;
    kategori?: string | null;
    statusVerifikasi?: string | null;
  } | null;
  location?: string | null;
}

export function WakafNazhirCard({ nazhir, location }: WakafNazhirCardProps) {
  const lembagaName = nazhir?.namaLembaga || 'Yayasan Pengelola Wakaf';
  const isVerified =
    nazhir?.statusVerifikasi === 'VERIFIED' ||
    nazhir?.statusVerifikasi === 'TERDAFTAR_BWI';
  const initial = lembagaName.charAt(0).toUpperCase();

  // Profil publik hanya ada untuk lembaga terverifikasi (D6).
  const profileId =
    nazhir?.statusVerifikasi === 'VERIFIED' ? nazhir.id : undefined;

  const row = (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition-all hover:border-emerald-200/80 sm:gap-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 font-black text-lg text-white shadow-sm sm:size-14 sm:text-xl">
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <h3 className="truncate font-bold text-gray-900 text-sm sm:text-base">
            {lembagaName}
          </h3>

          {isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-[10px] text-emerald-700">
              <CheckCircle2 className="size-3 text-emerald-600" />
              Terdaftar BWI
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 font-medium text-gray-500 text-xs">
          <span className="inline-flex items-center gap-1">
            <Building2 className="size-3.5 text-gray-400" />
            {nadzirKategoriLabel(nazhir?.kategori)}
          </span>

          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="size-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{location || 'Indonesia'}</span>
          </span>
        </div>
      </div>

      {profileId && (
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-gray-400"
        />
      )}
    </div>
  );

  return (
    <div className="my-6">
      <h2 className="mb-3 font-bold text-base text-gray-900 sm:text-lg">
        Profil Pengelola (Nazhir)
      </h2>

      {profileId ? (
        <Link
          aria-label={`Lihat profil ${lembagaName}`}
          className="block"
          params={{ id: profileId }}
          to="/lembaga/$id"
        >
          {row}
        </Link>
      ) : (
        row
      )}
    </div>
  );
}
