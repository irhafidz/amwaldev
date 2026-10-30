export const SHARE_CATEGORIES = [
  'WAKAF',
  'ZAKAT',
  'INFAQ',
  'SEDEKAH',
  'QURBAN',
] as const;

export type ShareCategory = (typeof SHARE_CATEGORIES)[number];

export interface ShareMessageParams {
  category: ShareCategory;
  collectedAmount?: number;
  targetAmount?: number;
  title: string;
  url: string;
}

interface ShareMessageOptions {
  includeUrl?: boolean;
}

const CATEGORY_META: Record<
  ShareCategory,
  { emoji: string; invitation: string; label: string }
> = {
  WAKAF: {
    emoji: '🕌',
    invitation: 'Mari berwakaf dan hadirkan manfaat yang terus mengalir',
    label: 'Wakaf',
  },
  ZAKAT: {
    emoji: '🤲',
    invitation:
      'Mari tunaikan zakat dan bersihkan harta dengan cara yang mulia',
    label: 'Zakat',
  },
  INFAQ: {
    emoji: '💚',
    invitation:
      'Mari berinfaq dan jadi bagian dari kebaikan yang terus bertumbuh',
    label: 'Infaq',
  },
  SEDEKAH: {
    emoji: '🤍',
    invitation: 'Mari bersedekah dan ringankan langkah saudara kita hari ini',
    label: 'Sedekah',
  },
  QURBAN: {
    emoji: '🐐',
    invitation: 'Mari tunaikan qurban dan sebarkan kebahagiaan di hari mulia',
    label: 'Qurban',
  },
};

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  currency: 'IDR',
  maximumFractionDigits: 0,
  style: 'currency',
});

function isValidAmount(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function progressLine(params: ShareMessageParams): string | null {
  const hasTarget =
    isValidAmount(params.targetAmount) && params.targetAmount > 0;
  const hasCollected = isValidAmount(params.collectedAmount);

  if (!(hasTarget && hasCollected)) {
    return hasCollected
      ? `Terkumpul: ${rupiahFormatter.format(params.collectedAmount ?? 0)}`
      : null;
  }

  const percent = Math.min(
    100,
    Math.round(
      ((params.collectedAmount ?? 0) / (params.targetAmount ?? 1)) * 100
    )
  );

  return `Terkumpul ${rupiahFormatter.format(
    params.collectedAmount ?? 0
  )} dari target ${rupiahFormatter.format(
    params.targetAmount ?? 0
  )} (${percent}%)`;
}

export function buildShareMessage(
  params: ShareMessageParams,
  options: ShareMessageOptions = {}
): string {
  const meta = CATEGORY_META[params.category];
  const lines = [
    `${meta.emoji} *${meta.label} untuk "${params.title}"*`,
    '',
    `${meta.invitation}. Setiap kebaikan yang kita salurkan akan menjadi amal yang tidak pernah berhenti.`,
  ];
  const progress = progressLine(params);

  if (progress) {
    lines.push(progress);
  }

  lines.push('', 'Salurkan kebaikan Anda sekarang:');
  if (options.includeUrl !== false) {
    lines.push(params.url);
  }

  return lines.join('\n');
}

export function buildWhatsAppShareUrl(text: string, url?: string): string {
  const payload = url ? `${text}\n${url}` : text;
  return `https://wa.me/?text=${encodeURIComponent(payload)}`;
}

export function buildTwitterShareUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(url)}`;
}
