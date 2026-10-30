import type { PermissionRole } from '@amwal/core/auth/permissions';
import { ROLES } from './role-matrix-data';

export type RoleFilter = 'ALL' | PermissionRole;
export type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export const ROLE_META: Record<
  PermissionRole,
  { badge: string; guidance: string }
> = {
  ADMIN: {
    badge: 'bg-slate-800 text-white border-slate-800',
    guidance:
      'Pemilik platform: akses penuh ke seluruh modul, termasuk verifikasi Nazhir, konfigurasi role, dan audit.',
  },
  NADZIR: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    guidance:
      'Pimpinan lembaga / program manager: membuat dan mengelola program wakaf serta melaporkan progres.',
  },
  BENDAHARA: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    guidance:
      'Memiliki wewenang menyetujui pencairan dana, rekonsiliasi kas, dan memvalidasi kuitansi.',
  },
  PETUGAS_LAPANGAN: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    guidance:
      'Mencatat penerimaan dan penyaluran di lapangan serta mengajukan kebutuhan dana.',
  },
  WAKIF: {
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    guidance:
      'Akses publik: berwakaf, berzakat, berinfaq, dan berqurban tanpa akses ke backoffice.',
  },
};

export function roleLabel(role: PermissionRole): string {
  return ROLES.find((r) => r.id === role)?.label ?? role;
}

/** Affiliation shown in the table; donors are "Publik" unless stated otherwise. */
export function affiliationLabel(
  institution: string | null,
  role: PermissionRole
): string {
  if (institution) {
    return institution;
  }
  return role === 'WAKIF' ? 'Publik' : '—';
}

export function formatJoinDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
