'use client';

import { Bell, Globe, Moon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { PratinjauBadge } from '@/components/ui/pratinjau-badge';
import { Switch } from '@/components/ui/switch';
import type { SessionUser } from '@/lib/auth/types';
import { applyDarkMode, isDarkModeStored } from '@/lib/theme';

const NOTIFICATION_STORAGE_KEY = 'amwal-notif-transaksi';
const WHITESPACE = /\s+/g;

function isNotificationStored(): boolean {
  try {
    return localStorage.getItem(NOTIFICATION_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function storeNotificationPreference(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Private browsing or storage disabled — preference just won't survive a reload.
  }
}

export function SettingsView({ user }: { user: SessionUser | null }) {
  const [language, setLanguage] = useState('id');
  const [darkMode, setDarkMode] = useState(false);
  const [notification, setNotification] = useState(true);

  useEffect(() => {
    setDarkMode(isDarkModeStored());
    setNotification(isNotificationStored());
  }, []);

  const handleDarkModeChange = (checked: boolean) => {
    setDarkMode(checked);
    applyDarkMode(checked);
  };

  const handleNotificationChange = (checked: boolean) => {
    setNotification(checked);
    storeNotificationPreference(checked);
  };

  if (!user) {
    return (
      <section className="px-5 pt-16 text-center">
        <h1 className="font-bold text-heading-m text-text-primary">
          Masuk untuk mengubah pengaturan
        </h1>
        <p className="mt-2 text-label-caption text-text-secondary">
          Pengaturan tersimpan per akun, bukan per perangkat.
        </p>
      </section>
    );
  }

  return (
    <section className="px-5 pt-6 pb-8">
      <h1 className="font-bold text-heading-l text-text-primary">Pengaturan</h1>
      <p className="mt-1 text-label-caption text-text-secondary">
        Mode gelap dan notifikasi transaksi berlaku langsung di perangkat ini.
      </p>

      <div className="mt-5 space-y-3">
        <SettingRow
          badge={<PratinjauBadge label="Belum memengaruhi tampilan" />}
          icon={Globe}
          label="Bahasa"
          onSelect={(next) => setLanguage(next === 'en' ? 'en' : 'id')}
          options={[
            { value: 'id', label: 'Bahasa Indonesia' },
            { value: 'en', label: 'English' },
          ]}
          value={language === 'id' ? 'Bahasa Indonesia' : 'English'}
        />
        <ToggleRow
          checked={darkMode}
          icon={Moon}
          label="Mode gelap"
          onCheckedChange={handleDarkModeChange}
        />
        <ToggleRow
          checked={notification}
          icon={Bell}
          label="Notifikasi transaksi"
          onCheckedChange={handleNotificationChange}
        />
      </div>
    </section>
  );
}

function SettingRow({
  icon: Icon,
  label,
  value,
  options,
  onSelect,
  badge,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-bg-default p-4 shadow-card">
      <Icon aria-hidden="true" className="size-4 text-brand-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-label-caption text-text-primary">
            {label}
          </p>
          {badge}
        </div>
        <div className="mt-2 flex gap-2">
          {options.map((option) => (
            <button
              className={`rounded-pill px-3 py-1 text-caption-mini transition-colors ${
                value === option.label
                  ? 'bg-brand-primary text-white'
                  : 'bg-bg-surface text-text-secondary'
              }`}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  icon: Icon,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  icon: typeof Moon;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const labelId = `toggle-${label.toLowerCase().replace(WHITESPACE, '-')}`;

  return (
    <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-bg-default p-4 shadow-card">
      <Icon aria-hidden="true" className="size-4 text-brand-primary" />
      <span
        className="flex-1 font-semibold text-label-caption text-text-primary"
        id={labelId}
      >
        {label}
      </span>
      <Switch
        aria-labelledby={labelId}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
