'use client';

import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  type LucideIcon,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { changeUserPassword } from '@/lib/amwal-api/user';
import type { SessionUser } from '@/lib/auth/types';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  show: boolean;
  onToggleShow: () => void;
  placeholder: string;
  autoComplete?: string;
  hasError?: boolean;
  errorMessage?: string;
  icon?: LucideIcon;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  placeholder,
  autoComplete,
  hasError,
  errorMessage,
  icon: Icon = Lock,
}: PasswordFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        className="block font-semibold text-[#1E293B] text-xs"
        htmlFor={id}
      >
        {label} <span className="text-rose-500">*</span>
      </label>
      <div className="relative flex items-center">
        <Icon
          className="pointer-events-none absolute left-3.5 text-gray-400"
          size={16}
        />
        <input
          autoComplete={autoComplete}
          className={`w-full rounded-2xl border py-3 pr-10 pl-10 text-gray-900 text-xs transition-colors focus:outline-none focus:ring-2 ${
            hasError
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-gray-200 focus:border-[#00AB55] focus:ring-[#00AB55]/20'
          }`}
          id={id}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          type={show ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          className="absolute right-3.5 cursor-pointer text-gray-400 hover:text-gray-600"
          onClick={onToggleShow}
          type="button"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hasError && errorMessage && (
        <p className="text-[11px] text-rose-500">{errorMessage}</p>
      )}
    </div>
  );
}

export function ProfileSecurityView({
  user: _user,
}: {
  user: SessionUser | null;
}) {
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isPasswordMatch =
    !(newPassword && confirmPassword) || newPassword === confirmPassword;
  const isLengthValid = !newPassword || newPassword.length >= 8;

  const validateForm = (): string | null => {
    if (!currentPassword) {
      return 'Kata sandi saat ini wajib diisi';
    }
    if (newPassword.length < 8) {
      return 'Kata sandi baru minimal 8 karakter';
    }
    if (newPassword !== confirmPassword) {
      return 'Konfirmasi kata sandi baru tidak cocok';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      await changeUserPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Kata sandi Anda berhasil diperbarui');

      showToast({
        title: 'Kata Sandi Diperbarui',
        description: 'Kata sandi akun Anda berhasil diubah.',
        type: 'success',
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui kata sandi. Silakan periksa kata sandi saat ini.';
      setErrorMessage(msg);
      showToast({
        title: 'Gagal Memperbarui Kata Sandi',
        description: msg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled =
    isSubmitting ||
    !currentPassword ||
    !newPassword ||
    !confirmPassword ||
    !isPasswordMatch ||
    !isLengthValid;

  return (
    <div className="flex h-full flex-col justify-between">
      {/* Header (Figma Node: 2966-9225) */}
      <header className="z-20 flex shrink-0 items-center justify-between border-gray-100 border-b bg-white px-5 pt-6 pb-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Kembali ke pengaturan"
            className="-ml-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-[#1E293B] transition-all hover:bg-slate-100 active:scale-95"
            to="/profil/pengaturan"
          >
            <ArrowLeft className="stroke-[2.5]" size={22} />
          </Link>
          <h1 className="font-bold text-[#1E293B] text-xl tracking-tight">
            Keamanan & Password
          </h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 space-y-6 overflow-y-auto px-5 py-6 pb-24 sm:px-6">
        {/* Banner Kartu Ubah Kata Sandi */}
        <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#00AB55] text-white shadow-xs">
              <KeyRound size={22} />
            </div>
            <div>
              <span className="font-bold text-[#00AB55] text-[11px] uppercase tracking-wider">
                Ubah Kata Sandi
              </span>
              <h2 className="mt-0.5 font-bold text-[#1E293B] text-base">
                Perbarui Keamanan Akun
              </h2>
              <p className="mt-1 text-gray-500 text-xs leading-relaxed">
                Gunakan kombinasi minimal 8 karakter huruf dan angka untuk
                melindungi transaksi dan data wakaf Anda.
              </p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div
            className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-rose-700 text-xs"
            role="alert"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-800 text-xs"
            role="alert"
          >
            <CheckCircle2 className="size-4 shrink-0 text-[#00AB55]" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Inputs */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <PasswordField
            autoComplete="current-password"
            id="current-password"
            label="Kata Sandi Saat Ini"
            onChange={setCurrentPassword}
            onToggleShow={() => setShowCurrentPassword((prev) => !prev)}
            placeholder="Masukkan kata sandi saat ini"
            show={showCurrentPassword}
            value={currentPassword}
          />

          <PasswordField
            autoComplete="new-password"
            errorMessage="Kata sandi baru harus memiliki minimal 8 karakter."
            hasError={Boolean(newPassword && !isLengthValid)}
            id="new-password"
            label="Kata Sandi Baru"
            onChange={setNewPassword}
            onToggleShow={() => setShowNewPassword((prev) => !prev)}
            placeholder="Minimal 8 karakter"
            show={showNewPassword}
            value={newPassword}
          />

          <PasswordField
            autoComplete="new-password"
            errorMessage="Konfirmasi kata sandi tidak cocok dengan kata sandi baru."
            hasError={Boolean(confirmPassword && !isPasswordMatch)}
            icon={ShieldCheck}
            id="confirm-password"
            label="Konfirmasi Kata Sandi Baru"
            onChange={setConfirmPassword}
            onToggleShow={() => setShowConfirmPassword((prev) => !prev)}
            placeholder="Ketik ulang kata sandi baru"
            show={showConfirmPassword}
            value={confirmPassword}
          />

          {/* Submit Button */}
          <div className="pt-4">
            <button
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#00AB55] py-3.5 font-bold text-sm text-white shadow-md transition-all hover:bg-[#009248] active:scale-[0.98] disabled:opacity-50"
              disabled={isSubmitDisabled}
              type="submit"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              <span>
                {isSubmitting ? 'Memperbarui...' : 'Perbarui Kata Sandi'}
              </span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
