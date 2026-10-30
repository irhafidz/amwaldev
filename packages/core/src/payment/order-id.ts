import { ulid } from 'ulidx';
import { wibParts } from '../time/wib';

export const PAYMENT_MODULES = ['WAQF', 'ZAKAT', 'QURBAN', 'INFAQ'] as const;

export type PaymentModule = (typeof PAYMENT_MODULES)[number];
export type OrderIdModule = PaymentModule | 'SEDEKAH';

export const ORDER_ID_V2_PATTERN =
  /^(60|70|80|85|90)(0[1-9]|1[0-2])(\d{2})(\d{2})(\d{4})$/;

const MODULE_CODE_TO_MODULE = {
  '60': 'WAQF',
  '70': 'ZAKAT',
  '80': 'INFAQ',
  '85': 'SEDEKAH',
  '90': 'QURBAN',
} as const;

export const MODULE_TO_CODE: Record<OrderIdModule, string> = {
  WAQF: '60',
  ZAKAT: '70',
  INFAQ: '80',
  SEDEKAH: '85',
  QURBAN: '90',
};

export const SUB_PROGRAM_CODES: Record<OrderIdModule, string> = {
  WAQF: '00',
  ZAKAT: '00',
  INFAQ: '00',
  SEDEKAH: '00',
  QURBAN: '00',
};

export interface ParsedOrderIdV2 {
  module: OrderIdModule;
  subProgram: string;
  month: number;
  year: number;
  seq: number;
}

export const ORDER_ID_PATTERN =
  /^AMW-(WAQF|ZAKAT|QURBAN)-[0-9A-HJ-NP-Za-km-z]{26}$/;

const MODULE_SET = new Set<string>(PAYMENT_MODULES);

export function createOrderId(module: PaymentModule): string {
  if (!MODULE_SET.has(module)) {
    throw new Error(`Unsupported payment module: ${module}`);
  }

  if (module === 'INFAQ') {
    return `INF-${ulid()}`;
  }

  return `AMW-${module}-${ulid()}`;
}

export function isValidOrderId(value: string): boolean {
  return ORDER_ID_V2_PATTERN.test(value) || ORDER_ID_PATTERN.test(value);
}

function moduleFromCode(code: string): OrderIdModule | null {
  return (MODULE_CODE_TO_MODULE as Record<string, OrderIdModule>)[code] ?? null;
}

export function formatOrderId(params: {
  module: OrderIdModule;
  subProgram?: string;
  at: Date;
  seq: number;
}): string {
  if (!Number.isInteger(params.seq) || params.seq < 1) {
    throw new Error('ORDER_SEQUENCE_INVALID');
  }
  if (params.seq > 9999) {
    throw new Error('ORDER_SEQUENCE_EXHAUSTED');
  }

  const time = wibParts(params.at);
  const month = String(time.month).padStart(2, '0');
  const year = String(time.year).slice(-2);
  const subProgram =
    params.subProgram ?? SUB_PROGRAM_CODES[params.module] ?? '00';
  const seq = String(params.seq).padStart(4, '0');

  return `${MODULE_TO_CODE[params.module]}${month}${year}${subProgram.padStart(2, '0')}${seq}`;
}

/**
 * 8-digit program code: `<kode modul>(2)` + `<bulan WIB>(2)` + `<tahun
 * WIB>(2)` + `<urut>(2)`, mis. `60092601` untuk program wakaf pertama bulan
 * September 2026. Berbeda dari `formatOrderId()` (12 digit, urutan
 * 4-digit) — ini identitas program, bukan nomor transaksi.
 */
export function formatProgramCode(params: {
  module: OrderIdModule;
  at: Date;
  seq: number;
}): string {
  if (!Number.isInteger(params.seq) || params.seq < 1) {
    throw new Error('PROGRAM_CODE_SEQUENCE_INVALID');
  }
  if (params.seq > 99) {
    throw new Error('PROGRAM_CODE_SEQUENCE_EXHAUSTED');
  }

  const time = wibParts(params.at);
  const month = String(time.month).padStart(2, '0');
  const year = String(time.year).slice(-2);
  const seq = String(params.seq).padStart(2, '0');

  return `${MODULE_TO_CODE[params.module]}${month}${year}${seq}`;
}

export function parseOrderId(id: string): ParsedOrderIdV2 | null {
  const match = ORDER_ID_V2_PATTERN.exec(id);
  if (!match) {
    return null;
  }

  const module = moduleFromCode(match[1]);
  if (!module) {
    return null;
  }

  return {
    module,
    subProgram: match[4],
    month: Number(match[2]),
    year: 2000 + Number(match[3]),
    seq: Number(match[5]),
  };
}

export function moduleFromOrderId(orderId: string): PaymentModule | null {
  const parsed = parseOrderId(orderId);
  if (parsed) {
    return parsed.module === 'SEDEKAH' ? 'INFAQ' : parsed.module;
  }

  if (orderId.startsWith('AMW-WAQF-')) {
    return 'WAQF';
  }
  if (orderId.startsWith('AMW-ZAKAT-')) {
    return 'ZAKAT';
  }
  if (orderId.startsWith('AMW-QURBAN-')) {
    return 'QURBAN';
  }
  if (orderId.startsWith('INF-') || orderId.startsWith('AMW-INFAQ-')) {
    return 'INFAQ';
  }

  return null;
}
