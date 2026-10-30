/**
 * Memutar ulang tangkapan `capture-terminal.mjs` di jendela terminal HTML
 * lalu merekamnya 1920×1080 → `video_assets/<nama>.mp4`.
 *
 *   node record-terminal.mjs s10-tests
 *   node record-terminal.mjs s06-git-log
 *
 * Output yang tampil adalah output asli; hanya waktunya yang dipadatkan
 * (`TARGET`) dan dua jenis derau dibuang (`NOISE`): baris jejak tumpukan
 * `    at …` dari tes yang memang menguji jalur error, serta peringatan
 * lockfile turbo yang tidak berkaitan dengan hasil tes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP,
  launch,
  newPage,
  OUT_DIR,
  SLOWMO,
  sleep,
  startRecording,
} from './lib.mjs';

/** Durasi tampil (detik video) per langkah, menggantikan durasi aslinya. */
const TARGET = {
  's10-tests': [3.5, 6, 10],
  's06-git-log': [2.5, 2.5, 1],
};

const NOISE = [/^\s+at\s/, /Unable to calculate transitive closures/];

const ANSI_FG = {
  30: '#5c6370',
  31: '#f07178',
  32: '#7fd48a',
  33: '#e6c07b',
  34: '#7aa7f0',
  35: '#c792ea',
  36: '#6cc8c0',
  37: '#d6dde0',
  90: '#7f8c8d',
  91: '#ff8a80',
  92: '#9be7a5',
  93: '#ffe08a',
  94: '#9ec1ff',
  95: '#e1a6ff',
  96: '#8fe3dc',
  97: '#ffffff',
};

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// ESC dibangun dari kode karakter: karakter kontrol di literal regex
// ditolak linter (noControlCharactersInRegex).
const ESC = String.fromCharCode(27);
const SGR_SPLIT = new RegExp(`(${ESC}\\[[0-9;]*m)`);
const SGR_ONE = new RegExp(`^${ESC}\\[([0-9;]*)m$`);
const ANY_CSI = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');
const ANY_SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const PLAIN = { color: null, bold: false, dim: false };

const SGR_RULES = {
  0: () => PLAIN,
  1: (style) => ({ ...style, bold: true }),
  2: (style) => ({ ...style, dim: true }),
  22: (style) => ({ ...style, bold: false, dim: false }),
  39: (style) => ({ ...style, color: null }),
};

/** Terapkan satu deret kode SGR ke gaya saat ini. */
function applySgr(style, codes) {
  let next = style;
  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];
    if (code === 38 && codes[i + 1] === 5) {
      // Warna 256: dipetakan kasar ke 8 warna dasar.
      next = { ...next, color: ANSI_FG[30 + (codes[i + 2] % 8)] ?? null };
      i += 2;
    } else if (SGR_RULES[code]) {
      next = SGR_RULES[code](next);
    } else if (ANSI_FG[code]) {
      next = { ...next, color: ANSI_FG[code] };
    }
  }
  return next;
}

function span(style, text) {
  const css = [
    style.color && `color:${style.color}`,
    style.bold && 'font-weight:700',
    style.dim && 'opacity:.6',
  ].filter(Boolean);
  return `<span style="${css.join(';')}">${escapeHtml(text)}</span>`;
}

/** ANSI SGR → <span style>. Cukup untuk warna dasar, tebal, dan redup. */
function ansiToHtml(line) {
  let html = '';
  let style = PLAIN;
  for (const part of line.split(SGR_SPLIT)) {
    const match = part.match(SGR_ONE);
    if (match) {
      style = applySgr(style, (match[1] || '0').split(';').map(Number));
    } else if (part) {
      html += span(style, part.replace(ANY_CSI, ''));
    }
  }
  return html || '&nbsp;';
}

function prompt(cwd) {
  const path = cwd === '.' ? '~/amwal-bun' : `~/amwal-bun/${cwd}`;
  return `<span style="color:#7fd48a;font-weight:700">amwal@its</span> <span style="color:#9cc3b3">${path}</span> <span style="color:#d6dde0">$</span> `;
}

