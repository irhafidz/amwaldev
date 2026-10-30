import { describe, expect, test } from 'bun:test';
import { passwordStrength } from '../src/lib/auth/password-strength';

describe('passwordStrength', () => {
  test('anything under 8 characters is below the minimum', () => {
    expect(passwordStrength('')).toMatchObject({
      score: 0,
      meetsMinimum: false,
    });
    expect(passwordStrength('Ab1!xyz')).toMatchObject({
      score: 0,
      meetsMinimum: false,
    });
  });

  test('scores grow with character variety and length', () => {
    expect(passwordStrength('abcdefgh').score).toBe(1);
    expect(passwordStrength('abcdefgH').score).toBe(2);
    expect(passwordStrength('abcdefH1').score).toBe(3);
    expect(passwordStrength('abcdeH1!').score).toBe(4);
    expect(passwordStrength('abcdefghijkl').score).toBe(2);
  });

  test('every password at or above the minimum meets it', () => {
    expect(passwordStrength('abcdefgh').meetsMinimum).toBe(true);
  });
});
