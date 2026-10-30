'use client';

import type { PermissionRole } from '@amwal/core/auth/permissions';
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserCog,
  Users,
  UserX,
} from 'lucide-react';
import { type ComponentType, useEffect, useState } from 'react';
import {
  AdminPageHeader,
  HERO_BUTTON_PRIMARY,
} from '@/components/admin/admin-primitives';
import { confirmAction } from '@/components/ui/confirm-action';
import { SelectField } from '@/components/ui/select-field';
import {
  type AdminUserRow,
  type AdminUsersPage,
  createAdminStaff,
  getAdminUsers,
  setAdminUserActive,
  updateAdminUserRole,
} from '@/lib/amwal-api/admin';
import { useAdminToast } from './admin-primitives';
import { ROLES } from './role-matrix-data';
import {
  affiliationLabel,
  formatJoinDate,
  ROLE_META,
  type RoleFilter,
  roleLabel,
  type StatusFilter,
} from './users-data';
import { AddStaffModal, RoleModal } from './users-modals';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const SELECT_CLASS =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#356152] focus:ring-2 focus:ring-[#356152]/20';

interface Filters {
  search: string;
  role: RoleFilter;
  status: StatusFilter;
  page: number;
}

/** Server-driven page; keeps the previous rows on screen while refetching. */
function useUsersPage(filters: Filters) {
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const { search, role, status, page } = filters;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the manual reload trigger
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAdminUsers({
      search: search || undefined,
      role: role === 'ALL' ? undefined : role,
      status: status === 'ALL' ? undefined : status,
      page,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Gagal memuat daftar pengguna.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [search, role, status, page, tick]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

export function UsersManagementView() {
  const toast = useAdminToast();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<Filters>({
    search: '',
    role: 'ALL',
    status: 'ALL',
    page: 1,
  });
  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const { data, error, loading, reload } = useUsersPage(filters);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setFilters((prev) => ({
          ...prev,
          search: searchInput.trim(),
          page: 1,
        })),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const setFilter = <K extends 'role' | 'status'>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const saveRole = async (role: PermissionRole) => {
    if (!roleTarget) {
      return;
    }
    await updateAdminUserRole({ userId: roleTarget.id, newRole: role });
    toast.ok(`Role ${roleTarget.name} diubah menjadi ${roleLabel(role)}`);
    setRoleTarget(null);
    reload();
  };

  const toggleStatus = async (user: AdminUserRow) => {
    const next = !user.isActive;
    const confirmed = await confirmAction({
      title: next ? 'Aktifkan akun?' : 'Nonaktifkan akun?',
      description: next
        ? `${user.name} dapat masuk kembali ke platform Amwal.`
        : `${user.name} tidak akan dapat masuk ke platform Amwal sampai diaktifkan kembali.`,
      confirmLabel: next ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan',
    });
    if (!confirmed) {
      return;
    }
    try {
      await setAdminUserActive(user.id, next);
      toast.ok(`Akun ${user.name} ${next ? 'diaktifkan' : 'dinonaktifkan'}`);
      reload();
    } catch (toggleError) {
      toast.err(
        toggleError instanceof Error
          ? toggleError.message
          : 'Gagal mengubah status akun.'
      );
    }
  };

  const stats = data?.stats;
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <AdminPageHeader
        actions={
          <button
            className={HERO_BUTTON_PRIMARY}
            onClick={() => setAddOpen(true)}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Tambah Akun Staf
          </button>
        }
        description="Kelola daftar akun terdaftar, status keaktifan, dan penugasan peran (role assignment) platform Amwal."
        icon={<UserCog aria-hidden="true" />}
        title="Manajemen Akun &amp; Pengguna"
      />

      <section
        aria-label="Ringkasan pengguna"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <StatCard
          icon={Users}
          label="Total Pengguna Terdaftar"
          value={stats?.total}
        />
        <StatCard
          hint="Nadzir, Bendahara, Petugas Lapangan"
          icon={ShieldAlert}
          label="Pengurus & Staf Internal"
          value={stats?.staff}
        />
        <StatCard
          icon={UserCheck}
          label="Jamaah & Donatur Publik"
          value={stats?.jamaah}
        />
        <StatCard
          icon={UserX}
          label="Akun Nonaktif / Penangguhan"
          tone="muted"
          value={stats?.inactive}
        />
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          />
          <input
            aria-label="Cari pengguna"
            className={`${SELECT_CLASS} w-full pl-9`}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama, email, atau nomor WhatsApp"
            type="search"
            value={searchInput}
          />
        </div>
        <SelectField
          aria-label="Filter role"
          className="w-full"
          onChange={(e) => setFilter('role', e.target.value as RoleFilter)}
          value={filters.role}
        >
          <option value="ALL">Semua Role</option>
          {ROLES.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label="Filter status"
          className="w-full"
          onChange={(e) => setFilter('status', e.target.value as StatusFilter)}
          value={filters.status}
        >
          <option value="ALL">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Nonaktif</option>
        </SelectField>
      </div>

      {error && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-rose-700 text-sm"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-xs hover:bg-rose-50"
            onClick={reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Coba lagi
          </button>
        </div>
      )}

      <UsersTable
        loading={loading}
        onChangeRole={setRoleTarget}
        onToggleStatus={toggleStatus}
        users={data?.items ?? null}
      />

      {data && total > 0 && (
        <nav
          aria-label="Halaman daftar pengguna"
          className="flex items-center justify-between text-gray-500 text-xs"
        >
          <span>
            Menampilkan {(filters.page - 1) * PAGE_SIZE + 1}–
            {Math.min(filters.page * PAGE_SIZE, total)} dari {total} akun
          </span>
          <span className="flex items-center gap-2">
            <button
              aria-label="Halaman sebelumnya"
              className="cursor-pointer rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={filters.page <= 1}
              onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <span className="font-semibold">
              {filters.page} / {lastPage}
            </span>
            <button
              aria-label="Halaman berikutnya"
              className="cursor-pointer rounded-lg border border-slate-200 p-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={filters.page >= lastPage}
              onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </span>
        </nav>
      )}

      {roleTarget && (
        <RoleModal
          onClose={() => setRoleTarget(null)}
          onSave={saveRole}
          user={roleTarget}
        />
      )}
      {addOpen && (
        <AddStaffModal
          onClose={() => {
            setAddOpen(false);
            reload();
          }}
          onCreate={createAdminStaff}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: number;
  hint?: string;
  tone?: 'default' | 'muted';
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-xs">
      <span
        className={`flex size-9 items-center justify-center rounded-xl ${
          tone === 'muted'
            ? 'bg-slate-100 text-slate-500'
            : 'bg-[#e2ece8] text-[#356152]'
        }`}
      >
        <Icon className="size-5" />
      </span>
      <p className="mt-3 font-extrabold text-2xl text-gray-900">
        {value === undefined ? '—' : value.toLocaleString('id-ID')}{' '}
        <span className="font-semibold text-gray-400 text-xs">akun</span>
      </p>
      <p className="mt-0.5 font-semibold text-gray-600 text-xs">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function UsersTable({
  users,
  loading,
  onChangeRole,
  onToggleStatus,
}: {
  users: AdminUserRow[] | null;
  loading: boolean;
  onChangeRole: (user: AdminUserRow) => void;
  onToggleStatus: (user: AdminUserRow) => void;
}) {
  return (
    <div
      aria-busy={loading}
      className={`overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-xs transition-opacity ${
        loading ? 'opacity-60' : ''
      }`}
    >
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-gray-200 border-b bg-[#f2f6f4] text-gray-500 text-xs uppercase tracking-wider">
            <th className="p-4 font-bold" scope="col">
              Pengguna
            </th>
            <th className="p-4 font-bold" scope="col">
              Peran
            </th>
            <th className="p-4 font-bold" scope="col">
              Lembaga / Afiliasi
            </th>
            <th className="p-4 font-bold" scope="col">
              Terdaftar Sejak
            </th>
            <th className="p-4 font-bold" scope="col">
              Status
            </th>
            <th className="p-4 text-right font-bold" scope="col">
              Aksi
            </th>
          </tr>
        </thead>
        <tbody>
          {users === null && (
            <tr>
              <td className="p-10 text-center text-gray-400" colSpan={6}>
                <LoaderCircle
                  aria-hidden="true"
                  className="mx-auto mb-2 size-5 animate-spin"
                />
                Memuat pengguna…
              </td>
            </tr>
          )}
          {users?.length === 0 && (
            <tr>
              <td className="p-10 text-center text-gray-400" colSpan={6}>
                Tidak ada pengguna yang cocok dengan filter.
              </td>
            </tr>
          )}
          {users?.map((user) => (
            <UserRow
              key={user.id}
              onChangeRole={onChangeRole}
              onToggleStatus={onToggleStatus}
              user={user}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  user,
  onChangeRole,
  onToggleStatus,
}: {
  user: AdminUserRow;
  onChangeRole: (user: AdminUserRow) => void;
  onToggleStatus: (user: AdminUserRow) => void;
}) {
  return (
    <tr className="border-gray-100 border-t hover:bg-[#f2f6f4]/50">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e2ece8] font-bold text-[#356152] text-sm"
          >
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{user.name}</p>
            <p className="truncate text-gray-500 text-xs">
              {user.email ?? '—'}
            </p>
            <p className="font-mono text-xs text-gray-400">
              {user.phone ?? '—'}
            </p>
          </div>
        </div>
      </td>
      <td className="p-4">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold text-xs ${ROLE_META[user.role].badge}`}
        >
          {roleLabel(user.role)}
        </span>
      </td>
      <td className="p-4 text-gray-700">
        {affiliationLabel(user.institution, user.role)}
      </td>
      <td className="p-4 text-gray-700">{formatJoinDate(user.createdAt)}</td>
      <td className="p-4">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold text-xs ${
            user.isActive
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          {user.isActive ? 'Aktif' : 'Nonaktif'}
        </span>
      </td>
      <td className="p-4">
        <div className="flex justify-end gap-2">
          <button
            className="cursor-pointer rounded-lg border border-[#356152]/30 px-3 py-1.5 font-semibold text-[#356152] text-xs hover:bg-[#e2ece8]"
            onClick={() => onChangeRole(user)}
            type="button"
          >
            Ubah Role
          </button>
          <button
            className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 text-xs hover:bg-slate-100"
            onClick={() => onToggleStatus(user)}
            type="button"
          >
            {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      </td>
    </tr>
  );
}