function buildTimeline(session, targets) {
  return session.steps.map((step, index) => {
    const lines = step.lines.filter(
      (l) => !NOISE.some((re) => re.test(l.text.replace(ANY_SGR, '')))
    );
    const scale = targets[index] / Math.max(step.duration, 0.001);
    return {
      prompt: prompt(step.cwd),
      cmd: escapeHtml(step.cmd),
      lines: lines.map((l) => ({ t: l.t * scale, html: ansiToHtml(l.text) })),
      hold: targets[index],
    };
  });
}

function page(timeline, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:radial-gradient(1200px 700px at 30% 20%,#1d3a30,#0b1814);}
  body{display:flex;align-items:center;justify-content:center;font-family:'Cascadia Mono','Cascadia Code',Consolas,monospace;}
  .win{width:1180px;height:640px;border-radius:14px;overflow:hidden;background:#0f1d18;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(156,195,179,.18);display:flex;flex-direction:column}
  .bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#152a22;color:#9cc3b3;font:600 13px/1 'Segoe UI',system-ui,sans-serif;border-bottom:1px solid rgba(156,195,179,.12)}
  .dot{width:12px;height:12px;border-radius:50%}
  .bar .title{margin-left:10px;letter-spacing:.2px}
  .term{flex:1;padding:16px 20px;overflow:hidden;font-size:15px;line-height:1.45;color:#d6dde0;white-space:pre;}
  .line{overflow:hidden;text-overflow:clip}
  .caret{display:inline-block;width:9px;height:17px;background:#7fd48a;vertical-align:-3px;animation:b 1s steps(1) infinite}
  @keyframes b{50%{opacity:0}}
  </style></head><body><div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">${title}</span></div><div class="term" id="t"></div></div>
  <script>
  const SLOWMO=${SLOWMO};const timeline=${JSON.stringify(timeline)};
  const term=document.getElementById('t');
  const wait=(s)=>new Promise(r=>setTimeout(r,s*1000*SLOWMO));
  const add=(html)=>{const d=document.createElement('div');d.className='line';d.innerHTML=html;term.appendChild(d);term.scrollTop=term.scrollHeight;return d;};
  window.done=false;
  (async()=>{
    await wait(0.8);
    for(const step of timeline){
      const row=add(step.prompt+'<span class="cmd"></span><span class="caret"></span>');
      const cmd=row.querySelector('.cmd');
      const text=document.createElement('textarea');text.innerHTML=step.cmd;const plain=text.value;
      await wait(0.4);
      for(const ch of plain){cmd.textContent+=ch;await wait(0.035);}
      await wait(0.35);
      row.querySelector('.caret').remove();
      const t0=performance.now();
      for(const line of step.lines){
        const due=line.t*1000*SLOWMO-(performance.now()-t0);
        if(due>4){await new Promise(r=>setTimeout(r,due));}
        add(line.html);
      }
      const rest=step.hold*1000*SLOWMO-(performance.now()-t0);
      if(rest>0){await new Promise(r=>setTimeout(r,rest));}
      await wait(0.9);
    }
    add(timeline.at(-1).prompt+'<span class="caret"></span>');
    await wait(2.2);
    window.done=true;
  })();
  </script></body></html>`;
}

const name = process.argv[2];
const targets = TARGET[name];
if (!targets) {
  throw new Error(`Tidak ada TARGET untuk ${name}`);
}
const session = JSON.parse(
  readFileSync(join(OUT_DIR, '.terminal', `${name}.json`), 'utf8')
);
const timeline = buildTimeline(session, targets);

const browser = await launch();
try {
  const tab = await newPage(browser, DESKTOP, { cursor: false });
  await tab.setContent('<html><body style="background:#0b1814"></body></html>');
  const stop = await startRecording(tab);
  await tab.setContent(page(timeline, 'amwal-bun — bash'));
  await tab.waitForFunction(() => window.done === true, null, {
    timeout: 600_000,
    polling: 200,
  });
  await sleep(200);
  process.stdout.write(`${await stop(name)}\n`);
} finally {
  await browser.close();
}
