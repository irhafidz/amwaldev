import { z } from 'zod';
import { PERMISSION_ROLES } from '../auth/permissions';
import { isValidIndonesianPhone } from '../whatsapp/phone';

export const USER_STATUS = ['ACTIVE', 'INACTIVE'] as const;

/** Roles that can be created from "Tambah Akun Staf". */
export const STAFF_ROLES = ['NADZIR', 'BENDAHARA', 'PETUGAS_LAPANGAN'] as const;

const roleSchema = z.enum(PERMISSION_ROLES);

export const listUsersInput = z.object({
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(USER_STATUS).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const updateUserRoleInput = z.object({
  userId: z.string().min(1),
  newRole: roleSchema,
});

export const toggleUserStatusInput = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});

export const createStaffInput = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(100),
  email: z.email('Format email tidak valid'),
  phone: z
    .string()
    .trim()
    .refine(
      isValidIndonesianPhone,
      'Nomor WhatsApp tidak valid. Contoh 08xx atau +62xx.'
    ),
  role: z.enum(STAFF_ROLES),
  institution: z.string().trim().max(150).optional(),
  /** Omit to have the server generate one (returned once in the response). */
  temporaryPassword: z
    .string()
    .min(8, 'Kata sandi sementara minimal 8 karakter')
    .max(72)
    .optional(),
});
