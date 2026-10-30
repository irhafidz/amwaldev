/**
 * Perekam klip video untuk dokumentasi HKI Amwal.
 *
 * Frame diambil lewat loop CDP `Page.captureScreenshot` (JPEG, resolusi DPR
 * penuh) lalu di-encode FFmpeg menjadi MP4 H.264 dengan frame rate tetap,
 * karena encoder webm bawaan Playwright terlalu buram dan screencast CDP di
 * headless selalu memakai piksel CSS (1280×720). Setiap frame dicatat
 * waktunya dan ditahan sesuai durasinya (concat demuxer FFmpeg).
 *
 * Gerak lambat: capture 1080p penuh hanya ±12 fps, jadi seluruh adegan
 * diputar `SLOWMO`× lebih lambat (jeda, gulir, gerak kursor, animasi CSS via
 * `Animation.setPlaybackRate`) lalu timestamp frame dibagi `SLOWMO` saat
 * encode. Hasilnya tajam dan ±30 fps. Timer JS aplikasi (mis. autoplay
 * carousel) tidak ikut melambat, jadi di video tampak `SLOWMO`× lebih cepat.
 *
 * Kursor tiruan disuntikkan ke halaman (Chrome headless tidak menggambar
 * kursor), lengkap dengan riak saat klik, supaya penonton bisa mengikuti
 * gerakan seperti pada rekaman layar biasa.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..');
export const OUT_DIR = resolve(ROOT, 'video_assets');
export const BASE = process.env.VIDEO_BASE_URL ?? 'http://localhost:3000';
export const FPS = 30;
export const SLOWMO = Number(process.env.VIDEO_SLOWMO ?? 3);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

/** Untuk `.catch()` pada langkah opsional yang boleh gagal diam-diam. */
export const ignoreError = () => null;

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Jeda dalam waktu VIDEO (otomatis dikalikan SLOWMO). */
export const sleep = (ms) => realSleep(ms * SLOWMO);

/** Desktop: viewport 1280×720 dirender 1,5× → frame 1920×1080. */
export const DESKTOP = { width: 1280, height: 720, scale: 1.5 };
/** Backoffice: viewport 1440×810 dirender 4/3× → 1920×1080 (tab admin muat). */
export const WIDE = { width: 1440, height: 810, scale: 4 / 3 };
/** Mobile: 390×844 dirender 3× → frame 1170×2532 (dipasang di bingkai HP). */
export const MOBILE = { width: 390, height: 844, scale: 3 };

const CURSOR_SCRIPT = `
(() => {
  if (window.__amwalCursor) return;
  window.__amwalCursor = true;
  const install = () => {
    const c = document.createElement('div');
    c.id = '__amwal-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;transition:transform 60ms linear;';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><title>cursor</title><path d="M4 2l15 11-7 1-4 7z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    // Posisi bertahan antarhalaman (dokumen baru belum menerima mousemove).
    const place = (x, y) => {
      c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    };
    try {
      const last = JSON.parse(sessionStorage.getItem('__amwalCursor') || 'null');
      if (last) place(last.x, last.y); else place(-40, -40);
    } catch { place(-40, -40); }
    document.addEventListener('mousemove', (e) => {
      place(e.clientX, e.clientY);
      try { sessionStorage.setItem('__amwalCursor', JSON.stringify({ x: e.clientX, y: e.clientY })); } catch {}
    }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border-radius:9999px;border:3px solid #356152;width:12px;height:12px;left:' + (e.clientX - 6) + 'px;top:' + (e.clientY - 6) + 'px;opacity:.9;transition:all 450ms ease-out;';
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => {
        r.style.width = r.style.height = '44px';
        r.style.left = (e.clientX - 22) + 'px';
        r.style.top = (e.clientY - 22) + 'px';
        r.style.opacity = '0';
      });
      setTimeout(() => r.remove(), 600 * __SLOWMO__);
    }, true);
  };
  if (document.documentElement) install();
  else document.addEventListener('DOMContentLoaded', install);
})();
`;

export async function launch() {
  if (!CHROME) {
    throw new Error('Chrome/Edge tidak ditemukan.');
  }
  return await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
}

