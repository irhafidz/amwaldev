/**
 * Menjalankan perintah SUNGGUHAN dan merekam output-nya baris demi baris
 * beserta waktunya → `video_assets/.terminal/<nama>.json`, untuk diputar
 * ulang oleh `record-terminal.mjs`. Tidak ada output yang dikarang.
 *
 *   node capture-terminal.mjs s10-tests
 *   node capture-terminal.mjs s06-git-log
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR, ROOT } from './lib.mjs';

/** Sesi: daftar langkah { cwd, cmd (ditampilkan), run (dijalankan) }. */
export const SESSIONS = {
  's06-git-log': [
    {
      cwd: '.',
      cmd: 'git log --reverse --date=short --format="%h  %ad  %s" | head -n 12',
    },
    {
      cwd: '.',
      cmd: 'git log --date=short --format="%h  %ad  %s" | head -n 12',
    },
    { cwd: '.', cmd: 'git rev-list --count HEAD' },
  ],
  's10-tests': [
    { cwd: '.', cmd: 'bun run check-types' },
    { cwd: 'packages/core', cmd: 'bun test' },
    {
      cwd: 'apps/web',
      cmd: 'bun test',
      // Tes integrasi web butuh DB uji lokal (.env.test), seperti di CI.
      run: 'bun --env-file=.env.test test',
    },
  ],
};

const AGENT_ENV = /^(CLAUDE|AGENT|CI$)/;
const LINE_BREAK = /\r?\n/;

/**
 * Env seperti terminal developer biasa. Bun memangkas output `bun test`
 * menjadi ringkasan saja bila mendeteksi agen AI (CLAUDECODE, dst.), jadi
 * variabel itu dibuang supaya baris per tes tampil apa adanya.
 */
function humanTerminalEnv() {
  const env = { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' };
  for (const key of Object.keys(env)) {
    if (AGENT_ENV.test(key)) {
      delete env[key];
    }
  }
  return env;
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const lines = [];
    const pending = { out: '', err: '' };
    const child = spawn('bash', ['-lc', step.run ?? step.cmd], {
      cwd: join(ROOT, step.cwd),
      env: humanTerminalEnv(),
    });
    const onData = (key) => (chunk) => {
      pending[key] += chunk.toString('utf8');
      const parts = pending[key].split(LINE_BREAK);
      pending[key] = parts.pop() ?? '';
      for (const text of parts) {
        lines.push({ t: (Date.now() - started) / 1000, text, stream: key });
      }
    };
    child.stdout.on('data', onData('out'));
    child.stderr.on('data', onData('err'));
    child.on('error', reject);
    child.on('close', (code) => {
      for (const key of ['out', 'err']) {
        if (pending[key]) {
          lines.push({
            t: (Date.now() - started) / 1000,
            text: pending[key],
            stream: key,
          });
        }
      }
      resolve({
        cwd: step.cwd,
        cmd: step.cmd,
        code,
        duration: (Date.now() - started) / 1000,
        lines,
      });
    });
  });
}

const name = process.argv[2];
if (!SESSIONS[name]) {
  throw new Error(
    `Sesi tidak dikenal: ${name}. Pilihan: ${Object.keys(SESSIONS).join(', ')}`
  );
}
const steps = [];
for (const step of SESSIONS[name]) {
  const result = await runStep(step);
  steps.push(result);
  process.stdout.write(
    `${result.code === 0 ? '✓' : '✗'} ${step.cmd}  (${result.duration.toFixed(1)}s, ${result.lines.length} baris, exit ${result.code})\n`
  );
}
const dir = join(OUT_DIR, '.terminal');
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, `${name}.json`),
  JSON.stringify({ name, capturedAt: new Date().toISOString(), steps }, null, 1)
);
