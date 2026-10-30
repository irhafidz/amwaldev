import { createTransport } from 'nodemailer';
import { env } from '@/env/server';
import type { PasswordResetEmail } from './password-reset-template';

export interface OutgoingMail extends PasswordResetEmail {
  to: string;
}

export interface SmtpConfig {
  from: string | undefined;
  host: string;
  password: string | undefined;
  port: number;
  user: string | undefined;
}

/** SMTP mailer for one fixed server. Tests point it at a local sink. */
export function createMailer(config: SmtpConfig) {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: config.port === 465,
    auth:
      config.user && config.password
        ? { user: config.user, pass: config.password }
        : undefined,
  });

  return {
    async send(mail: OutgoingMail): Promise<void> {
      await transporter.sendMail({
        from: config.from ?? config.user,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}

let envMailer: ReturnType<typeof createMailer> | null = null;

/** Sends one message through the SMTP server named in the environment. */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (!env.SMTP_HOST) {
    throw new Error('SMTP belum dikonfigurasi (SMTP_HOST kosong)');
  }
  envMailer ??= createMailer({
    from: env.SMTP_FROM,
    host: env.SMTP_HOST,
    password: env.SMTP_PASSWORD,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
  });
  await envMailer.send(mail);
}
