import { resolveMatrix } from '@amwal/core/auth/permissions';
import { updateMatrixInput } from '@amwal/core/contracts/admin-roles';
import { sql } from 'drizzle-orm';
import type { Database } from '@/lib/db';
import { rolePermissions } from '@/lib/db/schema';
import { adminProcedure } from '../../procedures';

/**
 * Persisted feature-permission matrix. An empty table (or a feature added
 * later) resolves to the factory defaults, and ADMIN is always fully enabled.
 */

async function loadMatrix(db: Database) {
  const rows = await db
    .select({
      role: rolePermissions.role,
      featureKey: rolePermissions.featureKey,
      isEnabled: rolePermissions.isEnabled,
    })
    .from(rolePermissions);
  return resolveMatrix(rows);
}

const getMatrix = adminProcedure.handler(async ({ context }) => ({
  data: { matrix: await loadMatrix(context.db) },
}));

const updateMatrix = adminProcedure
  .input(updateMatrixInput)
  .handler(async ({ input, context }) => {
    // Last write wins if the same cell appears twice; Postgres rejects an
    // upsert that would touch one row twice.
    const cells = new Map(
      input.changes.map((change) => [
        `${change.role}:${change.featureKey}`,
        {
          id: `${change.role}:${change.featureKey}`,
          role: change.role,
          featureKey: change.featureKey,
          isEnabled: change.isEnabled,
        },
      ])
    );

    await context.db
      .insert(rolePermissions)
      .values([...cells.values()])
      .onConflictDoUpdate({
        target: [rolePermissions.role, rolePermissions.featureKey],
        set: {
          isEnabled: sql`excluded.is_enabled`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    return {
      data: { updated: cells.size, matrix: await loadMatrix(context.db) },
    };
  });

export const rolesAdmin = { getMatrix, updateMatrix };
