import { CheckCircle2, User } from 'lucide-react';
import { getInfaqDonors } from '@/lib/amwal-api';
import { formatRupiah, toNumber } from '@/lib/amwal-api/format';
import { useResource } from '@/lib/amwal-api/use-resource';
import { infaqLabel } from './infaq-programs';

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

/**
 * Tabel publik donatur infaq (QA-12): hanya donasi yang sudah lunas, nama
 * anonim tampil "Hamba Allah". Tamu pun bisa melihatnya — bukti sosial bahwa
 * dana benar-benar mengalir.
 */
export function InfaqDonorsTable() {
  const { state } = useResource(getInfaqDonors);
  const donors = state.status === 'success' ? state.data : [];

  if (state.status === 'success' && donors.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="infaq-donors-heading"
      className="mt-8 rounded-3xl border border-[#e2ece8] bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2
        className="font-extrabold text-gray-900 text-lg tracking-tight dark:text-white"
        id="infaq-donors-heading"
      >
        Donatur Infaq &amp; Sedekah
      </h2>
      <p className="mt-1 text-gray-500 text-xs sm:text-sm dark:text-slate-400">
        Donasi terbaru yang sudah kami terima. Terima kasih, semoga menjadi amal
        jariyah.
      </p>

      {state.status === 'loading' && (
        <p className="mt-4 text-gray-400 text-sm">Memuat donatur…</p>
      )}
      {state.status === 'error' && (
        <p className="mt-4 text-gray-400 text-sm">
          Daftar donatur belum dapat dimuat.
        </p>
      )}

      {donors.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-gray-100 border-b text-gray-500 text-xs dark:border-slate-800">
                <th className="py-2 pr-3 font-semibold" scope="col">
                  Donatur
                </th>
                <th
                  className="hidden px-3 py-2 font-semibold sm:table-cell"
                  scope="col"
                >
                  Program
                </th>
                <th className="px-3 py-2 text-right font-semibold" scope="col">
                  Nominal
                </th>
                <th className="py-2 pl-3 text-right font-semibold" scope="col">
                  Tanggal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {donors.map((donor) => {
                const anonymous = donor.donorName === 'Hamba Allah';
                return (
                  <tr key={donor.id}>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                        {anonymous ? (
                          <User
                            aria-hidden="true"
                            className="size-4 text-slate-400"
                          />
                        ) : (
                          <CheckCircle2
                            aria-hidden="true"
                            className="size-4 text-emerald-600"
                          />
                        )}
                        {donor.donorName}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-gray-600 sm:table-cell dark:text-slate-300">
                      {infaqLabel(donor.jenis)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-[#356152] tabular-nums dark:text-emerald-400">
                      {formatRupiah(toNumber(donor.nominal) || 0)}
                    </td>
                    <td className="py-3 pl-3 text-right text-gray-500 text-xs tabular-nums">
                      {dateFormat.format(new Date(donor.createdAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
