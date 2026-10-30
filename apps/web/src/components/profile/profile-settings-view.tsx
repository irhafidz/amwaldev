'use client';

import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  HelpCircle,
  Info,
  Lock,
  LogOut,
  Mail,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { getUserProfile, updateUserPreferences } from '@/lib/amwal-api/user';
import authClient from '@/lib/auth/auth-client';
import type { SessionUser } from '@/lib/auth/types';

export function ProfileSettingsView({ user }: { user: SessionUser | null }) {
  const { showToast } = useToast();
  const [notification, setNotification] = useState(true);
  const [newsletter, setNewsletter] = useState(true);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    getUserProfile()
      .then((res) => {
        if (res.user.preferences) {
          if (typeof res.user.preferences.notifikasi === 'boolean') {
            setNotification(res.user.preferences.notifikasi);
          }
          if (typeof res.user.preferences.newsletter === 'boolean') {
            setNewsletter(res.user.preferences.newsletter);
          }
        }
      })
      .catch(() => {
        // Keep defaults if failed
      });
  }, [user]);

  const handleNotificationChange = async (checked: boolean) => {
    setNotification(checked);
    try {
      await updateUserPreferences({
        notifikasi: checked,
        newsletter,
      });
    } catch {
      // Revert if error
      setNotification(!checked);
      showToast({
        title: 'Gagal Menyimpan',
        description: 'Tidak dapat memperbarui preferensi notifikasi',
        type: 'error',
      });
    }
  };

  const handleNewsletterChange = async (checked: boolean) => {
    setNewsletter(checked);
    try {
      await updateUserPreferences({
        notifikasi: notification,
        newsletter: checked,
      });
    } catch {
      // Revert if error
      setNewsletter(!checked);
      showToast({
        title: 'Gagal Menyimpan',
        description: 'Tidak dapat memperbarui preferensi newsletter',
        type: 'error',
      });
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authClient.signOut();
    } catch {
      // Proceed with navigation regardless
    } finally {
      window.location.assign('/auth/login');
    }
  };

  return (
    <div className="flex h-full flex-col justify-between">
      {/* Header (Figma Node: 2966-9144) */}
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
            Pengaturan
          </h1>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 space-y-6 overflow-y-auto px-5 py-6 pb-24 sm:px-6">
        {/* Group: AKUN */}
        <div className="space-y-2.5">
          <h2 className="font-bold text-[#64748B] text-xs uppercase tracking-wider">
            Akun
          </h2>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xs">
            <Link
              className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50/70"
              to="/profil/edit"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#00AB55]">
                  <User size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1E293B] text-xs sm:text-sm">
                    Ubah Profil
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Data diri, nomor kontak & foto profil
                  </p>
                </div>
              </div>
              <ChevronRight className="text-gray-400" size={18} />
            </Link>

            <Link
              className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50/70"
              to="/profil/keamanan"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#00AB55]">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1E293B] text-xs sm:text-sm">
                    Keamanan & Password
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Ubah kata sandi akun Amwal Anda
                  </p>
                </div>
              </div>
              <ChevronRight className="text-gray-400" size={18} />
            </Link>
          </div>
        </div>

        {/* Group: PREFERENSI */}
        <div className="space-y-2.5">
          <h2 className="font-bold text-[#64748B] text-xs uppercase tracking-wider">
            Preferensi
          </h2>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xs">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Bell size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1E293B] text-xs sm:text-sm">
                    Notifikasi
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Dapatkan info donasi & reminder ibadah
                  </p>
                </div>
              </div>
              <Switch
                checked={notification}
                onCheckedChange={handleNotificationChange}
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <Mail size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1E293B] text-xs sm:text-sm">
                    Newsletter Email/WhatsApp
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Terima kabar program wakaf terbaru
                  </p>
                </div>
              </div>
              <Switch
                checked={newsletter}
                onCheckedChange={handleNewsletterChange}
              />
            </div>
          </div>
        </div>

        {/* Group: BANTUAN & INFO */}
        <div className="space-y-2.5">
          <h2 className="font-bold text-[#64748B] text-xs uppercase tracking-wider">
            Bantuan & Info
          </h2>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xs">
            <Link
              className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50/70"
              to="/bantuan"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <HelpCircle size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1E293B] text-xs sm:text-sm">
                    Pusat Bantuan
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    FAQ, layanan kontak & panduan wakaf
                  </p>
                </div>
              </div>
              <ChevronRight className="text-gray-400" size={18} />
            </Link>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Info size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1E293B] text-xs sm:text-sm">
                    Tentang Aplikasi
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Platform Wakaf & Zakat Terintegrasi
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-[11px] text-slate-600">
                v1.2.0
              </span>
            </div>
          </div>
        </div>

        {/* Tombol Keluar Akun */}
        <div className="pt-2">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white py-3.5 font-bold text-rose-600 text-sm shadow-2xs transition-all hover:bg-rose-50/50 active:scale-[0.98]"
            onClick={() => setShowLogoutDialog(true)}
            type="button"
          >
            <LogOut className="text-rose-600" size={18} />
            <span>Keluar Akun</span>
          </button>
        </div>
      </main>

      {/* Dialog Konfirmasi Logout */}
      {showLogoutDialog && (
        <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="zoom-in-95 w-full max-w-sm animate-in rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <LogOut size={24} />
            </div>
            <h3 className="font-bold text-[#1E293B] text-lg">
              Konfirmasi Keluar
            </h3>
            <p className="mt-2 text-gray-500 text-xs leading-relaxed">
              Apakah Anda yakin ingin keluar dari akun Amwal? Anda perlu masuk
              kembali untuk mengakses layanan penuh.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                className="flex-1 rounded-xl border border-gray-200 py-2.5 font-semibold text-gray-700 text-xs transition-colors hover:bg-gray-50"
                onClick={() => setShowLogoutDialog(false)}
                type="button"
              >
                Batal
              </button>
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 font-semibold text-white text-xs transition-colors hover:bg-rose-700 disabled:opacity-50"
                disabled={isLoggingOut}
                onClick={handleLogout}
                type="button"
              >
                {isLoggingOut ? 'Memproses...' : 'Ya, Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