export async function newPage(
  browser,
  device = DESKTOP,
  { cursor = true } = {}
) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    isMobile: device === MOBILE,
    hasTouch: device === MOBILE,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    colorScheme: 'light',
  });
  if (cursor && device !== MOBILE) {
    await context.addInitScript(
      CURSOR_SCRIPT.replace('__SLOWMO__', String(SLOWMO))
    );
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

/**
 * Mulai merekam `page`. Kembalikan fungsi `stop(name)` yang menulis
 * `video_assets/<name>.mp4` dan mengembalikan path-nya.
 */
export async function startRecording(page) {
  const frameDir = join(
    OUT_DIR,
    '.frames',
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(frameDir, { recursive: true });
  // Hanya untuk memperlambat animasi CSS. Capture memakai page.screenshot()
  // Playwright: sesi CDP baru tidak mewarisi DPR (frame 1280×720), dan
  // override metrik/clip.scale di sesi lain mengacaukan koordinat mouse dan
  // membuat navigasi macet.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOWMO });
  const frames = [];
  let writing = Promise.resolve();
  let running = true;

  // Loop captureScreenshot (bukan screencast): hanya cara mendapat frame
  // seukuran DPR penuh di Chrome headless (~70–90 ms/frame).
  const loop = (async () => {
    while (running) {
      const t = Date.now() / 1000;
      try {
        const data = await page.screenshot({
          type: 'jpeg',
          quality: 92,
          animations: 'allow',
          caret: 'initial',
          scale: 'device',
          timeout: 5000,
        });
        const file = join(
          frameDir,
          `f${String(frames.length).padStart(6, '0')}.jpg`
        );
        frames.push({ file, t });
        writing = writing.then(() => writeFileSync(file, data));
      } catch (error) {
        // Halaman sedang bernavigasi: lewati frame ini.
        if (process.env.VIDEO_DEBUG) {
          process.stderr.write(`capture: ${error.message}
`);
        }
        await realSleep(15);
      }
    }
  })();
  const startedAt = Date.now() / 1000;

  return async function stop(name) {
    const endedAt = Date.now() / 1000;
    running = false;
    await loop;
    await writing;
    await cdp
      .send('Animation.setPlaybackRate', { playbackRate: 1 })
      .catch(ignoreError);
    await cdp.detach().catch(ignoreError);
    if (frames.length === 0) {
      throw new Error(`Tidak ada frame terekam untuk ${name}`);
    }

    // Durasi tiap frame = selisih ke frame berikutnya; frame pertama mulai
    // di awal rekaman, frame terakhir bertahan sampai rekaman dihentikan.
    const lines = [];
    frames[0].t = Math.min(frames[0].t, startedAt);
    for (let i = 0; i < frames.length; i += 1) {
      const next = i + 1 < frames.length ? frames[i + 1].t : endedAt;
      // Frame lebih rapat dari 1/FPS dibuang oleh filter fps — jangan dijepit.
      const duration = Math.max((next - frames[i].t) / SLOWMO, 0.001);
      lines.push(`file '${frames[i].file.replaceAll('\\', '/')}'`);
      lines.push(`duration ${duration.toFixed(4)}`);
    }
    lines.push(`file '${frames.at(-1).file.replaceAll('\\', '/')}'`);
    const list = join(frameDir, 'frames.txt');
    writeFileSync(list, `${lines.join('\n')}\n`);

    const out = join(OUT_DIR, `${name}.mp4`);
    mkdirSync(dirname(out), { recursive: true });
    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-vf',
        `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '16',
        '-movflags',
        '+faststart',
        out,
      ],
      { encoding: 'utf8' }
    );
    if (ffmpeg.status !== 0) {
      throw new Error(`ffmpeg gagal untuk ${name}: ${ffmpeg.stderr}`);
    }
    if (!process.env.VIDEO_KEEP_FRAMES) {
      rmSync(frameDir, { recursive: true, force: true });
    }
    return out;
  };
}

const cursorAt = new WeakMap();

/** Gerakkan kursor dengan kurva ease-in-out selama `ms` (waktu video). */
export async function glide(page, x, y, ms = 600) {
  const from = cursorAt.get(page) ?? { x: 640, y: 360 };
  const steps = Math.max(Math.round(ms / 25), 2);
  for (let i = 1; i <= steps; i += 1) {
    const p = i / steps;
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(ms / steps);
  }
  cursorAt.set(page, { x, y });
}

/** Gerakkan kursor dengan halus ke tengah elemen, lalu klik. */
export async function click(page, locator, { pause = 350 } = {}) {
  const target = typeof locator === 'string' ? page.locator(locator) : locator;
  await target.first().scrollIntoViewIfNeeded();
  const box = await target.first().boundingBox();
  if (!box) {
    throw new Error(`Elemen tidak terlihat: ${locator}`);
  }
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

/** Ketik seperti manusia (jeda per karakter). */
export async function type(page, locator, text, delay = 70) {
  await click(page, locator, { pause: 250 });
  await page.keyboard.type(text, { delay: delay * SLOWMO });
}

/** Gulir halus sejauh `distance` piksel CSS dalam `ms` milidetik. */
export async function smoothScroll(page, distance, ms = 2500) {
  await page.evaluate(
    ([d, duration]) =>
      new Promise((done) => {
        const start = window.scrollY;
        const t0 = performance.now();
        const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
        // performance.now(), bukan timestamp rAF: Animation.setPlaybackRate
        // ikut memperlambat jam rAF sehingga gulir melambat dua kali.
        const step = () => {
          const p = Math.min((performance.now() - t0) / duration, 1);
          window.scrollTo(0, start + d * ease(p));
          if (p < 1) {
            requestAnimationFrame(step);
          } else {
            done();
          }
        };
        requestAnimationFrame(step);
      }),
    [distance, ms * SLOWMO]
  );
}

export async function settle(page, ms = 800) {
  await page.waitForLoadState('networkidle').catch(ignoreError);
  await sleep(ms);
}
