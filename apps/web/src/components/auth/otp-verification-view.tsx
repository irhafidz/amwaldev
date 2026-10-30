import { Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { OtpInput } from '@/components/auth/otp-input';
import { Button } from '@/components/ui/button';
import { saveResetSession } from '@/lib/auth/reset-session';
import { orpc } from '@/lib/orpc/client';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

interface OtpVerificationViewProps {
  email?: string;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Step 2: enter the 6-digit code from the email; a correct code unlocks the reset page. */
export const OtpVerificationView = ({ email }: OtpVerificationViewProps) => {
  const navigate = useNavigate();
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(
      () => setSecondsLeft((current) => current - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  if (!email) {
    return (
      <AuthSplitLayout>
        <h1 className="mb-2 font-bold text-2xl text-slate-900 dark:text-white">
          Verifikasi OTP
        </h1>
        <p className="mb-6 text-slate-500 text-sm">
          Mulai dari halaman lupa kata sandi untuk meminta kode OTP.
        </p>
        <Button asChild className="h-12 w-full bg-[#356152] text-white">
          <Link to="/lupa-password">Minta Kode OTP</Link>
        </Button>
      </AuthSplitLayout>
    );
  }

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setInfo(null);

    if (otp.length !== OTP_LENGTH) {
      setErrorMessage('Masukkan 6 digit kode OTP.');
      return;
    }

    setIsVerifying(true);
    try {
      const { resetToken } = await orpc.auth.verifyPasswordResetOtp({
        email,
        otp,
      });
      saveResetSession({ email, token: resetToken });
      navigate({ to: '/reset-password' });
    } catch (error) {
      setOtp('');
      setErrorMessage(
        messageOf(error, 'Tidak dapat memverifikasi kode. Silakan coba lagi.')
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setErrorMessage(null);
    setInfo(null);
    setIsResending(true);
    try {
      await orpc.auth.requestPasswordReset({ email });
      setOtp('');
      setSecondsLeft(RESEND_SECONDS);
      setInfo('Kode baru telah dikirim. Kode sebelumnya tidak berlaku lagi.');
    } catch (error) {
      setErrorMessage(messageOf(error, 'Gagal mengirim ulang kode.'));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthSplitLayout>
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-slate-900 tracking-tight dark:text-white">
          Verifikasi OTP
        </h1>
        <p className="mt-1 text-slate-500 text-sm leading-relaxed dark:text-slate-400">
          Kami mengirim kode 6 digit ke{' '}
          <strong className="break-all text-slate-700 dark:text-slate-200">
            {email}
          </strong>
          . Kode berlaku 10 menit. Periksa juga folder spam.
        </p>
      </div>

      {errorMessage && (
        <div
          className="mb-4 flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-rose-700 text-xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {info && (
        <output className="mb-4 block rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-800 text-xs">
          {info}
        </output>
      )}

      <form className="space-y-5" onSubmit={handleVerify}>
        <OtpInput
          disabled={isVerifying}
          hasError={Boolean(errorMessage)}
          onChange={setOtp}
          value={otp}
        />

        <Button
          className="h-12 w-full bg-[#356152] font-semibold text-sm text-white shadow-sm transition-colors hover:bg-[#2b4f43] focus-visible:ring-[#356152] active:scale-[0.99]"
          disabled={isVerifying || otp.length !== OTP_LENGTH}
          size="lg"
          type="submit"
        >
          {isVerifying ? (
            <>
              <LoaderCircle className="animate-spin" />
              <span>Memverifikasi...</span>
            </>
          ) : (
            <>
              <span>Verifikasi</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-slate-500 text-sm dark:text-slate-400">
        {secondsLeft > 0 ? (
          <p>
            Kirim ulang kode dalam{' '}
            <span className="font-bold tabular-nums">{secondsLeft}</span> detik
          </p>
        ) : (
          <button
            className="font-bold text-[#356152] hover:underline disabled:opacity-60 dark:text-emerald-400"
            disabled={isResending}
            onClick={handleResend}
            type="button"
          >
            {isResending ? 'Mengirim...' : 'Kirim ulang kode'}
          </button>
        )}
        <p>
          <Link
            className="font-semibold text-[#356152] hover:underline dark:text-emerald-400"
            to="/lupa-password"
          >
            Ganti email
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
};
