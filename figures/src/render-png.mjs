/**
 * Renders every figS*.svg in this folder to ../<name>.png (white background,
 * 300 DPI metadata).
 *
 *   npm i playwright-core && npx playwright-core install chromium
 *   node figures/src/render-png.mjs
 *
 * If playwright-core lives elsewhere, point PLAYWRIGHT_CORE at its entry file;
 * set CHROME_PATH to use an installed Chrome/Edge.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Inserts a pHYs chunk (300 DPI = 11811 pixels per metre) after IHDR. */
function setDpi300(png) {
  const data = Buffer.alloc(9);
  data.writeUInt32BE(11811, 0);
  data.writeUInt32BE(11811, 4);
  data.writeUInt8(1, 8);
  const type = Buffer.from('pHYs');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(9);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const chunk = Buffer.concat([len, type, data, crc]);
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

// CHROME_PATH (optional): use an installed Chrome/Edge instead of Playwright's.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
for (const file of readdirSync(here).filter((f) => /^figS.*\.svg$/.test(f))) {
  const svg = readFileSync(join(here, file), 'utf8');
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  await page.setContent(
    `<body style="margin:0;background:#fff">${svg}</body>`
  );
  const png = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(join(here, '..', file.replace('.svg', '.png')), setDpi300(png));
  await page.close();
  console.log('rendered', file, `${w}x${h}`);
}
await browser.close();
