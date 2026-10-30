import { describe, expect, test } from 'bun:test';
import {
  countActive,
  defaultMatrix,
  defaultPermissionRows,
  FEATURE_KEYS,
  PERMISSION_ROLES,
  resolveMatrix,
} from '../../src/auth/permissions';

describe('permission matrix', () => {
  test('an empty table resolves to the defaults; only ADMIN may configure roles', () => {
    const matrix = resolveMatrix([]);
    expect(matrix).toEqual(defaultMatrix());
    expect(countActive(matrix.ADMIN)).toBe(FEATURE_KEYS.length);
    expect(countActive(matrix.WAKIF)).toBe(0);
    for (const role of PERMISSION_ROLES.filter((r) => r !== 'ADMIN')) {
      expect(matrix[role].konfigurasi_role).toBe(false);
    }
  });

  test('stored rows override defaults, unknown cells are ignored, ADMIN stays locked', () => {
    const matrix = resolveMatrix([
      { role: 'NADZIR', featureKey: 'hapus_program', isEnabled: true },
      { role: 'BENDAHARA', featureKey: 'ledger_akuntansi', isEnabled: false },
      { role: 'ADMIN', featureKey: 'konfigurasi_role', isEnabled: false },
      { role: 'GHOST', featureKey: 'hapus_program', isEnabled: true },
      { role: 'NADZIR', featureKey: 'ghost_feature', isEnabled: true },
    ]);
    expect(matrix.NADZIR.hapus_program).toBe(true);
    expect(matrix.BENDAHARA.ledger_akuntansi).toBe(false);
    expect(matrix.ADMIN.konfigurasi_role).toBe(true);
    expect(Object.keys(matrix)).not.toContain('GHOST');
  });

  test('seed rows cover every role/feature cell exactly once', () => {
    const rows = defaultPermissionRows();
    expect(rows).toHaveLength(PERMISSION_ROLES.length * FEATURE_KEYS.length);
    expect(new Set(rows.map((r) => `${r.role}:${r.featureKey}`)).size).toBe(
      rows.length
    );
  });
});
