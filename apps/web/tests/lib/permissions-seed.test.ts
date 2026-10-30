import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultPermissionRows } from '@amwal/core/auth/permissions';

const SEED_ROW =
  /\('([A-Z_]+):([a-z_]+)', '[A-Z_]+', '[a-z_]+', (true|false)\)/g;

describe('0016 migration seed', () => {
  test('matches the factory defaults in @amwal/core exactly', () => {
    const sql = readFileSync(
      join(import.meta.dir, '../../drizzle/0016_user_management_rbac.sql'),
      'utf8'
    );
    const seeded = [...sql.matchAll(SEED_ROW)].map(
      (m) => `${m[1]}:${m[2]}=${m[3]}`
    );
    const expected = defaultPermissionRows().map(
      (r) => `${r.role}:${r.featureKey}=${r.isEnabled}`
    );
    expect(seeded.sort()).toEqual(expected.sort());
  });

  test('is additive only (no drop / rename / set not null)', () => {
    const sql = readFileSync(
      join(import.meta.dir, '../../drizzle/0016_user_management_rbac.sql'),
      'utf8'
    );
    expect(sql).not.toMatch(
      /\b(DROP\s+(TABLE|COLUMN)|RENAME\s+(TABLE|COLUMN)|SET\s+NOT\s+NULL)\b/i
    );
  });
});
