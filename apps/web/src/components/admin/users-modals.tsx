'use client';

import type { PermissionRole } from '@amwal/core/auth/permissions';
import { STAFF_ROLES } from '@amwal/core/contracts/admin-users';
import { isValidIndonesianPhone } from '@amwal/core/whatsapp/phone';
import { Copy, LoaderCircle, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { SelectField } from '@/components/ui/select-field';
import { useDirtyGuard } from '@/components/ui/use-dirty-guard';
import type {
  AdminUserRow,
  CreatedStaff,
  CreateStaffInput,
} from '@/lib/amwal-api/admin';
import { ROLES } from './role-matrix-data';
import { ROLE_META, roleLabel } from './users-data';

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#356152] focus:ring-2 focus:ring-[#356152]/20 disabled:opacity-60';
const PRIMARY_BTN =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-4 py-2.5 font-bold text-sm text-white transition-colors hover:bg-[#2b4f43] disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN =
  'cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Permintaan gagal. Coba lagi.';
}

/**
 * Backdrop click and Escape dismiss, unless a request is in flight. Given a
 * `guardValue` (the form state) the modal is a form: the backdrop no longer
 * closes it, and Escape / the close buttons ask first once it has been edited.
 */
function ModalShell({
  title,
  busy,
  onClose,
  guardValue,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  guardValue?: unknown;
  children: ReactNode;
}) {
  const guarded = guardValue !== undefined;
  const { requestClose } = useDirtyGuard({ value: guardValue, onClose });
  const close = guarded ? requestClose : onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !event.defaultPrevented) {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, close]);

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
    >
      <button
        aria-label="Tutup"
        className={`absolute inset-0 bg-black/50 backdrop-blur-xs ${guarded ? 'cursor-not-allowed' : 'cursor-default'}`}
        disabled={busy}
        onClick={guarded ? undefined : onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
          <button
            aria-label="Tutup"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
            disabled={busy}
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SubmitLabel({
  busy,
  idle,
  working,
}: {
  busy: boolean;
  idle: string;
  working: string;
}) {
  return (
    <>
      {busy && (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      )}
      {busy ? working : idle}
    </>
  );
}

export function RoleModal({
  user,
  onClose,
  onSave,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onSave: (role: PermissionRole) => Promise<void>;
}) {
  const [role, setRole] = useState<PermissionRole>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(role);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setBusy(false);
    }
  };

  return (
    <ModalShell
      busy={busy}
      guardValue={role}
      onClose={onClose}
      title="Ubah Role Pengguna"
    >
      <form onSubmit={submit}>
        <div className="rounded-xl bg-[#f2f6f4] p-3">
          <p className="font-semibold text-gray-900 text-sm">{user.name}</p>
          <p className="text-gray-500 text-xs">{user.email ?? user.phone}</p>
        </div>

        <fieldset className="mt-4 space-y-2" disabled={busy}>
          <legend className="mb-1 font-semibold text-gray-700 text-xs">
            Pilih role
          </legend>
          {ROLES.map((item) => (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                role === item.id
                  ? 'border-[#356152] bg-[#f2f6f4]'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
              key={item.id}
            >
              <input
                checked={role === item.id}
                className="size-4 accent-[#356152]"
                name="role"
                onChange={() => setRole(item.id)}
                type="radio"
                value={item.id}
              />
              <span>
                <span className="block font-semibold text-gray-900">
                  {item.label}
                </span>
                <span className="block text-gray-500 text-xs">
                  {item.subtitle}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="mt-3 rounded-lg bg-[#f2f6f4] p-3 text-gray-700 text-xs leading-relaxed">
          <strong>{roleLabel(role)}:</strong> {ROLE_META[role].guidance}
        </p>

        {error && (
          <p className="mt-3 font-semibold text-rose-600 text-xs" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className={SECONDARY_BTN}
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Batal
          </button>
          <button
            className={PRIMARY_BTN}
            disabled={busy || role === user.role}
            type="submit"
          >
            <SubmitLabel
              busy={busy}
              idle="Simpan Perubahan Role"
              working="Menyimpan..."
            />
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

interface StaffForm {
  name: string;
  email: string;
  phone: string;
  role: CreateStaffInput['role'];
  affiliation: string;
}

function validateStaff(input: StaffForm): string | null {
  if (input.name.trim().length < 2) {
    return 'Nama lengkap minimal 2 karakter.';
  }
  if (!EMAIL_PATTERN.test(input.email.trim())) {
    return 'Format email tidak valid.';
  }
  if (!isValidIndonesianPhone(input.phone)) {
    return 'Nomor WhatsApp tidak valid. Contoh 08xx atau +62xx.';
  }
  return null;
}

export function AddStaffModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: CreateStaffInput) => Promise<CreatedStaff>;
}) {
  const [form, setForm] = useState<StaffForm>({
    name: '',
    email: '',
    phone: '',
    role: 'NADZIR',
    affiliation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedStaff | null>(null);

  const set = <K extends keyof StaffForm>(key: K, value: StaffForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateStaff(form);
    setError(invalid);
    if (invalid) {
      return;
    }
    setBusy(true);
    try {
      setCreated(
        await onCreate({
          fullName: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          institution: form.affiliation.trim() || undefined,
        })
      );
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <ModalShell busy={false} onClose={onClose} title="Akun Staf Dibuat">
        <CreatedPanel created={created} onClose={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      busy={busy}
      guardValue={form}
      onClose={onClose}
      title="Tambah Akun Staf"
    >
      <form className="space-y-3" onSubmit={submit}>
        <TextField
          id="staff-name"
          label="Nama Lengkap"
          onChange={(v) => set('name', v)}
          value={form.name}
        />
        <TextField
          id="staff-email"
          label="Email"
          onChange={(v) => set('email', v)}
          type="email"
          value={form.email}
        />
        <TextField
          id="staff-phone"
          label="Nomor WhatsApp"
          onChange={(v) => set('phone', v)}
          placeholder="081211004001"
          type="tel"
          value={form.phone}
        />
        <div>
          <label
            className="mb-1 block font-semibold text-gray-700 text-xs"
            htmlFor="staff-role"
          >
            Role Awal
          </label>
          <SelectField
            className="w-full"
            id="staff-role"
            onChange={(e) =>
              set('role', e.target.value as CreateStaffInput['role'])
            }
            value={form.role}
          >
            {STAFF_ROLES.map((id) => (
              <option key={id} value={id}>
                {roleLabel(id)}
              </option>
            ))}
          </SelectField>
          <p className="mt-1 text-gray-500 text-xs">
            {ROLE_META[form.role].guidance}
          </p>
        </div>
        <TextField
          id="staff-affiliation"
          label="Lembaga / Afiliasi (opsional)"
          onChange={(v) => set('affiliation', v)}
          placeholder="Contoh: Yayasan RSI Surabaya"
          value={form.affiliation}
        />

        <p className="rounded-lg bg-[#f2f6f4] p-3 text-gray-600 text-xs leading-relaxed">
          Kata sandi sementara dibuat otomatis dan ditampilkan satu kali setelah
          akun dibuat. Sampaikan kepada staf melalui kanal yang aman.
        </p>

        {error && (
          <p className="font-semibold text-rose-600 text-xs" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            className={SECONDARY_BTN}
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Batal
          </button>
          <button className={PRIMARY_BTN} disabled={busy} type="submit">
            <SubmitLabel
              busy={busy}
              idle="Buat Akun Staf"
              working="Membuat..."
            />
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function CreatedPanel({
  created,
  onClose,
}: {
  created: CreatedStaff;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const password = created.temporaryPassword;

  const copy = async () => {
    if (!password) {
      return;
    }
    await navigator.clipboard.writeText(password);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-gray-700 text-sm">
        Akun <strong>{created.name}</strong> ({roleLabel(created.role)})
        berhasil dibuat dengan email {created.email}.
      </p>
      {password && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="font-semibold text-amber-900 text-xs">
            Kata sandi sementara (hanya tampil sekali)
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 font-bold font-mono text-gray-900">
              {password}
            </code>
            <button
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-semibold text-[#356152] text-xs hover:bg-[#e2ece8]"
              onClick={copy}
              type="button"
            >
              <Copy aria-hidden="true" className="size-3.5" />
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
        </div>
      )}
      <div className="flex justify-end pt-1">
        <button className={PRIMARY_BTN} onClick={onClose} type="button">
          Selesai
        </button>
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        className="mb-1 block font-semibold text-gray-700 text-xs"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        className={FIELD_CLASS}
        id={id}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </div>
  );
}
