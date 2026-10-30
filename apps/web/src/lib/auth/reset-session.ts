/**
 * Carries the password-reset token between the OTP page and the reset page.
 * `sessionStorage` (not the URL) keeps it out of history, logs and referrers,
 * and it disappears with the tab. Every access is guarded: storage can be
 * blocked, and the page then simply sends the user back to the start.
 */
const KEY = 'amwal.password-reset';

interface ResetSession {
  email: string;
  token: string;
}

export function saveResetSession(session: ResetSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable: the reset page will ask the user to start over.
  }
}

export function readResetSession(): ResetSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ResetSession>) : null;
    return parsed?.token && parsed.email
      ? { email: parsed.email, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export function clearResetSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
}
