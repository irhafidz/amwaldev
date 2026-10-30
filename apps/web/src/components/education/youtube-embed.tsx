import { youtubeEmbedUrl } from '@amwal/core/education/youtube';

/**
 * Pemutar video edukasi: iframe YouTube responsif (16:9) dengan layar penuh.
 *
 * Alamat iframe selalu dibangun dari ID 11 karakter hasil `parseYoutubeVideoId`
 * (domain `youtube-nocookie.com`), bukan dari teks yang disimpan admin.
 * `allowFullScreen` + `allow="fullscreen"` mengaktifkan tombol layar penuh
 * pemutar, termasuk di iOS/Android.
 */
export function YoutubeEmbed({
  videoId,
  title,
  autoplay = false,
  lazy = true,
}: {
  videoId: string;
  title: string;
  autoplay?: boolean;
  lazy?: boolean;
}) {
  return (
    <iframe
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      className="aspect-video w-full rounded-xl bg-slate-900"
      loading={lazy ? 'lazy' : 'eager'}
      referrerPolicy="strict-origin-when-cross-origin"
      src={youtubeEmbedUrl(videoId, { autoplay })}
      title={title}
    />
  );
}
