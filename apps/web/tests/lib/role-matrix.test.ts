import { describe, expect, test } from 'bun:test';
import { defaultMatrix } from '@amwal/core/auth/permissions';
import {
  defaultRow,
  diffMatrix,
  fullRow,
  isSameMatrix,
} from '../../src/components/admin/role-matrix-data';

describe('role matrix editor helpers', () => {
  test('diff lists only changed non-master cells and clears after reset', () => {
    const saved = defaultMatrix();
    const draft = { ...saved, WAKIF: fullRow() };
    const changes = diffMatrix(saved, draft);

    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((c) => c.role === 'WAKIF' && c.isEnabled)).toBe(true);
    expect(isSameMatrix(saved, draft)).toBe(false);

    const reset = { ...draft, WAKIF: defaultRow('WAKIF') };
    expect(diffMatrix(saved, reset)).toEqual([]);
    expect(isSameMatrix(saved, reset)).toBe(true);
  });

  test('the locked ADMIN row never appears in a change set', () => {
    const saved = defaultMatrix();
    const tampered = { ...saved, ADMIN: defaultRow('WAKIF') };
    expect(diffMatrix(saved, tampered)).toEqual([]);
  });
});
