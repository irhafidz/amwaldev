import { Link } from '@tanstack/react-router';
import { AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import authClient from '@/lib/auth/auth-client';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

interface LoginViewProps {
  redirectUrl?: string;
}

const validateCredentials = (
  identifier: string,
  password: string
): string | null => {
  if (!identifier.trim()) {
    return 'Email atau nomor HP wajib diisi';
  }
  if (!password) {
    return 'Kata sandi wajib diisi';
  }
  return null;
};

export const LoginView = ({ redirectUrl = '/dashboard' }: LoginViewProps) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const validationError = validateCredentials(identifier, password);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.login(identifier.trim(), password);

      if (!result.ok) {
        setErrorMessage(
          result.status === 401
            ? 'Email/HP atau kata sandi salah. Silakan periksa kembali.'
            : result.error ||
                'Terjadi kendala koneksi ke server. Silakan coba lagi.'
        );
        return;
      }

      // Role-based redirect
      const role = result.data?.user?.role;
      let destination = safeRedirectPath(redirectUrl);
      if (role === 'ADMIN') {
        destination = '/admin';
      } else if (role === 'NADZIR') {
        destination = '/nadzir/dashboard';
      }

      window.location.assign(destination);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout>
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-slate-900 tracking-tight dark:text-white">
          Masuk ke Amwal
        </h1>
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

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="login-identifier"
          >
            Email atau Nomor HP
          </label>
          <Input
            autoComplete="username"
            disabled={isLoading}
            error={errorMessage?.includes('Email')}
            id="login-identifier"
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="nama@email.com atau 0812xxxxxxxx"
            type="text"
            value={identifier}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              className="block font-semibold text-slate-700 text-xs dark:text-slate-200"
              htmlFor="login-password"
            >
              Password
            </label>
            <Link
              className="font-semibold text-[#356152] text-xs transition-colors hover:text-[#2b4f43] hover:underline dark:text-emerald-400"
              to="/lupa-password"
            >
              Lupa Password?
            </Link>
          </div>
          <Input
            autoComplete="current-password"
            disabled={isLoading}
            id="login-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            rightElement={
              <button
                aria-label={
                  showPassword ? 'Sembunyikan password' : 'Tampilkan password'
                }
                className="cursor-pointer p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
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
              <span>Memproses...</span>
            </>
          ) : (
            <span>Masuk</span>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-slate-500 text-sm dark:text-slate-400">
          Belum memiliki akun?{' '}
          <Link
            className="font-bold text-[#356152] transition-colors hover:text-[#2b4f43] hover:underline dark:text-emerald-400"
            to="/daftar"
          >
            Daftar
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
};
