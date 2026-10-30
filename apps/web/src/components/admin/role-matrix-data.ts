import {
  DEFAULT_GRANTS,
  FEATURE_KEYS,
  type FeatureKey,
  type PermissionMatrix,
  type PermissionRole,
  rowFromGrants,
} from '@amwal/core/auth/permissions';

/** Display metadata for each persisted role; `id` is the DB `Role` value. */
export const ROLES: readonly {
  id: PermissionRole;
  label: string;
  subtitle: string;
  /** Master role: always fully enabled and not editable. */
  locked: boolean;
}[] = [
  {
    id: 'ADMIN',
    label: 'Super Admin',
    subtitle: 'Platform Owner / BWI Hub',
    locked: true,
  },
  {
    id: 'NADZIR',
    label: 'Nadzir',
    subtitle: 'Pimpinan Lembaga / Program Manager',
    locked: false,
  },
  {
    id: 'BENDAHARA',
    label: 'Bendahara',
    subtitle: 'Approval Keuangan & Rekonsiliasi',
    locked: false,
  },
  {
    id: 'PETUGAS_LAPANGAN',
    label: 'Petugas Lapangan',
    subtitle: 'Pencatatan Lapangan & Pengajuan Dana',
    locked: false,
  },
  {
    id: 'WAKIF',
    label: 'Jamaah / Donatur',
    subtitle: 'Akses Publik',
    locked: false,
  },
];

export type MatrixRow = Record<FeatureKey, boolean>;

export const defaultRow = (role: PermissionRole): MatrixRow =>
  rowFromGrants(DEFAULT_GRANTS[role]);

export const fullRow = (): MatrixRow => rowFromGrants(FEATURE_KEYS);

export function isSameMatrix(a: PermissionMatrix, b: PermissionMatrix) {
  return ROLES.every((role) =>
    FEATURE_KEYS.every((key) => a[role.id][key] === b[role.id][key])
  );
}

/** Cells that differ from `saved`, skipping the locked master role. */
export function diffMatrix(
  saved: PermissionMatrix,
  draft: PermissionMatrix
): {
  role: Exclude<PermissionRole, 'ADMIN'>;
  featureKey: FeatureKey;
  isEnabled: boolean;
}[] {
  return ROLES.filter((role) => !role.locked).flatMap((role) =>
    FEATURE_KEYS.filter(
      (key) => saved[role.id][key] !== draft[role.id][key]
    ).map((featureKey) => ({
      // `locked` (ADMIN) was filtered out above; TS cannot see that.
      role: role.id as Exclude<PermissionRole, 'ADMIN'>,
      featureKey,
      isEnabled: draft[role.id][featureKey],
    }))
  );
}
