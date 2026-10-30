import { z } from 'zod';
import { INFAQ_JENIS } from './infaq';

export const INFAQ_PROGRAM_STATUS = ['AKTIF', 'SELESAI', 'DRAF'] as const;

const programFields = {
  nama: z.string().trim().min(2, 'Nama program wajib diisi'),
  jenis: z.enum(INFAQ_JENIS),
  deskripsi: z.string().trim().optional(),
  /** `null` = program terbuka tanpa target. */
  target: z.number().positive('Target harus lebih dari 0').nullable(),
  status: z.enum(INFAQ_PROGRAM_STATUS),
};

export const createInfaqProgramSchema = z.object({
  ...programFields,
  status: programFields.status.default('AKTIF'),
});

export const updateInfaqProgramSchema = z
  .object({ id: z.string().min(1), ...programFields })
  .partial()
  .required({ id: true });

const manualInfaqFields = {
  namaPenginfaq: z.string().trim().min(1, 'Nama donatur wajib diisi'),
  teleponPenginfaq: z.string().trim().optional(),
  nominal: z.number().int().positive('Nominal harus lebih dari 0'),
  /** Program tujuan; jenis order mengikuti jenis program bila diisi. */
  programId: z.string().min(1).nullable().optional(),
  jenis: z.enum(INFAQ_JENIS).optional(),
  metode: z.string().trim().min(1, 'Metode penerimaan wajib diisi'),
  doa: z.string().trim().optional(),
};

/** Donasi infaq/sedekah yang diterima di luar payment gateway. */
export const createManualInfaqSchema = z
  .object(manualInfaqFields)
  .refine((v) => Boolean(v.programId) || Boolean(v.jenis), {
    message: 'Pilih program atau jenis infaq',
    path: ['programId'],
  });

export const updateManualInfaqSchema = z
  .object({ id: z.string().min(1), ...manualInfaqFields })
  .partial()
  .required({ id: true });
