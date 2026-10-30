import {
  issueRefreshToken,
  revokeAllRefreshTokens,
} from '@amwal/core/auth/tokens';
import { signMediaUrl } from '@amwal/core/storage/media-url';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { z } from 'zod';
import { invalidateProfile } from '@/lib/auth/profile-cache';
import type { Database } from '@/lib/db';
import {
  certificates,
  gamificationPointLedgers,
  transactions,
  users,
  waqfOrders,
  waqfPrograms,
} from '@/lib/db/schema';
import {
  normalizeBirthDate,
  normalizeGender,
  normalizePhoneNumber,
} from '@/lib/profile-utils';
import { protectedProcedure } from '../procedures';
import { setRefreshCookie } from './auth';

const _TRAILING_SLASHES_REGEX = /\/+$/;
const BCRYPT_OPTIONS = { algorithm: 'bcrypt', cost: 10 } as const;

export interface UserDocumentItem {
  id: string;
  title: string;
  date: string;
  code: string;
  pdfUrl?: string | null;
}

export interface UserProfileResponse {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    avatarUrl: string | null;
    gender: string | null;
    birthDate: string | null;
    address: string | null;
    preferences: {
      notifikasi?: boolean;
      newsletter?: boolean;
    } | null;
  };
  stats: {
    totalWakaf: number;
    proyekDidanai: number;
    sertifikatTerbit: number;
    totalZakat: number;
  };
  gamification: {
    level: string;
    xp: number;
  };
  documents: UserDocumentItem[];
}

function computeGamificationLevel(saldo: number): string {
  if (saldo >= 1500) {
    return 'LEVEL 3 • MUTAQADDIM';
  }
  if (saldo >= 500) {
    return 'LEVEL 2 • MUTAWASSITH';
  }
  return 'LEVEL 1 • MUBTADI';
}

