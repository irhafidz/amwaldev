import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
} from 'lucide-react';
import { useState } from 'react';
import { AuthSplitLayout } from '@/components/auth/auth-split-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequiredMark } from '@/components/ui/required-mark';
import authClient from '@/lib/auth/auth-client';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

interface RegisterViewProps {
  redirectUrl?: string;
}

interface ValidationResult {
  message: string;
  fieldId: string;
}

const validateRegistrationForm = (
  name: string,
  identifier: string,
  password: string,
  confirmPassword: string,
  agreeTerms: boolean
): ValidationResult | null => {
  if (!name.trim()) {
    return { fieldId: 'register-name', message: 'Nama lengkap wajib diisi' };
  }
  if (!identifier.trim()) {
    return {
      fieldId: 'register-identifier',
      message: 'Email atau nomor HP wajib diisi',
    };
  }
  if (!password) {
    return { fieldId: 'register-password', message: 'Kata sandi wajib diisi' };
  }
  if (password.length < 6) {
    return {
      fieldId: 'register-password',
      message: 'Kata sandi minimal harus 6 karakter',
    };
  }
  if (password !== confirmPassword) {
    return {
      fieldId: 'register-confirm-password',
      message: 'Konfirmasi kata sandi tidak cocok',
    };
  }
  if (!agreeTerms) {
    return {
      fieldId: 'register-terms',
      message: 'Anda wajib menyetujui Syarat & Ketentuan untuk melanjutkan',
    };
  }
  return null;
};

export const RegisterView = ({
  redirectUrl = '/dashboard',
}: RegisterViewProps) => {
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const validation = validateRegistrationForm(
      name,
      identifier,
      password,
      confirmPassword,
      agreeTerms
    );
    if (validation) {
      setErrorMessage(validation.message);
      document.getElementById(validation.fieldId)?.focus();
      return;
    }

    setIsLoading(true);
    const isEmail = identifier.includes('@');
    const result = await authClient.register({
      name: name.trim(),
      email: isEmail ? identifier.trim() : undefined,
      phone: isEmail ? undefined : identifier.trim(),
      password,
    });

    if (!result.ok) {
      setIsLoading(false);
      setErrorMessage(
        result.error || 'Pendaftaran gagal. Silakan periksa kembali data Anda.'
      );
      return;
    }

    setSuccessMessage('Pendaftaran berhasil! Sedang masuk ke akun Anda...');
    const loginResult = await authClient.login(identifier.trim(), password);
    setIsLoading(false);

    if (loginResult.ok) {
      setSuccessMessage('Berhasil masuk! Mengalihkan ke dashboard...');
      setTimeout(() => {
        window.location.assign(safeRedirectPath(redirectUrl));
      }, 500);
    } else {
      setSuccessMessage(
        'Pendaftaran akun berhasil! Mengalihkan ke halaman masuk...'
      );
      setTimeout(() => {
        window.location.assign(
          `/masuk?redirect=${encodeURIComponent(safeRedirectPath(redirectUrl))}`
        );
      }, 1000);
    }
  };

  return (
    <AuthSplitLayout>
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-slate-900 tracking-tight dark:text-white">
          Buat Akun Baru Amwal
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

      {successMessage && (
        <output className="mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-700 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </output>
      )}

      <form className="space-y-3.5" onSubmit={handleSubmit}>
        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="register-name"
          >
            Nama Lengkap <RequiredMark />
          </label>
          <Input
            autoComplete="name"
            disabled={isLoading}
            id="register-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Ahmad Faiz"
            type="text"
            value={name}
          />
        </div>

        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="register-identifier"
          >
            Email atau Nomor HP <RequiredMark />
          </label>
          <Input
            autoComplete="email"
            disabled={isLoading}
            id="register-identifier"
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="nama@email.com atau 0812xxxxxxxx"
            type="text"
            value={identifier}
          />
        </div>

        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="register-password"
          >
            Kata Sandi <RequiredMark />
          </label>
          <Input
            autoComplete="new-password"
            disabled={isLoading}
            id="register-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimal 6 karakter"
            rightElement={
              <button
                aria-label={
                  showPassword
                    ? 'Sembunyikan kata sandi'
                    : 'Tampilkan kata sandi'
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

        <div>
          <label
            className="mb-1.5 block font-semibold text-slate-700 text-xs dark:text-slate-200"
            htmlFor="register-confirm-password"
          >
            Konfirmasi Kata Sandi <RequiredMark />
          </label>
          <Input
            autoComplete="new-password"
            disabled={isLoading}
            id="register-confirm-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Ulangi kata sandi"
            rightElement={
              <button
                aria-label={
                  showConfirmPassword
                    ? 'Sembunyikan konfirmasi kata sandi'
                    : 'Tampilkan konfirmasi kata sandi'
                }
                className="cursor-pointer p-1 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
                onClick={() => setShowConfirmPassword((current) => !current)}
                type="button"
              >
                {showConfirmPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            }
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
          />
        </div>

        <div className="flex items-start gap-2.5 pt-1">
          <input
            checked={agreeTerms}
            className="mt-0.5 size-4 rounded border-slate-300 text-[#356152] focus:ring-[#356152]"
            id="register-terms"
            onChange={(event) => setAgreeTerms(event.target.checked)}
            type="checkbox"
          />
          <label
            className="text-slate-600 text-xs leading-normal dark:text-slate-400"
            htmlFor="register-terms"
          >
            Saya menyetujui{' '}
            <Link
              className="font-semibold text-[#356152] transition-colors hover:text-[#2b4f43] hover:underline dark:text-emerald-400"
              target="_blank"
              to="/syarat-ketentuan"
            >
              Syarat &amp; Ketentuan
            </Link>{' '}
            serta Kebijakan Privasi platform Amwal.
          </label>
        </div>

        <Button
          className="mt-4 h-12 w-full bg-[#356152] font-semibold text-sm text-white shadow-sm transition-colors hover:bg-[#2b4f43] focus-visible:ring-[#356152] active:scale-[0.99]"
          disabled={isLoading}
          size="lg"
          type="submit"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="animate-spin" />
              <span>Mendaftarkan...</span>
            </>
          ) : (
            <span>Daftar</span>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-slate-500 text-sm dark:text-slate-400">
          Sudah memiliki akun?{' '}
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
