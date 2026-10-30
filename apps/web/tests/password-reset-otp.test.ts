import { describe, expect, test } from 'bun:test';
import {
  generateOtp,
  hashOtp,
  otpMatches,
  signResetToken,
  verifyResetToken,
} from '../src/lib/auth/password-reset-otp';
import { renderPasswordResetEmail } from '../src/lib/email/password-reset-template';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';

describe('OTP primitives', () => {
  test('generateOtp always yields 6 digits (leading zeros kept)', () => {
    for (let index = 0; index < 500; index++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  test('hash is bound to the secret, the row id and the code', () => {
    const hash = hashOtp(SECRET, 'PRO-1', '123456');

    expect(otpMatches(SECRET, 'PRO-1', '123456', hash)).toBe(true);
    expect(otpMatches(SECRET, 'PRO-1', '123457', hash)).toBe(false);
    expect(otpMatches(SECRET, 'PRO-2', '123456', hash)).toBe(false);
    expect(otpMatches('another-secret', 'PRO-1', '123456', hash)).toBe(false);
    expect(hash).not.toContain('123456');
  });

  test('reset tokens round-trip and reject other secrets or garbage', async () => {
    const token = await signResetToken(SECRET, {
      userId: 'u1',
      otpId: 'PRO-1',
    });

    expect(await verifyResetToken(SECRET, token)).toEqual({
      userId: 'u1',
      otpId: 'PRO-1',
    });
    expect(await verifyResetToken('another-secret', token)).toBeNull();
    expect(await verifyResetToken(SECRET, `${token}0`)).toBeNull();
    expect(await verifyResetToken(SECRET, '')).toBeNull();
  });
});

describe('password reset email', () => {
  const mail = renderPasswordResetEmail({ name: 'Siti', otp: '048215' });

  test('shows the code, the 10 minute expiry and a security warning', () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain('048215');
      expect(body).toContain('10 menit');
      expect(body.toLowerCase()).toContain('jangan bagikan');
    }
    expect(mail.html).toContain('#356152');
    expect(mail.html).toContain('width=device-width');
    expect(mail.subject).toContain('OTP');
  });

  test('escapes the display name', () => {
    const hostile = renderPasswordResetEmail({
      name: '<script>alert(1)</script>',
      otp: '000000',
    });

    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain('&lt;script&gt;');
  });
});