function mapCertificates(
  rows: Array<{
    id: string;
    code: string;
    issuedAt: string;
    pdfUrl: string | null;
    programTitle: string | null;
  }>
): UserDocumentItem[] {
  return rows.map((c) => ({
    id: c.id,
    title: c.programTitle || 'Sertifikat Wakaf Uang',
    date: new Date(c.issuedAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    code: c.code || 'SW-0000',
    pdfUrl: c.pdfUrl,
  }));
}

function parsePreferences(prefs: unknown): {
  notifikasi?: boolean;
  newsletter?: boolean;
} {
  if (prefs && typeof prefs === 'object') {
    return prefs as { notifikasi?: boolean; newsletter?: boolean };
  }
  return { notifikasi: true, newsletter: true };
}

const resolveSessionUserId = (
  user: { userId?: string } | { id?: string } | null | undefined
): string => {
  const resolved =
    (user as { userId?: string } | undefined)?.userId ??
    (user as { id?: string } | undefined)?.id;
  if (!resolved) {
    throw new ORPCError('UNAUTHORIZED');
  }
  return resolved;
};

const getProfile = protectedProcedure.handler(
  async ({ context }): Promise<UserProfileResponse> => {
    const userId = resolveSessionUserId(context.user);

    const [account] = await context.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        avatarUrl: users.avatarUrl,
        gender: users.gender,
        birthDate: users.birthDate,
        address: users.address,
        preferences: users.preferences,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!account) {
      throw new ORPCError('UNAUTHORIZED', {
        message: 'Pengguna tidak ditemukan',
      });
    }

    // 1. Total Wakaf
    const [wakafSum] = await context.db
      .select({
        total: sql<number>`coalesce(sum(${transactions.amount}::numeric), 0)::numeric`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.wakifId, userId),
          eq(transactions.jenisTransaksi, 'WAKAF'),
          eq(transactions.statusPembayaran, 'LUNAS')
        )
      );

    // 2. Total Zakat
    const [zakatSum] = await context.db
      .select({
        total: sql<number>`coalesce(sum(${transactions.amount}::numeric), 0)::numeric`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.wakifId, userId),
          eq(transactions.jenisTransaksi, 'ZAKAT'),
          eq(transactions.statusPembayaran, 'LUNAS')
        )
      );

    // 3. Proyek Didanai
    const [proyekCount] = await context.db
      .select({
        count: sql<number>`count(distinct ${waqfOrders.waqfProgramId})::int`,
      })
      .from(waqfOrders)
      .where(
        or(
          eq(waqfOrders.wakifId, userId),
          inArray(
            waqfOrders.transactionId,
            context.db
              .select({ id: transactions.id })
              .from(transactions)
              .where(
                and(
                  eq(transactions.wakifId, userId),
                  eq(transactions.statusPembayaran, 'LUNAS')
                )
              )
          )
        )
      );

    // 4. Sertifikat count
    const [certCount] = await context.db
      .select({
        count: sql<number>`count(${certificates.id})::int`,
      })
      .from(certificates)
      .innerJoin(transactions, eq(certificates.transactionId, transactions.id))
      .where(eq(transactions.wakifId, userId));

    // 5. Gamifikasi XP & Level
    const [pointsRow] = await context.db
      .select({
        saldo: sql<number>`coalesce(sum(${gamificationPointLedgers.pointsEarned}), 0)::int`,
      })
      .from(gamificationPointLedgers)
      .where(eq(gamificationPointLedgers.userId, userId));

    const realSaldo = Math.max(0, Number(pointsRow?.saldo ?? 0));
    const level = computeGamificationLevel(realSaldo);

    // 6. Dokumen Sertifikat
    const certRows = await context.db
      .select({
        id: certificates.id,
        code: certificates.nomorInternalAmwal,
        issuedAt: certificates.issuedAt,
        pdfUrl: certificates.pdfUrl,
        programTitle: waqfPrograms.judul,
      })
      .from(certificates)
      .innerJoin(transactions, eq(certificates.transactionId, transactions.id))
      .leftJoin(waqfOrders, eq(waqfOrders.transactionId, transactions.id))
      .leftJoin(waqfPrograms, eq(waqfPrograms.id, waqfOrders.waqfProgramId))
      .where(eq(transactions.wakifId, userId))
      .orderBy(desc(certificates.issuedAt))
      .limit(10);

    const documents = mapCertificates(certRows);

    const rawTotalWakaf = Number(wakafSum?.total ?? 0);
    const rawTotalZakat = Number(zakatSum?.total ?? 0);
    const rawProyekDidanai = Number(proyekCount?.count ?? 0);
    const rawSertifikatTerbit = Number(certCount?.count ?? 0);

    return {
      user: {
        id: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        role: account.role,
        avatarUrl: account.avatarUrl,
        gender: account.gender,
        birthDate: account.birthDate,
        address: account.address,
        preferences: parsePreferences(account.preferences),
      },
      stats: {
        totalWakaf: rawTotalWakaf,
        proyekDidanai: rawProyekDidanai,
        sertifikatTerbit: rawSertifikatTerbit,
        totalZakat: rawTotalZakat,
      },
      gamification: {
        level,
        xp: realSaldo,
      },
      documents,
    };
  }
);

const assertPhoneNotTaken = async (
  db: Database,
  phone: string | null,
  currentUserId: string
): Promise<void> => {
  if (!phone) {
    return;
  }
  const [existingPhoneOwner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), ne(users.id, currentUserId)))
    .limit(1);

  if (existingPhoneOwner) {
    throw new ORPCError('CONFLICT', {
      message: 'Nomor telepon sudah digunakan oleh akun lain',
    });
  }
};

const handleUpdateProfileError = (error: unknown): never => {
  // biome-ignore lint/suspicious/noConsole: required detailed error logging
  console.error('[updateProfile Error]:', error);

  if (error instanceof ORPCError) {
    throw error;
  }

  const pgError = error as { code?: string; detail?: string };
  if (pgError?.code === '23505') {
    const errorStr = String(error);
    const detail = pgError.detail ?? '';
    if (detail.includes('phone') || errorStr.includes('users_phone_key')) {
      throw new ORPCError('CONFLICT', {
        message: 'Nomor telepon sudah digunakan oleh akun lain',
      });
    }
    if (detail.includes('email') || errorStr.includes('users_email_key')) {
      throw new ORPCError('CONFLICT', {
        message: 'Alamat email sudah digunakan oleh akun lain',
      });
    }
  }

  throw new ORPCError('INTERNAL_SERVER_ERROR', {
    message:
      error instanceof Error
        ? error.message
        : 'Gagal memperbarui profil pengguna',
  });
};

