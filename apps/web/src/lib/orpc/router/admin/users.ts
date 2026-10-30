import { revokeAllRefreshTokens } from '@amwal/core/auth/tokens';
import type { Role } from '@amwal/core/auth/types';
import {
  createStaffInput,
  listUsersInput,
  toggleUserStatusInput,
  updateUserRoleInput,
} from '@amwal/core/contracts/admin-users';
import { SYSTEM_ANONYMOUS_USER_ID } from '@amwal/core/identity/guest';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, ilike, ne, or, type SQL, sql } from 'drizzle-orm';
import { ulid } from 'ulidx';
import type { Database } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Admin account management. Every procedure uses `adminProcedure`
 * (`rbacMatrix.admin`), so only ADMIN reaches it. The system "Hamba Allah"
 * row is excluded everywhere: it is infrastructure, not an account.
 */

const BCRYPT_OPTIONS = { algorithm: 'bcrypt', cost: 10 } as const;
const STAFF_ROLE_LIST = ['NADZIR', 'BENDAHARA', 'PETUGAS_LAPANGAN'] as const;
const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 12;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const notSystemUser = ne(users.id, SYSTEM_ANONYMOUS_USER_ID);

/** Escapes `%`, `_` and `\` so user input is matched literally by ILIKE. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function generateTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PASSWORD_LENGTH));
  return Array.from(
    bytes,
    (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]
  ).join('');
}

function isUniqueViolation(error: unknown): boolean {
  const cause =
    error instanceof Error && error.cause !== undefined ? error.cause : error;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === '23505'
  );
}

function buildFilters(input: {
  search?: string;
  role?: Role;
  status?: 'ACTIVE' | 'INACTIVE';
}): SQL | undefined {
  const conditions: SQL[] = [notSystemUser];
  if (input.role) {
    conditions.push(eq(users.role, input.role));
  }
  if (input.status) {
    conditions.push(eq(users.isActive, input.status === 'ACTIVE'));
  }
  if (input.search) {
    const pattern = `%${escapeLike(input.search)}%`;
    const match = or(
      ilike(users.name, pattern),
      ilike(users.email, pattern),
      ilike(users.phone, pattern)
    );
    if (match) {
      conditions.push(match);
    }
  }
  return and(...conditions);
}

const list = adminProcedure
  .input(listUsersInput)
  .handler(async ({ input, context }) => {
    const where = buildFilters(input);

    const totalsQuery = context.db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(where);

    const itemsQuery = context.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        // Stored affiliation first, then the Nadzir's registered institution.
        institution: sql<string | null>`coalesce("users"."institution", (
          select np.nama_lembaga from nadzir_profiles np
          where np.user_id = "users"."id" order by np.created_at limit 1
        ))`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), users.id)
      .limit(input.limit)
      .offset((input.page - 1) * input.limit);

    // Metrics ignore the filters so the KPI cards always describe the platform.
    const statsQuery = context.db
      .select({
        total: sql<number>`count(*)::int`,
        admin: sql<number>`(count(*) filter (where ${users.role} = 'ADMIN'))::int`,
        staff: sql<number>`(count(*) filter (where ${users.role} in ('NADZIR', 'BENDAHARA', 'PETUGAS_LAPANGAN')))::int`,
        jamaah: sql<number>`(count(*) filter (where ${users.role} = 'WAKIF'))::int`,
        inactive: sql<number>`(count(*) filter (where not ${users.isActive}))::int`,
      })
      .from(users)
      .where(notSystemUser);

    // Three independent reads: one round trip instead of three in a row.
    const [totalsRows, items, statsRows] = await Promise.all([
      totalsQuery,
      itemsQuery,
      statsQuery,
    ]);
    const totals = totalsRows[0];
    const stats = statsRows[0];

    return {
      data: {
        items,
        total: totals?.total ?? 0,
        page: input.page,
        limit: input.limit,
        stats: stats ?? {
          total: 0,
          admin: 0,
          staff: 0,
          jamaah: 0,
          inactive: 0,
        },
      },
    };
  });

/** Counts active ADMINs under a row lock so concurrent demotions can't race past the guard. */
async function otherActiveAdmins(
  tx: Transaction,
  excludeId: string
): Promise<number> {
  const admins = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'ADMIN'),
        eq(users.isActive, true),
        ne(users.id, excludeId)
      )
    )
    .for('update');
  return admins.length;
}

