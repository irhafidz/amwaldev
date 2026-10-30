'use client';

import {
  countActive,
  FEATURE_KEYS,
  type FeatureKey,
  PERMISSION_GROUPS,
  type PermissionMatrix,
  type PermissionRole,
} from '@amwal/core/auth/permissions';
import {
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-primitives';
import { getRoleMatrix, updateRoleMatrix } from '@/lib/amwal-api/admin';
import { useResource } from '@/lib/amwal-api/use-resource';
import { useAdminToast } from './admin-primitives';
import {
  defaultRow,
  diffMatrix,
  fullRow,
  isSameMatrix,
  type MatrixRow,
  ROLES,
} from './role-matrix-data';

type Role = (typeof ROLES)[number];

export function RoleMatrixView() {
  const resource = useResource(getRoleMatrix);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        description="Konfigurasi matriks perizinan modul dan fitur untuk setiap tingkatan pengguna platform."
        icon={<ShieldCheck aria-hidden="true" />}
        title="Manajemen Role &amp; Hak Akses (RBAC)"
      />

      {resource.state.status === 'loading' && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-slate-400 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Memuat matriks otoritas…
        </div>
      )}

      {resource.state.status === 'error' && (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 px-6 py-12 text-center"
          role="alert"
        >
          <p className="font-semibold text-rose-700 text-sm">
            {resource.state.error}
          </p>
          <button
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700 text-xs hover:bg-rose-50"
            onClick={resource.reload}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Coba lagi
          </button>
        </div>
      )}

      {resource.state.status === 'success' && (
        <MatrixEditor initial={resource.state.data} />
      )}
    </div>
  );
}

function MatrixEditor({ initial }: { initial: PermissionMatrix }) {
  const toast = useAdminToast();
  const [saved, setSaved] = useState<PermissionMatrix>(initial);
  const [matrix, setMatrix] = useState<PermissionMatrix>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = !isSameMatrix(matrix, saved);

  const updateRow = (role: PermissionRole, row: MatrixRow) =>
    setMatrix((prev) => ({ ...prev, [role]: row }));

  const toggle = (role: PermissionRole, feature: FeatureKey, value: boolean) =>
    updateRow(role, { ...matrix[role], [feature]: value });

  const save = async () => {
    setSaving(true);
    try {
      const next = await updateRoleMatrix(diffMatrix(saved, matrix));
      setSaved(next);
      setMatrix(next);
      toast.ok('Perubahan otoritas disimpan');
    } catch (error) {
      toast.err(
        error instanceof Error ? error.message : 'Gagal menyimpan matriks.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-gray-500 text-xs">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Matriks disimpan di database. Akses prosedur backend saat ini masih
            ditentukan oleh peran akun; izin per fitur belum menjadi syarat
            akses di setiap prosedur.
            {dirty && (
              <strong className="ml-1 text-amber-700">
                Ada perubahan yang belum disimpan.
              </strong>
            )}
          </span>
        </p>
        <button
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#356152] px-4 py-2.5 font-bold text-sm text-white shadow-sm transition-colors hover:bg-[#2b4f43] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || !dirty}
          onClick={save}
          type="button"
        >
          {saving ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" className="size-4" />
          )}
          {saving ? 'Menyimpan...' : 'Simpan Perubahan Otoritas'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-xs">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-gray-200 border-b bg-[#f2f6f4]">
              <th
                className="w-64 p-4 font-bold text-gray-500 text-xs uppercase tracking-wider"
                scope="col"
              >
                Fitur / Otoritas
              </th>
              {ROLES.map((role) => (
                <RoleHeader
                  active={countActive(matrix[role.id])}
                  disabled={saving}
                  key={role.id}
                  onReset={() => updateRow(role.id, defaultRow(role.id))}
                  onSelectAll={() => updateRow(role.id, fullRow())}
                  role={role}
                  total={FEATURE_KEYS.length}
                />
              ))}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((group) => (
            <tbody key={group.title}>
              <tr className="bg-gray-50">
                <th
                  className="px-4 py-2 font-bold text-[#356152] text-[11px] uppercase tracking-wider"
                  colSpan={ROLES.length + 1}
                  scope="colgroup"
                >
                  {group.title}
                </th>
              </tr>
              {group.features.map((feature) => (
                <tr
                  className="border-gray-100 border-t hover:bg-[#f2f6f4]/50"
                  key={feature.key}
                >
                  <th
                    className="p-4 font-medium text-gray-800 text-sm"
                    scope="row"
                  >
                    {feature.label}
                  </th>
                  {ROLES.map((role) => (
                    <td className="p-4" key={role.id}>
                      <input
                        aria-label={`${feature.label} untuk ${role.label}`}
                        checked={matrix[role.id][feature.key]}
                        className="size-5 cursor-pointer rounded border-gray-300 accent-[#356152] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={role.locked || saving}
                        onChange={(event) =>
                          toggle(role.id, feature.key, event.target.checked)
                        }
                        type="checkbox"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

function RoleHeader({
  role,
  active,
  total,
  disabled,
  onSelectAll,
  onReset,
}: {
  role: Role;
  active: number;
  total: number;
  disabled: boolean;
  onSelectAll: () => void;
  onReset: () => void;
}) {
  return (
    <th className="p-4 align-top" scope="col">
      <span className="block font-bold text-gray-900 text-sm">
        {role.label}
      </span>
      <span className="block font-normal text-[11px] text-gray-500">
        {role.subtitle}
      </span>
      <span className="mt-1 block font-semibold text-[#356152] text-[11px]">
        {active}/{total} aktif
      </span>
      {role.locked ? (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-[10px] text-gray-500">
          <Lock aria-hidden="true" className="size-3" />
          Master terkunci
        </span>
      ) : (
        <span className="mt-2 flex flex-wrap gap-1.5">
          <button
            className="cursor-pointer rounded-md border border-[#356152]/30 px-2 py-0.5 font-semibold text-[#356152] text-[10px] hover:bg-[#e2ece8] disabled:opacity-50"
            disabled={disabled}
            onClick={onSelectAll}
            type="button"
          >
            Pilih Semua
          </button>
          <button
            className="cursor-pointer rounded-md border border-gray-200 px-2 py-0.5 font-semibold text-[10px] text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            disabled={disabled}
            onClick={onReset}
            type="button"
          >
            Reset Default
          </button>
        </span>
      )}
    </th>
  );
}
