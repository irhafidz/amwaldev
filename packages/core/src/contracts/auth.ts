import { z } from 'zod';

/**
 * Extracted verbatim from `apps/server/src/routes/auth.ts` (Putaran 17,
 * Batch 1) — zero change to shape, messages, or refinement logic.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email atau nomor HP wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama wajib diisi'),
    email: z.email('Format email tidak valid').optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+][0-9]{7,17}$/, 'Format nomor HP tidak valid')
      .optional(),
    password: z.string().min(8, 'Kata sandi minimal 8 karakter'),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'Email atau nomor HP wajib diisi',
    path: ['email'],
  });

/** Password-reset OTP flow (email code -> short-lived reset token -> new password). */
export const PASSWORD_RESET_OTP_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

export const requestPasswordResetSchema = z.object({
  email: z.email('Format email tidak valid').trim().toLowerCase(),
});

export const verifyPasswordResetOtpSchema = z.object({
  email: z.email('Format email tidak valid').trim().toLowerCase(),
  otp: z.string().regex(/^\d{6}$/, 'Kode OTP harus 6 digit angka'),
});

export const resetPasswordWithOtpSchema = z.object({
  resetToken: z.string().min(1, 'Token reset wajib diisi'),
  newPassword: z
    .string()
    .min(8, 'Kata sandi minimal 8 karakter')
    .max(PASSWORD_MAX_LENGTH, 'Kata sandi maksimal 128 karakter'),
});
