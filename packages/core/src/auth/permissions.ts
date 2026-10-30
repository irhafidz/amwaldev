import type { Role } from './types';

/**
 * Feature-level permission matrix shared by the backend (`role_permissions`
 * table, seeded + served by `admin.roles.*`) and the admin matrix UI, so the
 * list of roles/features and the factory defaults live in exactly one place.
 *
 * NOTE: these keys describe *features* an admin can grant. Procedure guards
 * (`rbacMatrix`) are still role-level; the matrix is stored configuration,
 * not yet a per-procedure access check.
 */
export const PERMISSION_ROLES = [
  'ADMIN',
  'NADZIR',
  'BENDAHARA',
  'PETUGAS_LAPANGAN',
  'WAKIF',
] as const satisfies readonly Role[];

export const PERMISSION_GROUPS = [
  {
    title: 'Tata Kelola & Otoritas',
    features: [
      { key: 'verifikasi_nazhir', label: 'Verifikasi Nazhir' },
      { key: 'audit_persetujuan', label: 'Audit Persetujuan' },
      { key: 'konfigurasi_role', label: 'Konfigurasi Role' },
    ],
  },
  {
    title: 'Pengawasan Program',
    features: [
      { key: 'buat_program', label: 'Buat Program Wakaf' },
      { key: 'edit_program', label: 'Edit Program' },
      { key: 'kelola_progres', label: 'Kelola Progres & Nota' },
      { key: 'hapus_program', label: 'Hapus Program' },
    ],
  },
  {
    title: 'Operasional ZISWAF',
    features: [
      { key: 'kelola_muzakki', label: 'Kelola Muzakki' },
      { key: 'penyaluran_asnaf', label: 'Penyaluran 8 Asnaf' },
      { key: 'batch_qurban', label: 'Batch Qurban' },
      { key: 'infaq_program', label: 'Infaq Program' },
    ],
  },
  {
    title: 'Edukasi & Media',
    features: [
      { key: 'tulis_artikel', label: 'Tulis Artikel' },
      { key: 'buat_kuis', label: 'Buat Kuis' },
      { key: 'unggah_video', label: 'Unggah Video' },
    ],
  },
  {
    title: 'Data & Laporan',
    features: [
      { key: 'ekspor_transparansi', label: 'Ekspor Transparansi' },
      { key: 'ledger_akuntansi', label: 'Ledger Akuntansi' },
      { key: 'data_donatur_rfmd', label: 'Data Donatur RFM-D' },
    ],
  },
] as const;

export type PermissionRole = (typeof PERMISSION_ROLES)[number];
export type FeatureKey =
  (typeof PERMISSION_GROUPS)[number]['features'][number]['key'];
export type PermissionMatrix = Record<
  PermissionRole,
  Record<FeatureKey, boolean>
>;

export const FEATURE_KEYS: FeatureKey[] = PERMISSION_GROUPS.flatMap((group) =>
  group.features.map((feature) => feature.key)
);

/** Factory defaults for a fresh instance (also what the 0016 migration seeds). */
export const DEFAULT_GRANTS: Record<PermissionRole, readonly FeatureKey[]> = {
  ADMIN: FEATURE_KEYS,
  NADZIR: [
    'buat_program',
    'edit_program',
    'kelola_progres',
    'tulis_artikel',
    'ekspor_transparansi',
  ],
  BENDAHARA: [
    'audit_persetujuan',
    'penyaluran_asnaf',
    'ledger_akuntansi',
    'ekspor_transparansi',
  ],
  PETUGAS_LAPANGAN: [
    'kelola_muzakki',
    'kelola_progres',
    'batch_qurban',
    'infaq_program',
  ],
  WAKIF: [],
};

export function rowFromGrants(
  grants: readonly FeatureKey[]
): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, grants.includes(key)])
  ) as Record<FeatureKey, boolean>;
}

export function defaultMatrix(): PermissionMatrix {
  return Object.fromEntries(
    PERMISSION_ROLES.map((role) => [role, rowFromGrants(DEFAULT_GRANTS[role])])
  ) as PermissionMatrix;
}

export function countActive(row: Record<FeatureKey, boolean>): number {
  return FEATURE_KEYS.filter((key) => row[key]).length;
}

export interface PermissionRow {
  role: string;
  featureKey: string;
  isEnabled: boolean;
}

const KNOWN_ROLES = new Set<string>(PERMISSION_ROLES);
const KNOWN_FEATURES = new Set<string>(FEATURE_KEYS);

/**
 * Stored rows override the defaults; anything missing (empty table, a feature
 * added later) falls back to the default. ADMIN is the locked master role and
 * is always fully enabled regardless of what is stored.
 */
export function resolveMatrix(
  rows: readonly PermissionRow[]
): PermissionMatrix {
  const matrix = defaultMatrix();
  for (const row of rows) {
    if (KNOWN_ROLES.has(row.role) && KNOWN_FEATURES.has(row.featureKey)) {
      matrix[row.role as PermissionRole][row.featureKey as FeatureKey] =
        row.isEnabled;
    }
  }
  matrix.ADMIN = rowFromGrants(FEATURE_KEYS);
  return matrix;
}

/** Every (role, feature) cell of the defaults, e.g. for seeding. */
export function defaultPermissionRows(): {
  role: PermissionRole;
  featureKey: FeatureKey;
  isEnabled: boolean;
}[] {
  const matrix = defaultMatrix();
  return PERMISSION_ROLES.flatMap((role) =>
    FEATURE_KEYS.map((featureKey) => ({
      role,
      featureKey,
      isEnabled: matrix[role][featureKey],
    }))
  );
}
