/**
 * Browser-only file-download helpers for admin "Export" buttons that
 * previously only fired a success toast without producing a real file
 * (Sprint 12 draft "[Fix] Export into document pdf").
 */

const CSV_NEEDS_QUOTING = /[",\n]/;
const CSV_QUOTE = /"/g;

/** Excel / Sheets run cells starting with these characters as formulas. */
const CSV_FORMULA_START = /^[=+\-@\t\r]/;

function escapeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  // Donor-supplied text (names, emails) ends up in these exports.
  if (typeof value === 'string' && CSV_FORMULA_START.test(str)) {
    str = `'${str}`;
  }
  if (CSV_NEEDS_QUOTING.test(str)) {
    return `"${str.replace(CSV_QUOTE, '""')}"`;
  }
  return str;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: unknown[][]
): void {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvCell).join(',')
  );
  const csvContent = `﻿${lines.join('\r\n')}`;
  triggerDownload(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
    filename
  );
}
