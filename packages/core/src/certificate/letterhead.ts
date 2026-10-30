import type { jsPDF } from 'jspdf';
import {
  LOGO_AMWAL,
  LOGO_HETI,
  LOGO_ITS,
  LOGO_SIZE,
} from './letterhead-assets';

/**
 * Kop & kaki resmi dokumen Amwal ukuran A4 portrait (QA-11): satu template
 * untuk sertifikat dan bukti donasi.
 *
 * - KOP: blok zamrud #356152 (bermozaik tipis) di kiri, pita tint zamrud di
 *   kanan memuat logo HETI, ITS, dan ikon Amwal, plus aksen emas.
 * - BADAN: putih polos. Tidak ada pola apa pun di area ini — kop/kaki hanya
 *   menempati pinggir kertas supaya teks dokumen mudah dibaca dan resmi.
 * - KAKI: cermin kop dengan satu-satunya teks `amwal.id`.
 *
 * Tata letak mengikuti acuan visual `template-header-footer.png` (blok miring
 * di sudut + pita logo/kontak), tetapi seluruh identitas dan warnanya milik
 * Amwal; tidak ada konten pihak lain yang disalin.
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** Area badan yang bersih dari kop/kaki (mm dari tepi atas kertas). */
export const BODY_TOP_MM = 41;
export const BODY_BOTTOM_MM = 271;

type Rgb = readonly [number, number, number];

const EMERALD: Rgb = [53, 97, 82]; // #356152
const EMERALD_DEEP: Rgb = [43, 79, 67]; // #2b4f43
const TINT: Rgb = [205, 222, 214];
const MIST: Rgb = [245, 249, 247];
const GOLD: Rgb = [201, 162, 74];
const WHITE: Rgb = [255, 255, 255];

type Point = readonly [number, number];

/** Opasitas isi DAN garis (typings jsPDF tidak mendeklarasikan GState sebagai konstruktor). */
function setOpacity(doc: jsPDF, value: number) {
  const State = doc.GState as unknown as new (options: object) => never;
  doc.setGState(new State({ opacity: value, 'stroke-opacity': value }));
}

function fill(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function polygon(doc: jsPDF, points: readonly Point[], color: Rgb) {
  const [first, ...rest] = points;
  if (!first) {
    return;
  }
  let px = first[0];
  let py = first[1];
  const segments = rest.map(([x, y]) => {
    const segment: [number, number] = [x - px, y - py];
    px = x;
    py = y;
    return segment;
  });
  fill(doc, color);
  doc.lines(segments, first[0], first[1], [1, 1], 'F', true);
}

/** Gradien horizontal dari irisan tipis (jsPDF tidak punya gradien bawaan yang andal). */
function gradientRect(
  doc: jsPDF,
  [x, y, w, h]: readonly [number, number, number, number],
  from: Rgb,
  to: Rgb,
  steps = 56
) {
  const sliceWidth = w / steps;
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    fill(doc, [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    ]);
    // Tumpang tindih 0,2 mm menutup celah antaririsan.
    doc.rect(x + i * sliceWidth, y, sliceWidth + 0.2, h, 'F');
  }
}

/**
 * Mozaik belah ketupat (motif geometris) di dalam bentuk `inside`. Sel dipilih
 * deterministik supaya setiap cetak identik; hanya sel yang seluruhnya berada
 * di dalam bentuk yang digambar.
 */
function mosaic(
  doc: jsPDF,
  area: readonly [number, number, number, number],
  inside: (x: number, y: number) => boolean,
  cell: number,
  opacity: number
) {
  const [x0, y0, w, h] = area;
  const half = cell / 2;
  setOpacity(doc, opacity);
  doc.setDrawColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setLineWidth(0.18);
  fill(doc, WHITE);
  for (let row = 0; row * half <= h; row += 1) {
    for (let col = 0; col * cell <= w; col += 1) {
      const cx = x0 + col * cell + (row % 2) * half;
      const cy = y0 + row * half;
      const corners: Point[] = [
        [cx, cy - half],
        [cx + half, cy],
        [cx, cy + half],
        [cx - half, cy],
      ];
      if (!corners.every(([px, py]) => inside(px, py))) {
        continue;
      }
      doc.lines(
        [
          [half, half],
          [-half, half],
          [-half, -half],
          [half, -half],
        ],
        cx,
        cy - half,
        [1, 1],
        (row * 7 + col * 13) % 5 === 0 ? 'FD' : 'S',
        true
      );
    }
  }
  setOpacity(doc, 1);
}

