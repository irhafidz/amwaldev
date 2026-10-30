export interface PasswordStrength {
  /** 0 (empty / too short) to 4 (strong). */
  label: 'Terlalu pendek' | 'Lemah' | 'Cukup' | 'Baik' | 'Kuat';
  meetsMinimum: boolean;
  score: 0 | 1 | 2 | 3 | 4;
}

export const MIN_PASSWORD_LENGTH = 8;

const LABELS = ['Terlalu pendek', 'Lemah', 'Cukup', 'Baik', 'Kuat'] as const;
const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /\d/;
const SYMBOL = /[^A-Za-z0-9]/;

/**
 * A small, honest meter for the reset form: length first, then character
 * variety. Below the minimum length the score is always 0, whatever it
 * contains. The server enforces only the minimum length; this guides users
 * toward something better.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: LABELS[0], meetsMinimum: false };
  }

  const variety = [LOWER, UPPER, DIGIT, SYMBOL].filter((rule) =>
    rule.test(password)
  ).length;
  // 1-4 kinds of characters, plus one for a long password, capped at 4.
  const score = Math.min(4, variety + (password.length >= 12 ? 1 : 0)) as
    | 1
    | 2
    | 3
    | 4;

  return { score, label: LABELS[score], meetsMinimum: true };
}
