import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { passwordStrength } from '@/lib/auth/password-strength';
import { clearResetSession, readResetSession } from '@/lib/auth/reset-session';
import { orpc } from '@/lib/orpc/client';

const BAR_COLORS = [
  'bg-slate-200',
  'bg-rose-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-emerald-600',
] as const;

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);

  return (
    <div className="mt-2">
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <span
            className={`h-1.5 flex-1 rounded-full ${
              password && segment <= score
                ? BAR_COLORS[score]
                : 'bg-slate-200 dark:bg-slate-700'
            }`}
            key={segment}
          />
        ))}
      </div>
      <p aria-live="polite" className="mt-1 text-slate-500 text-xs">
        {password ? `Kekuatan: ${label}` : 'Minimal 8 karakter'}
      </p>
    </div>
  );
}

/** Step 3: choose the new password, using the token the OTP page stored. */
export const ResetPasswordView = () => {
  const [session, setSession] = useState<ReturnType<
    typeof readResetSession
  > | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSession(readResetSession());
    setReady(true);
  }, []);

  if (!ready) {
    return <AuthSplitLayout>{null}</AuthSplitLayout>;
  }

  if (isDone) {
    return (
      <AuthSplitLayout>
        <div className="text-center">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto mb-4 size-14 text-[#356152]"
          />
          <h1 className="font-bold text-2xl text-slate-900 dark:text-white">
            Kata Sandi Diperbarui
          </h1>
          <p className="mt-2 mb-6 text-slate-500 text-sm">
            Silakan masuk dengan kata sandi baru Anda. Sesi di perangkat lain
            telah dikeluarkan demi keamanan.
          </p>
          <Button asChild className="h-12 w-full bg-[#356152] text-white">
            <Link to="/masuk">Masuk</Link>
          </Button>
        </div>
      </AuthSplitLayout>
    );
  }

  if (!session) {
    return (
      <AuthSplitLayout>
        <h1 className="mb-2 font-bold text-2xl text-slate-900 dark:text-white">
          Sesi Reset Tidak Ditemukan
        </h1>
        <p className="mb-6 text-slate-500 text-sm">
          Verifikasi kode OTP Anda terlebih dahulu untuk mengatur ulang kata
          sandi.
        </p>
        <Button asChild className="h-12 w-full bg-[#356152] text-white">
          <Link to="/lupa-password">Minta Kode OTP</Link>
        </Button>
      </AuthSplitLayout>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!passwordStrength(password).meetsMinimum) {
      setErrorMessage('Kata sandi minimal 8 karakter.');
      return;
    }
    if (password !== confirm) {
      setErrorMessage('Konfirmasi kata sandi tidak sama.');
      return;
    }

    setIsLoading(true);
    try {
      await orpc.auth.resetPasswordWithOtp({
        resetToken: session.token,
        newPassword: password,
      });
      clearResetSession();
      setIsDone(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Tidak dapat memperbarui kata sandi. Silakan coba lagi.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout>
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-slate-900 tracking-tight dark:text-white">
          Atur Kata Sandi Baru
        </h1>
        <p className="mt-1 text-slate-500 text-sm dark:text-slate-400">
          Untuk akun <strong className="break-all">{session.email}</strong>.
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
            htmlFor="reset-password"
          >
            Kata sandi baru
          </label>
          <Input
            autoComplete="new-password"
            disabled={isLoading}
            id="reset-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimal 8 karakter"
            rightElement={
              <button
                aria-label={
                  showPassword ? 'Sembunyikan password' : 'Tampilkan password'
                }
                className="text-slate-400 transition-colors hover:text-slate-600"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            }
            type={showPassword ? 'text' : 'password'}
            value={password}
          />
          <StrengthMeter password={password} />
        </div>

        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="reset-confirm"
          >
            Ulangi kata sandi baru
          </label>
          <Input
            autoComplete="new-password"
            disabled={isLoading}
            error={confirm.length > 0 && confirm !== password}
            id="reset-confirm"
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Ketik ulang kata sandi"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
          />
        </div>

        <Button
          className="mt-2 h-12 w-full bg-[#356152] font-semibold text-sm text-white shadow-sm transition-colors hover:bg-[#2b4f43] focus-visible:ring-[#356152] active:scale-[0.99]"
          disabled={isLoading}
          size="lg"
          type="submit"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <span>Simpan Kata Sandi Baru</span>
          )}
        </Button>
      </form>
    </AuthSplitLayout>
  );
};
