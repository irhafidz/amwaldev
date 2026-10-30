'use client';

import { Link, useRouter } from '@tanstack/react-router';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  getUserAvatarUploadUrl,
  getUserProfile,
  updateUserProfile,
} from '@/lib/amwal-api/user';
import type { SessionUser } from '@/lib/auth/types';
import {
  normalizeBirthDate,
  normalizeGender,
  normalizePhoneNumber,
} from '@/lib/profile-utils';

interface AvatarUploaderProps {
  initials: string;
  avatarUrl: string | null;
  name: string;
  isUploading: boolean;
  onPickFile: () => void;
}

function AvatarUploader({
  initials,
  avatarUrl,
  name,
  isUploading,
  onPickFile,
}: AvatarUploaderProps) {
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative">
        <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-emerald-100 bg-emerald-50 shadow-md">
          {avatarUrl ? (
            /** biome-ignore lint/performance/noImgElement: user avatar preview */
            <img
              alt={name || 'Avatar'}
              className="size-full object-cover"
              height={96}
              src={avatarUrl}
              width={96}
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-tr from-[#006D34] to-[#00AB55] font-bold text-3xl text-white uppercase tracking-wider">
              {initials}
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </div>

        <button
          aria-label="Ganti foto profil"
          className="-right-1 -bottom-1 absolute flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#00AB55] text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          disabled={isUploading}
          onClick={onPickFile}
          type="button"
        >
          <Camera size={16} />
        </button>
      </div>
      <p className="mt-2 text-gray-500 text-xs">
        Ketuk ikon kamera untuk mengubah foto profil
      </p>
    </div>
  );
}

interface GenderSelectorProps {
  gender: 'Laki-laki' | 'Perempuan' | '';
  onChange: (val: 'Laki-laki' | 'Perempuan') => void;
}

function GenderSelector({ gender, onChange }: GenderSelectorProps) {
  return (
    <div className="space-y-1.5">
      <span className="block font-semibold text-[#1E293B] text-xs">
        Jenis Kelamin
      </span>
      <div className="grid grid-cols-2 gap-3">
        <button
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border py-3 font-medium text-xs transition-all ${
            gender === 'Laki-laki'
              ? 'border-[#00AB55] bg-emerald-50 text-[#00AB55] shadow-xs'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
          onClick={() => onChange('Laki-laki')}
          type="button"
        >
          {gender === 'Laki-laki' && <Check size={14} />}
          <span>Laki-laki</span>
        </button>
        <button
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border py-3 font-medium text-xs transition-all ${
            gender === 'Perempuan'
              ? 'border-[#00AB55] bg-emerald-50 text-[#00AB55] shadow-xs'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
          }`}
          onClick={() => onChange('Perempuan')}
          type="button"
        >
          {gender === 'Perempuan' && <Check size={14} />}
          <span>Perempuan</span>
        </button>
      </div>
    </div>
  );
}

export function ProfileEditView({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'Laki-laki' | 'Perempuan' | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    getUserProfile()
      .then((res) => {
        if (!isMounted) {
          return;
        }
        setName(res.user.name || user.name || '');
        setEmail(res.user.email || user.email || '');
        setPhone(res.user.phone || user.phone || '');
        const normGender = normalizeGender(res.user.gender);
        if (normGender) {
          setGender(normGender);
        }
        setBirthDate(normalizeBirthDate(res.user.birthDate) || '');
        setAddress(res.user.address || '');
        setAvatarUrl(res.user.avatarUrl || null);
      })
      .catch(() => {
        setName(user.name || '');
        setEmail(user.email || '');
        setPhone(user.phone || '');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast({
        title: 'Ukuran Berkas Terlalu Besar',
        description: 'Maksimal ukuran foto adalah 2MB',
        type: 'error',
      });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const { uploadUrl, publicUrl } = await getUserAvatarUploadUrl(file);

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!res.ok) {
        throw new Error('Gagal mengunggah foto ke penyimpanan');
      }

      setAvatarUrl(publicUrl);
      showToast({
        title: 'Foto Terunggah',
        description: 'Foto profil berhasil diperbarui',
        type: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Unggah Foto Gagal',
        description:
          err instanceof Error
            ? err.message
            : 'Terjadi kendala saat mengunggah foto',
        type: 'error',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage('Nama lengkap minimal 2 karakter');
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      const sanitizedPhone = normalizePhoneNumber(phone);
      const sanitizedBirthDate = normalizeBirthDate(birthDate);

      await updateUserProfile({
        name: name.trim(),
        phone: sanitizedPhone,
        gender: gender || null,
        birthDate: sanitizedBirthDate,
        address: address.trim() || null,
        avatarUrl,
      });

      showToast({
        title: 'Profil Berhasil Diperbarui',
        description: 'Informasi data diri Anda telah disimpan.',
        type: 'success',
      });

      router.navigate({ to: '/profil' });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal memperbarui profil';
      setErrorMessage(msg);
      showToast({
        title: 'Gagal Menyimpan',
        description: msg,
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s.charAt(0))
      .join('')
      .toUpperCase() || 'AM';

  return (
    <div className="flex h-full flex-col justify-between">
      {/* Header (Figma Node: 2966-9060) */}
      <header className="z-20 flex shrink-0 items-center justify-between border-gray-100 border-b bg-white px-5 pt-6 pb-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Kembali ke profil"
            className="-ml-2 flex size-10 cursor-pointer items-center justify-center rounded-full text-[#1E293B] transition-all hover:bg-slate-100 active:scale-95"
            to="/profil"
          >
            <ArrowLeft className="stroke-[2.5]" size={22} />
          </Link>
          <h1 className="font-bold text-[#1E293B] text-xl tracking-tight">
            Ubah Profil
          </h1>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="flex-1 overflow-y-auto px-5 py-6 pb-24 sm:px-6">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-[#00AB55]" />
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <AvatarUploader
              avatarUrl={avatarUrl}
              initials={initials}
              isUploading={isUploadingAvatar}
              name={name}
              onPickFile={() => fileInputRef.current?.click()}
            />

            <input
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarFileChange}
              ref={fileInputRef}
              type="file"
            />

            {errorMessage && (
              <div
                className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-xs"
                role="alert"
              >
                {errorMessage}
              </div>
            )}

            {/* Nama Lengkap */}
            <div className="space-y-1.5">
              <label
                className="block font-semibold text-[#1E293B] text-xs"
                htmlFor="profile-name"
              >
                Nama Lengkap Sesuai KTP <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center">
                <UserIcon
                  className="pointer-events-none absolute left-3.5 text-gray-400"
                  size={16}
                />
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white py-3 pr-4 pl-10 text-gray-900 text-xs transition-colors focus:border-[#00AB55] focus:outline-none focus:ring-2 focus:ring-[#00AB55]/20"
                  id="profile-name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masukkan nama lengkap sesuai KTP"
                  required
                  type="text"
                  value={name}
                />
              </div>
            </div>

            {/* Alamat Email (Readonly) */}
            <div className="space-y-1.5">
              <label
                className="block font-semibold text-[#1E293B] text-xs"
                htmlFor="profile-email"
              >
                Alamat Email
              </label>
              <div className="relative flex items-center">
                <Mail
                  className="pointer-events-none absolute left-3.5 text-gray-400"
                  size={16}
                />
                <input
                  className="w-full cursor-not-allowed rounded-2xl border border-gray-200 bg-gray-50 py-3 pr-4 pl-10 text-gray-500 text-xs"
                  disabled
                  id="profile-email"
                  type="email"
                  value={email}
                />
              </div>
              <p className="text-[11px] text-gray-400">
                Digunakan untuk pengiriman bukti donasi & sertifikat wakaf
                resmi.
              </p>
            </div>

            {/* Nomor Telepon / WhatsApp */}
            <div className="space-y-1.5">
              <label
                className="block font-semibold text-[#1E293B] text-xs"
                htmlFor="profile-phone"
              >
                Nomor Telepon / WhatsApp
              </label>
              <div className="relative flex items-center">
                <Phone
                  className="pointer-events-none absolute left-3.5 text-gray-400"
                  size={16}
                />
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white py-3 pr-4 pl-10 text-gray-900 text-xs transition-colors focus:border-[#00AB55] focus:outline-none focus:ring-2 focus:ring-[#00AB55]/20"
                  id="profile-phone"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  type="tel"
                  value={phone}
                />
              </div>
            </div>

            {/* Jenis Kelamin */}
            <GenderSelector gender={gender} onChange={setGender} />

            {/* Tanggal Lahir */}
            <div className="space-y-1.5">
              <label
                className="block font-semibold text-[#1E293B] text-xs"
                htmlFor="profile-birthdate"
              >
                Tanggal Lahir
              </label>
              <div className="relative flex items-center">
                <Calendar
                  className="pointer-events-none absolute left-3.5 text-gray-400"
                  size={16}
                />
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white py-3 pr-4 pl-10 text-gray-900 text-xs transition-colors focus:border-[#00AB55] focus:outline-none focus:ring-2 focus:ring-[#00AB55]/20"
                  id="profile-birthdate"
                  onChange={(e) => setBirthDate(e.target.value)}
                  type="date"
                  value={birthDate}
                />
              </div>
            </div>

            {/* Alamat Domisili */}
            <div className="space-y-1.5">
              <label
                className="block font-semibold text-[#1E293B] text-xs"
                htmlFor="profile-address"
              >
                Alamat Domisili
              </label>
              <div className="relative">
                <MapPin
                  className="pointer-events-none absolute top-3.5 left-3.5 text-gray-400"
                  size={16}
                />
                <textarea
                  className="w-full rounded-2xl border border-gray-200 bg-white py-3 pr-4 pl-10 text-gray-900 text-xs transition-colors focus:border-[#00AB55] focus:outline-none focus:ring-2 focus:ring-[#00AB55]/20"
                  id="profile-address"
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Masukkan alamat domisili lengkap saat ini"
                  rows={3}
                  value={address}
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#00AB55] py-3.5 font-bold text-sm text-white shadow-md transition-all hover:bg-[#009248] active:scale-[0.98] disabled:opacity-50"
                disabled={isSaving}
                type="submit"
              >
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