const updateRole = adminProcedure
  .input(updateUserRoleInput)
  .handler(async ({ input, context }) => {
    if (input.userId === context.user.userId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Anda tidak dapat mengubah role akun Anda sendiri.',
      });
    }

    const updated = await context.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.id, input.userId), notSystemUser))
        .for('update');

      if (!target) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Pengguna tidak ditemukan',
        });
      }

      const demotesAdmin =
        target.role === 'ADMIN' && input.newRole !== 'ADMIN' && target.isActive;
      if (demotesAdmin && (await otherActiveAdmins(tx, target.id)) === 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Platform harus memiliki minimal satu Super Admin aktif.',
        });
      }

      const [row] = await tx
        .update(users)
        .set({ role: input.newRole, updatedAt: new Date().toISOString() })
        .where(eq(users.id, target.id))
        .returning({ id: users.id, role: users.role });
      return row;
    });

    return { data: updated };
  });

const toggleStatus = adminProcedure
  .input(toggleUserStatusInput)
  .handler(async ({ input, context }) => {
    if (input.userId === context.user.userId && !input.isActive) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Anda tidak dapat menonaktifkan akun Anda sendiri.',
      });
    }

    const updated = await context.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.id, input.userId), notSystemUser))
        .for('update');

      if (!target) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Pengguna tidak ditemukan',
        });
      }

      const deactivatesAdmin =
        target.role === 'ADMIN' && target.isActive && !input.isActive;
      if (deactivatesAdmin && (await otherActiveAdmins(tx, target.id)) === 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Super Admin aktif terakhir tidak dapat dinonaktifkan.',
        });
      }

      const [row] = await tx
        .update(users)
        .set({ isActive: input.isActive, updatedAt: new Date().toISOString() })
        .where(eq(users.id, target.id))
        .returning({ id: users.id, isActive: users.isActive });
      return row;
    });

    if (!input.isActive) {
      // No new session can be minted; an already-issued access token lives out
      // its 20-minute TTL (SECURITY.md §2).
      await revokeAllRefreshTokens(input.userId, context.db);
    }

    return { data: updated };
  });

const createStaff = adminProcedure
  .input(createStaffInput)
  .handler(async ({ input, context }) => {
    if (!(STAFF_ROLE_LIST as readonly string[]).includes(input.role)) {
      throw new ORPCError('BAD_REQUEST', { message: 'Role staf tidak valid' });
    }

    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();

    const [conflict] = await context.db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(or(eq(users.email, email), eq(users.phone, phone)))
      .limit(1);
    if (conflict) {
      throw new ORPCError('CONFLICT', {
        message:
          conflict.email === email
            ? 'Email sudah terdaftar'
            : 'Nomor HP sudah terdaftar',
      });
    }

    const generated = input.temporaryPassword
      ? null
      : generateTemporaryPassword();
    const password = input.temporaryPassword ?? generated ?? '';
    const passwordHash = await Bun.password.hash(password, BCRYPT_OPTIONS);
    const id = `USR-${ulid()}`;

    try {
      await context.db.insert(users).values({
        id,
        name: input.fullName,
        email,
        phone,
        passwordHash,
        role: input.role,
        institution: input.institution || null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ORPCError('CONFLICT', {
          message: 'Email atau nomor HP sudah terdaftar',
        });
      }
      throw error;
    }

    return {
      data: {
        id,
        name: input.fullName,
        email,
        phone,
        role: input.role,
        // Shown to the admin exactly once; only returned when we generated it.
        temporaryPassword: generated ?? undefined,
      },
    };
  });

export const usersAdmin = { list, updateRole, toggleStatus, createStaff };
