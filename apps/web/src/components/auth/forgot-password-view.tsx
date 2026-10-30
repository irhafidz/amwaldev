import { Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { orpc } from '@/lib/orpc/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Step 1: ask for a code. The reply is the same whether or not the email has an account. */
export const ForgotPasswordView = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      setErrorMessage('Masukkan alamat email yang valid.');
      return;
    }

    setIsLoading(true);
    try {
      await orpc.auth.requestPasswordReset({ email: normalized });
      navigate({ to: '/verifikasi-otp', search: { email: normalized } });
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Tidak dapat mengirim kode saat ini. Silakan coba lagi.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout>
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-slate-900 tracking-tight dark:text-white">
          Lupa Kata Sandi
        </h1>
        <p className="mt-1 text-slate-500 text-sm leading-relaxed dark:text-slate-400">
          Masukkan email akun Anda. Kami akan mengirimkan kode OTP 6 digit untuk
          mengatur ulang kata sandi.
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

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="forgot-email"
          >
            Email
          </label>
          <Input
            autoComplete="email"
            disabled={isLoading}
            error={Boolean(errorMessage)}
            id="forgot-email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@email.com"
            type="email"
            value={email}
          />
        </div>

        <Button
          className="mt-6 h-12 w-full bg-[#356152] font-semibold text-sm text-white shadow-sm transition-colors hover:bg-[#2b4f43] focus-visible:ring-[#356152] active:scale-[0.99]"
          disabled={isLoading}
          size="lg"
          type="submit"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="animate-spin" />
              <span>Mengirim Kode...</span>
            </>
          ) : (
            <>
              <span>Kirim Kode OTP</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-slate-500 text-sm dark:text-slate-400">
          Ingat kata sandi Anda?{' '}
          <Link
            className="font-bold text-[#356152] transition-colors hover:text-[#2b4f43] hover:underline dark:text-emerald-400"
            to="/masuk"
          >
            Masuk
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
};
