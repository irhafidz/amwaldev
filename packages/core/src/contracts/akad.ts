import { z } from 'zod';

export const AKAD_MODULES = [
  'WAKAF',
  'ZAKAT',
  'INFAQ',
  'SEDEKAH',
  'QURBAN',
] as const;

export type AkadModule = (typeof AKAD_MODULES)[number];

export const akadModuleSchema = z.object({
  module: z.enum(AKAD_MODULES),
});

export const publishAkadSchema = akadModuleSchema.extend({
  title: z.string().trim().min(1, 'Judul akad wajib diisi'),
  body: z.string().trim().min(1, 'Redaksi akad wajib diisi'),
});

export const activateAkadSchema = akadModuleSchema.extend({
  version: z
    .number()
    .int('Versi harus berupa bilangan bulat')
    .min(1, 'Versi minimal bernilai 1'),
});

export const akadAcceptanceInputSchema = z.object({
  templateId: z.string().trim().min(1, 'ID templat akad wajib diisi'),
  version: z
    .number()
    .int('Versi harus berupa bilangan bulat')
    .min(1, 'Versi minimal bernilai 1'),
  bodySha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, 'Format SHA-256 tidak valid'),
});

export type AkadModuleInput = z.infer<typeof akadModuleSchema>;
export type PublishAkadInput = z.infer<typeof publishAkadSchema>;
export type ActivateAkadInput = z.infer<typeof activateAkadSchema>;
export type AkadAcceptanceInput = z.infer<typeof akadAcceptanceInputSchema>;

export interface AkadTemplateSummary {
  id: string;
  module: AkadModule;
  version: number;
  title: string;
  body: string;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
}

export interface AkadAcceptanceRecord {
  transactionId: string;
  akadTemplateId: string;
  version: number;
  bodySha256: string;
  acceptedAt: string;
}
