import { OTP_TTL_MINUTES } from '@/lib/auth/password-reset-otp';

const BRAND_GREEN = '#356152';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const HTML_SPECIALS = /[&<>"']/g;

function escapeHtml(value: string): string {
  return value.replace(HTML_SPECIALS, (char) => HTML_ESCAPES[char] ?? char);
}

export interface PasswordResetEmail {
  html: string;
  subject: string;
  text: string;
}

/**
 * Responsive, table-based HTML (the only layout every mail client renders)
 * with a plain-text twin. The name is escaped; the OTP is digits only.
 */
export function renderPasswordResetEmail(input: {
  name: string;
  otp: string;
}): PasswordResetEmail {
  const displayName = input.name.trim() || 'Sahabat Amwal';
  const name = escapeHtml(displayName);
  const subject = 'Kode OTP reset kata sandi Amwal';

  const text = [
    `Assalamu'alaikum ${displayName},`,
    '',
    'Kami menerima permintaan untuk mengatur ulang kata sandi akun Amwal Anda.',
    `Kode OTP Anda: ${input.otp}`,
    '',
    `Kode berlaku ${OTP_TTL_MINUTES} menit dan hanya dapat dipakai sekali.`,
    'JANGAN bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari Amwal.',
    'Jika Anda tidak meminta reset kata sandi, abaikan email ini; kata sandi Anda tetap aman.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe6e1;">
<tr><td style="background:${BRAND_GREEN};padding:24px;text-align:center;">
<span style="font-size:24px;font-weight:700;letter-spacing:1px;color:#ffffff;">AMWAL</span>
<div style="margin-top:4px;font-size:12px;color:#cfe3d9;">Wakaf, Zakat, Infaq &amp; Qurban</div>
</td></tr>
<tr><td style="padding:28px 24px 8px 24px;">
<p style="margin:0 0 12px 0;font-size:16px;font-weight:700;">Assalamu'alaikum ${name},</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">Kami menerima permintaan untuk mengatur ulang kata sandi akun Amwal Anda. Masukkan kode berikut di halaman verifikasi:</p>
</td></tr>
<tr><td align="center" style="padding:20px 24px;">
<div style="display:inline-block;background:#eef5f1;border:2px dashed ${BRAND_GREEN};border-radius:12px;padding:16px 24px;">
<span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:${BRAND_GREEN};">${input.otp}</span>
</div>
<p style="margin:12px 0 0 0;font-size:13px;color:#475569;">Berlaku <strong>${OTP_TTL_MINUTES} menit</strong> dan hanya dapat dipakai sekali.</p>
</td></tr>
<tr><td style="padding:0 24px 28px 24px;">
<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.6;color:#9a3412;">
<strong>Jaga kerahasiaan kode ini.</strong> Jangan bagikan kepada siapa pun, termasuk pihak yang mengaku dari Amwal. Jika Anda tidak meminta reset kata sandi, abaikan email ini; kata sandi Anda tetap aman.
</div>
</td></tr>
<tr><td style="background:#f8fafc;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8;">Email otomatis, mohon tidak membalas.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
