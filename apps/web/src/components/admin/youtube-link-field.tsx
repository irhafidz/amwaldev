import { parseYoutubeVideoId } from '@amwal/core/education/youtube';
import { CircleAlert, CircleCheck, Youtube } from 'lucide-react';
import { YoutubeEmbed } from '@/components/education/youtube-embed';

/**
 * Satu-satunya input sumber video edukasi: "Tautan Video YouTube".
 *
 * Tidak ada unggah berkas (hemat disk dan bandwidth). Selama tautannya valid,
 * kotak pratinjau menampilkan pemutar yang sama dengan yang dilihat donatur,
 * sehingga admin langsung tahu video yang disematkan benar. Tautan yang tidak
 * valid ditolak dengan pesan jelas — validasi yang sama dijalankan ulang di
 * server (`youtubeLinkSchema`), jadi ini bukan satu-satunya penjaga.
 */
export function YoutubeLinkField({
  id,
  value,
  onChange,
  title,
  required = false,
  showPreview = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Judul iframe pratinjau (aksesibilitas). */
  title: string;
  required?: boolean;
  showPreview?: boolean;
}) {
  const videoId = parseYoutubeVideoId(value);
  const touched = value.trim().length > 0;
  const invalid = touched && !videoId;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-2">
      <label className="block font-bold text-slate-700 text-xs" htmlFor={id}>
        Tautan Video YouTube{' '}
        {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <Youtube
          aria-hidden="true"
          className={`absolute top-3 left-3.5 h-4 w-4 ${videoId ? 'text-red-600' : 'text-slate-400'}`}
        />
        <input
          aria-describedby={hintId}
          aria-invalid={invalid}
          autoComplete="off"
          className={`w-full rounded-xl border bg-white py-2.5 pr-4 pl-10 font-mono text-slate-900 text-xs focus:outline-hidden ${
            invalid
              ? 'border-rose-400 focus:border-rose-500'
              : 'border-slate-300 focus:border-[#1B5E20]'
          }`}
          id={id}
          inputMode="url"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Contoh: https://www.youtube.com/watch?v=... atau https://youtu.be/..."
          required={required}
          spellCheck={false}
          type="text"
          value={value}
        />
      </div>
      <p
        className={`flex items-center gap-1.5 text-xs ${invalid ? 'text-rose-600' : 'text-slate-500'}`}
        id={hintId}
        role={invalid ? 'alert' : undefined}
      >
        {invalid && <CircleAlert aria-hidden="true" className="size-3.5" />}
        {videoId && (
          <CircleCheck
            aria-hidden="true"
            className="size-3.5 text-emerald-600"
          />
        )}
        {invalid && 'Tautan bukan video YouTube yang valid.'}
        {videoId && `Video terdeteksi (ID ${videoId}).`}
        {!touched &&
          'Tempel tautan video dari YouTube. Berkas video tidak dapat diunggah.'}
      </p>

      {showPreview && videoId && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
          <YoutubeEmbed lazy={false} title={title} videoId={videoId} />
        </div>
      )}
    </div>
  );
}
