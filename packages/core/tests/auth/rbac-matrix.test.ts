import { describe, expect, test } from 'bun:test';
import { rbacMatrix } from '../../src/auth/rbac.matrix';

describe('rbac.matrix (single source of truth)', () => {
  test('PETUGAS_LAPANGAN has no access to admin (AMW-07)', () => {
    expect(rbacMatrix.admin).not.toContain('PETUGAS_LAPANGAN');
  });

  test('every namespace maps to the locked four roles', () => {
    const roles = new Set(['WAKIF', 'NADZIR', 'ADMIN', 'PETUGAS_LAPANGAN']);
    for (const allowed of Object.values(rbacMatrix)) {
      expect(allowed.length).toBeGreaterThan(0);
      for (const role of allowed) {
        expect(roles.has(role)).toBe(true);
      }
    }
  });

  test('4 role × namespace mapping is correct', () => {
    expect(rbacMatrix.admin).toEqual(['ADMIN']);
    expect(rbacMatrix.amil).toEqual(['ADMIN', 'PETUGAS_LAPANGAN']);
    expect(rbacMatrix.nadzir).toEqual(['NADZIR', 'ADMIN']);
    expect(rbacMatrix.wakif).toEqual(['WAKIF']);
  });
});