const updateProfile = protectedProcedure
  .input(
    z.object({
      name: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter'),
      phone: z.string().trim().optional().nullable(),
      gender: z.string().trim().optional().nullable(),
      birthDate: z.string().trim().optional().nullable(),
      address: z.string().trim().optional().nullable(),
      avatarUrl: z.string().trim().optional().nullable(),
    })
  )
  .handler(async ({ input, context }) => {
    const userId = resolveSessionUserId(context.user);

    const formattedBirthDate = normalizeBirthDate(input.birthDate);
    const formattedGender = normalizeGender(input.gender);
    const formattedPhone = normalizePhoneNumber(input.phone);

    try {
      await assertPhoneNotTaken(context.db, formattedPhone, userId);

      const [updated] = await context.db
        .update(users)
        .set({
          name: input.name,
          phone: formattedPhone,
          gender: formattedGender,
          birthDate: formattedBirthDate,
          address: input.address?.trim() || null,
          avatarUrl: input.avatarUrl?.trim() || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          avatarUrl: users.avatarUrl,
          gender: users.gender,
          birthDate: users.birthDate,
          address: users.address,
        });

      if (!updated) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Profil pengguna tidak ditemukan',
        });
      }

      // The session header shows this name; drop its cached copy.
      invalidateProfile(userId);

      return {
        message: 'Profil berhasil diperbarui',
        data: updated,
      };
    } catch (error) {
      return handleUpdateProfileError(error);
    }
  });

const updatePreferences = protectedProcedure
  .input(
    z.object({
      notifikasi: z.boolean(),
      newsletter: z.boolean(),
    })
  )
  .handler(async ({ input, context }) => {
    const userId = resolveSessionUserId(context.user);

    await context.db
      .update(users)
      .set({
        preferences: input,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    return {
      message: 'Preferensi berhasil diperbarui',
      preferences: input,
    };
  });

const changePassword = protectedProcedure
  .input(
    z.object({
      currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
      newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter'),
    })
  )
  .handler(async ({ input, context }) => {
    const userId = resolveSessionUserId(context.user);

    const [account] = await context.db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!account?.passwordHash) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Akun ini tidak memiliki kata sandi lokal',
      });
    }

    const isMatch = await Bun.password.verify(
      input.currentPassword,
      account.passwordHash
    );

    if (!isMatch) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Kata sandi saat ini tidak cocok',
      });
    }

    const newHash = await Bun.password.hash(input.newPassword, BCRYPT_OPTIONS);

    await context.db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));

    // A stolen session must not survive the password change (audit C6): revoke
    // every refresh token, then give this device a fresh one so only the other
    // devices are forced to log in again.
    await revokeAllRefreshTokens(userId, context.db);
    setRefreshCookie(
      context.resHeaders,
      await issueRefreshToken(userId, context.db)
    );

    return {
      message: 'Kata sandi berhasil diperbarui',
    };
  });

/** MIME type -> object extension. The extension is never taken from the client. */
const AVATAR_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
const AVATAR_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_UPLOAD_TTL_SECONDS = 300;
const PATH_SEPARATORS = /[\\/]/g;

/** Last extension of a file name, with any directory part stripped. */
function fileExtension(fileName: string): string {
  const base = fileName.replace(PATH_SEPARATORS, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

const getAvatarUploadUrl = protectedProcedure
  .input(
    z.object({
      fileName: z.string().trim().min(1).max(255),
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
        message: 'Format foto harus JPG, PNG, atau WebP',
      }),
      size: z
        .number()
        .int()
        .positive()
        .max(AVATAR_MAX_BYTES, 'Ukuran foto maksimal 2MB'),
    })
  )
  .handler(({ input }) => {
    if (!AVATAR_FILE_EXTENSIONS.has(fileExtension(input.fileName))) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Format foto harus JPG, PNG, atau WebP',
      });
    }

    // Penyimpanan lokal VPS (D4): server memilih nama objek, klien hanya
    // mengunggah ke URL PUT bertanda tangan (5 menit) lewat /api/media.
    const objectPath = `${Date.now()}-${ulid().toLowerCase()}.${AVATAR_EXTENSIONS[input.contentType]}`;
    const uploadUrl = signMediaUrl({
      method: 'PUT',
      bucket: 'user-avatars',
      path: objectPath,
      expiresInSeconds: AVATAR_UPLOAD_TTL_SECONDS,
    });

    return {
      uploadUrl,
      publicUrl: `/api/media/user-avatars/${objectPath}`,
      objectPath,
    };
  });

export const user = {
  getProfile,
  updateProfile,
  updatePreferences,
  changePassword,
  getAvatarUploadUrl,
};