function logo(
  doc: jsPDF,
  image: string,
  size: { width: number; height: number },
  x: number,
  centerY: number,
  height: number
): number {
  const width = (height * size.width) / size.height;
  doc.addImage(image, 'PNG', x, centerY - height / 2, width, height);
  return width;
}

function drawHeader(doc: jsPDF) {
  // Pita logo (latar, di bawah blok zamrud).
  gradientRect(doc, [44, 8, A4_WIDTH_MM - 44, 16], TINT, MIST);

  // Aksen emas di bawah sambungan blok dan pita.
  polygon(
    doc,
    [
      [70, 24],
      [116, 24],
      [109, 31],
      [63, 31],
    ],
    GOLD
  );
  polygon(
    doc,
    [
      [63, 31],
      [109, 31],
      [107.6, 32.4],
      [61.6, 32.4],
    ],
    EMERALD_DEEP
  );

  // Blok zamrud berisi nama aplikasi, dengan mozaik tipis.
  const edge = (y: number) => 96 - 0.64 * y;
  polygon(
    doc,
    [
      [0, 0],
      [96, 0],
      [78, 28],
      [0, 28],
    ],
    EMERALD
  );
  mosaic(doc, [4, 3, 90, 24], (x, y) => x < edge(y) - 2 && y < 27, 7, 0.13);

  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('AMWAL', 11, 15.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(TINT[0], TINT[1], TINT[2]);
  doc.text('Aplikasi Manajemen Wakaf Aman dan Legal', 11, 21.5);

  // Logo: HETI, ITS (biru), ikon Amwal berwarna — rata kanan dalam pita.
  const centerY = 16;
  const gap = 7;
  const hetiH = 9;
  const itsH = 12;
  const amwalH = 12;
  const widths = [
    (hetiH * LOGO_SIZE.LOGO_HETI.width) / LOGO_SIZE.LOGO_HETI.height,
    (itsH * LOGO_SIZE.LOGO_ITS.width) / LOGO_SIZE.LOGO_ITS.height,
    (amwalH * LOGO_SIZE.LOGO_AMWAL.width) / LOGO_SIZE.LOGO_AMWAL.height,
  ];
  let x = A4_WIDTH_MM - 12 - (widths[0] + widths[1] + widths[2] + gap * 2);
  x += logo(doc, LOGO_HETI, LOGO_SIZE.LOGO_HETI, x, centerY, hetiH) + gap;
  x += logo(doc, LOGO_ITS, LOGO_SIZE.LOGO_ITS, x, centerY, itsH) + gap;
  logo(doc, LOGO_AMWAL, LOGO_SIZE.LOGO_AMWAL, x, centerY, amwalH);
}

function drawFooter(doc: jsPDF) {
  const bottom = A4_HEIGHT_MM;

  // Pita kaki (latar, di bawah blok zamrud).
  gradientRect(doc, [0, bottom - 18, A4_WIDTH_MM - 44, 10], MIST, TINT);

  // Aksen emas di atas sambungan blok dan pita.
  polygon(
    doc,
    [
      [100, bottom - 20],
      [148, bottom - 20],
      [141, bottom - 14],
      [93, bottom - 14],
    ],
    GOLD
  );
  polygon(
    doc,
    [
      [148, bottom - 20],
      [150.2, bottom - 21.6],
      [102.2, bottom - 21.6],
      [100, bottom - 20],
    ],
    EMERALD_DEEP
  );

  // Blok zamrud di kanan bawah (cermin kop) dengan satu-satunya teks: amwal.id.
  const top = bottom - 24;
  const edge = (y: number) => 114 + 0.64 * (y - top);
  polygon(
    doc,
    [
      [A4_WIDTH_MM, bottom],
      [114, bottom],
      [132, top],
      [A4_WIDTH_MM, top],
    ],
    EMERALD
  );
  mosaic(
    doc,
    [112, top + 2, 96, 20],
    (x, y) => x > edge(y) + 12 && y > top + 1.5 && y < bottom - 1.5,
    7,
    0.13
  );

  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const label = 'amwal.id';
  const width = doc.getTextWidth(label);
  doc.textWithLink(label, A4_WIDTH_MM - 12 - width, bottom - 9, {
    url: 'https://amwal.id',
  });
}

/**
 * Menggambar kop dan kaki pada halaman aktif. Panggil SEBELUM isi dokumen;
 * isi harus berada di antara `BODY_TOP_MM` dan `BODY_BOTTOM_MM`.
 */
export function drawLetterhead(doc: jsPDF): void {
  drawHeader(doc);
  drawFooter(doc);
}
