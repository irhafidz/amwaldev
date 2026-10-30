import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  FileCheck2,
  MapPin,
  Phone,
} from 'lucide-react';
import { WaqfProgramCard } from '@/components/wakaf/program-card';
import { getLembagaProfile } from '@/lib/amwal-api';
import { useResource } from '@/lib/amwal-api/use-resource';
import { nadzirKategoriLabel } from '@/lib/nadzir-labels';

/**
 * Profil publik lembaga nazhir (D6): identitas, nomor registrasi BWI, wilayah
 * operasional, dan program wakaf aktif yang dikelolanya. Dibuka tamu.
 */
export function LembagaProfileView({ id }: { id: string }) {
  const { state } = useResource(() => getLembagaProfile(id), {
    key: `lembaga:${id}`,
  });

  if (state.status === 'loading') {
    return (
      <div
        aria-busy="true"
        className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-slate-800"
      />
    );
  }
  if (state.status === 'error') {
    return (
      <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h1 className="font-bold text-gray-900 text-lg dark:text-white">
          Profil lembaga tidak ditemukan
        </h1>
        <p className="mt-1 text-gray-500 text-sm">
          Lembaga ini belum terverifikasi atau tautannya tidak berlaku.
        </p>
        <Link
          className="mt-4 inline-flex rounded-xl bg-[#356152] px-4 py-2 font-bold text-white text-xs"
          to="/wakaf"
        >
          Lihat Program Wakaf
        </Link>
      </div>
    );
  }

  const lembaga = state.data;
  const name = lembaga.namaLembaga || 'Lembaga Nazhir';

  return (
    <div className="flex flex-col gap-6">
      <Link
        className="inline-flex w-fit items-center gap-1.5 font-semibold text-[#356152] text-xs hover:underline"
        to="/wakaf"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Program Wakaf
      </Link>

      <header className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 font-black text-white text-xl">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-2xl text-gray-900 tracking-tight dark:text-white">
              {name}
            </h1>
            <p className="mt-1 inline-flex items-center gap-1.5 text-gray-500 text-sm">
              <Building2 aria-hidden="true" className="size-4" />
              {nadzirKategoriLabel(lembaga.kategori)}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Fact
            icon={<BadgeCheck aria-hidden="true" className="size-4" />}
            label="Status"
            value="Terverifikasi Amwal"
          />
          <Fact
            icon={<FileCheck2 aria-hidden="true" className="size-4" />}
            label="Nomor Registrasi BWI"
            value={lembaga.nomorRegistrasiBwi || 'Menunggu pencatatan'}
          />
          {lembaga.kontakPublik && (
            <Fact
              icon={<Phone aria-hidden="true" className="size-4" />}
              label="Kontak / Narahubung Resmi"
              value={lembaga.kontakPublik}
            />
          )}
          <Fact
            icon={<MapPin aria-hidden="true" className="size-4" />}
            label="Wilayah Operasional"
            value={
              lembaga.wilayah.length > 0
                ? lembaga.wilayah.join(' · ')
                : 'Seluruh Indonesia'
            }
          />
        </dl>
      </header>

      <section aria-labelledby="lembaga-programs">
        <h2
          className="mb-3 font-bold text-gray-900 text-lg dark:text-white"
          id="lembaga-programs"
        >
          Program Wakaf Aktif ({lembaga.programs.length})
        </h2>
        {lembaga.programs.length === 0 ? (
          <p className="rounded-2xl border border-gray-200 border-dashed p-6 text-center text-gray-500 text-sm">
            Belum ada program wakaf aktif dari lembaga ini.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {lembaga.programs.map((program) => (
              <WaqfProgramCard
                key={program.id}
                program={program}
                variant="grid"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f2f6f4] p-3.5 dark:bg-slate-800">
      <dt className="flex items-center gap-1.5 font-semibold text-gray-500 text-xs dark:text-slate-400">
        <span className="text-[#356152]">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 font-bold text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}
