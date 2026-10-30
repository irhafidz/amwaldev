'use client';

import { Link, useLocation } from '@tanstack/react-router';
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Coins,
  Database,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Grid,
  HeartHandshake,
  Layers,
  LayoutDashboard,
  LogOut,
  Newspaper,
  PackageCheck,
  Receipt,
  Settings,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { type ComponentType, useEffect, useState } from 'react';
import authClient from '@/lib/auth/auth-client';

interface BackofficeSidebarProps {
  role?: 'ADMIN' | 'NADZIR' | string;
  userName?: string;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

type IconType = ComponentType<{ className?: string }>;

interface SubMenuItem {
  id: string;
  label: string;
  subtitle: string;
  /** Pathname only. Query params ride in `search`. */
  to: string;
  search?: Record<string, string>;
  icon: IconType;
  /** exact match = pathname (+ `search.view`) must equal this item exactly */
  exactMatch?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  subtitle: string;
  to?: string;
  icon: IconType;
  sectionHeader?: string;
  /** Highlight only when the pathname equals `to` (no sub-route prefix match). */
  exact?: boolean;
  isDropdown?: boolean;
  children?: SubMenuItem[];
}

function buildMenu(isAdmin: boolean): MenuItem[] {
  if (!isAdmin) {
    return [
      {
        id: 'nazhir_manage',
        label: 'Manajemen Program',
        subtitle: 'Progres Fisik & Status BWI',
        to: '/nadzir',
        icon: Layers,
        sectionHeader: 'Modul Nazhir Wakaf',
      },
      {
        id: 'nazhir_receipts_single',
        label: 'Kuitansi & Bukti Belanja',
        subtitle: 'Unggah & Status Audit',
        to: '/nadzir',
        icon: Receipt,
      },
    ];
  }

  return [
    {
      id: 'overview',
      label: 'Ringkasan Utama',
      subtitle: 'RFMD, Retensi & Status Otoritas',
      to: '/admin',
      exact: true,
      icon: LayoutDashboard,
      sectionHeader: 'Tata Kelola Amwal',
    },
    {
      id: 'user_management_dropdown',
      label: 'Manajemen Pengguna',
      subtitle: 'Akun & Hak Akses',
      icon: Users,
      isDropdown: true,
      children: [
        {
          id: 'user_accounts',
          label: 'Manajemen Akun',
          subtitle: 'Daftar Akun & Penugasan Role',
          to: '/admin/users',
          icon: UserCog,
          exactMatch: true,
        },
        {
          id: 'role_management',
          label: 'Manajemen Role',
          subtitle: 'Matriks RBAC & Otoritas Fitur',
          to: '/admin/roles',
          icon: UserCheck,
          exactMatch: true,
        },
      ],
    },
    // Satu bagian "Program & Dana": empat modul filantropi sejajar, tanpa
    // dropdown (UAT #4: "kenapa program wakaf aja yang disendirikan?").
    {
      id: 'wakaf_list',
      label: 'Program Wakaf',
      subtitle: 'Manajemen & Progres Fisik',
      to: '/admin/wakaf',
      icon: Layers,
      sectionHeader: 'Program & Dana',
    },
    {
      id: 'ziswaf_infaq',
      label: 'Infaq & Sedekah',
      subtitle: 'Program & Donasi Manual',
      to: '/admin/ziswaf/infaq',
      exact: true,
      icon: HeartHandshake,
    },
    {
      id: 'ziswaf_zakat',
      label: 'Zakat & 8 Asnaf',
      subtitle: 'Pencatatan & Penyaluran',
      to: '/admin/ziswaf/zakat',
      exact: true,
      icon: Coins,
    },
    {
      id: 'ziswaf_qurban',
      label: 'Qurban & RPH',
      subtitle: 'Paket Hewan & Sembelih',
      to: '/admin/ziswaf/qurban',
      exact: true,
      icon: PackageCheck,
    },
    {
      id: 'master_data',
      label: 'Master Data',
      subtitle: 'Akad Waqaf & Kategori Waqaf',
      to: '/admin/master-data',
      icon: Database,
      sectionHeader: 'Data Referensi',
    },
    {
      id: 'segmentation',
      label: 'Kelompok Donatur',
      subtitle: 'Tabel Segmentasi RFM-D',
      to: '/admin/segmentasi',
      icon: Users,
      sectionHeader: 'Analitik & Transparansi',
    },
    {
      id: 'cohort',
      label: 'Kesetiaan Donatur',
      subtitle: 'Retensi & Heatmap M+1',
      to: '/admin/kesetiaan',
      icon: Grid,
    },
    {
      id: 'transparansi',
      label: 'Catatan Transparansi',
      subtitle: 'Log Audit & Realisasi Dana',
      to: '/admin/transparansi',
      icon: FileSpreadsheet,
    },
    {
      id: 'education_dropdown',
      label: 'Edukasi & Berita',
      subtitle: 'Artikel, Video & Publikasi',
      icon: GraduationCap,
      sectionHeader: 'Sistem Informasi & Publikasi',
      isDropdown: true,
      children: [
        {
          id: 'education',
          label: 'Manajemen Edukasi',
          subtitle: 'Artikel Fiqih & Literasi',
          to: '/admin/edukasi',
          icon: GraduationCap,
          exactMatch: true,
        },
        {
          id: 'news',
          label: 'Manajemen Berita',
          subtitle: 'Liputan Kegiatan & Pengumuman',
          to: '/admin/berita',
          icon: Newspaper,
          exactMatch: true,
        },
        {
          id: 'documents',
          label: 'Dokumen Legalitas',
          subtitle: 'Arsip SK, AIW & Sertifikat',
          to: '/admin/dokumen',
          icon: FileText,
          exactMatch: true,
        },
      ],
    },
    {
      id: 'notifikasi',
      label: 'Manajemen Notifikasi',
      subtitle: 'Kirim & Kelola Notifikasi Pengguna',
      to: '/admin/notifikasi',
      icon: Bell,
    },
    {
      id: 'panduan',
      label: 'Panduan Admin',
      subtitle: 'Langkah Ringkas Tugas Harian',
      to: '/admin/panduan',
      icon: BookOpen,
      sectionHeader: 'Bantuan',
    },
    {
      id: 'settings',
      label: 'Pengaturan Sistem',
      subtitle: 'Konfigurasi Platform',
      to: '/admin/pengaturan',
      icon: Settings,
    },
  ];
}

const TRAILING_SLASH = /\/+$/;

interface ActiveContext {
  pathname: string;
  viewParam?: string;
}

function isSubActive(
  sub: SubMenuItem,
  siblings: SubMenuItem[],
  ctx: ActiveContext
): boolean {
  if (sub.exactMatch) {
    if (sub.to !== ctx.pathname) {
      return false;
    }
    const wanted = sub.search?.view;
    if (wanted) {
      return ctx.viewParam === wanted;
    }
    return !ctx.viewParam;
  }
  const moreSpecificSibling = siblings.some(
    (s) => s !== sub && ctx.pathname === s.to
  );
  if (moreSpecificSibling) {
    return false;
  }
  return ctx.pathname === sub.to || ctx.pathname.startsWith(`${sub.to}/`);
}

function isLeafActive(item: MenuItem, ctx: ActiveContext): boolean {
  if (!item.to || item.isDropdown) {
    return false;
  }
  if (item.exact) {
    return ctx.pathname.replace(TRAILING_SLASH, '') === item.to;
  }
  return ctx.pathname === item.to || ctx.pathname.startsWith(`${item.to}/`);
}

function SidebarSubLink({
  sub,
  active,
  onNavigate,
}: {
  sub: SubMenuItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const SubIcon = sub.icon;
  const shell = active
    ? 'bg-[#356152] text-white shadow-xs'
    : 'text-slate-600 hover:bg-[#356152]/10 hover:text-[#356152]';
  const iconTone = active
    ? 'text-white'
    : 'text-slate-400 group-hover:text-[#356152]';
  const subtitleTone = active ? 'text-white/75' : 'text-slate-400';

  return (
    <Link
      className={`group flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-all ${shell}`}
      onClick={onNavigate}
      search={sub.search}
      to={sub.to}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SubIcon className={`h-4 w-4 min-w-[16px] shrink-0 ${iconTone}`} />
        <div className="truncate">
          <div className="truncate font-medium text-xs leading-tight">
            {sub.label}
          </div>
          <div className={`truncate text-xs ${subtitleTone}`}>
            {sub.subtitle}
          </div>
        </div>
      </div>
    </Link>
  );
}

function SidebarDropdown({
  item,
  ctx,
  onNavigate,
}: {
  item: MenuItem;
  ctx: ActiveContext;
  onNavigate: () => void;
}) {
  const siblings = item.children ?? [];
  const childActive = siblings.some((c) => isSubActive(c, siblings, ctx));
  const [open, setOpen] = useState(childActive);
  const Icon = item.icon;

  // Navigating to a child route from anywhere (links, search, back button)
  // must reveal it, not only the initial page load.
  useEffect(() => {
    if (childActive) {
      setOpen(true);
    }
  }, [childActive]);

  const triggerShell = childActive
    ? 'border border-[#356152]/20 bg-[#356152]/10 font-semibold text-[#244438]'
    : 'border border-transparent text-slate-700 hover:bg-[#356152]/[0.07] hover:text-[#356152]';
  const iconTone = childActive
    ? 'text-[#356152]'
    : 'text-slate-500 group-hover:text-[#356152]';
  const chevronTone = childActive ? 'text-[#356152]' : 'text-slate-400';
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <div>
      <button
        className={`group flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-2.5 text-left transition-all ${triggerShell}`}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Icon className={`h-5 w-5 min-w-[20px] shrink-0 ${iconTone}`} />
          <div className="truncate">
            <div className="truncate font-bold text-xs leading-tight">
              {item.label}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-slate-400">
              {item.subtitle}
            </div>
          </div>
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          <Chevron className={`h-3.5 w-3.5 shrink-0 ${chevronTone}`} />
        </div>
      </button>

      {open && (
        <div className="fade-in slide-in-from-top-1 mt-0.5 ml-3 animate-in space-y-0.5 border-[#356152]/25 border-l-2 py-1 pl-3.5 duration-150">
          {siblings.map((sub) => (
            <SidebarSubLink
              active={isSubActive(sub, siblings, ctx)}
              key={sub.id}
              onNavigate={onNavigate}
              sub={sub}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarLeaf({
  item,
  ctx,
  onNavigate,
}: {
  item: MenuItem;
  ctx: ActiveContext;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const active = isLeafActive(item, ctx);
  const shell = active
    ? 'border-transparent bg-[#356152] text-white shadow-xs'
    : 'border-transparent text-slate-700 hover:bg-[#356152]/[0.07] hover:text-[#356152]';
  const iconTone = active
    ? 'text-white'
    : 'text-slate-500 group-hover:text-[#356152]';
  const subtitleTone = active ? 'text-white/75' : 'text-slate-400';

  return (
    <Link
      activeOptions={{ exact: item.exact === true }}
      className={`group flex w-full cursor-pointer items-center justify-between rounded-xl border px-2.5 py-2.5 text-left transition-all ${shell}`}
      onClick={onNavigate}
      to={item.to ?? '/admin'}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon className={`h-5 w-5 min-w-[20px] shrink-0 ${iconTone}`} />
        <div className="truncate">
          <div className="truncate font-bold text-xs leading-tight">
            {item.label}
          </div>
          <div className={`mt-0.5 truncate text-[10px] ${subtitleTone}`}>
            {item.subtitle}
          </div>
        </div>
      </div>
    </Link>
  );
}

function SidebarRow({
  item,
  index,
  ctx,
  onNavigate,
}: {
  item: MenuItem;
  index: number;
  ctx: ActiveContext;
  onNavigate: () => void;
}) {
  const isDropdown = Boolean(item.isDropdown && item.children?.length);

  return (
    <div>
      {item.sectionHeader && (
        <div
          className={`px-2 ${
            index === 0 ? 'pt-0.5' : 'pt-4'
          } pb-1.5 font-bold text-[10px] text-slate-400 uppercase tracking-wider`}
        >
          {item.sectionHeader}
        </div>
      )}
      {isDropdown ? (
        <SidebarDropdown ctx={ctx} item={item} onNavigate={onNavigate} />
      ) : (
        <SidebarLeaf ctx={ctx} item={item} onNavigate={onNavigate} />
      )}
    </div>
  );
}

export function BackofficeSidebar({
  role = 'ADMIN',
  userName = 'Super Admin',
  mobileOpen = false,
  setMobileOpen,
}: BackofficeSidebarProps) {
  const location = useLocation();
  const rawView = (location.search as { view?: unknown }).view;
  const ctx: ActiveContext = {
    pathname: location.pathname,
    viewParam: typeof rawView === 'string' ? rawView : undefined,
  };

  const handleNavClick = () => setMobileOpen?.(false);

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Sign-out still navigates even if the server call fails.
    } finally {
      window.location.assign('/auth/login');
    }
  };

  const menuItems = buildMenu(role === 'ADMIN');
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'A';

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Tutup menu"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen?.(false)}
          type="button"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-[#356152]/15 border-r bg-white font-jakarta shadow-sm transition-transform duration-300 ease-in-out lg:sticky lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-[#356152]/10 border-b p-5">
          <Link
            aria-label="Kembali ke Dashboard Utama"
            className="flex cursor-pointer items-center gap-2.5 transition hover:opacity-85"
            to={role === 'ADMIN' ? '/admin' : '/nadzir'}
          >
            {/* biome-ignore lint/performance/noImgElement: TanStack Start has no next/image */}
            <img
              alt="Amwal Platform ZISWAF"
              className="h-8 w-auto object-contain"
              src="/assets/images/amwal-logo-color-h.png"
            />
          </Link>

          {setMobileOpen && (
            <button
              aria-label="Tutup Menu"
              className="cursor-pointer p-1 text-slate-400 hover:text-slate-600 lg:hidden"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {menuItems.map((item, index) => (
            <SidebarRow
              ctx={ctx}
              index={index}
              item={item}
              key={item.id}
              onNavigate={handleNavClick}
            />
          ))}
        </div>

        <div className="shrink-0 space-y-2 border-[#356152]/15 border-t bg-[#F2F6F4] p-3">
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-700 text-xs shadow-xs transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            onClick={handleLogout}
            type="button"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Keluar / Ganti Akun Role
          </button>
          <div className="text-center font-mono text-[10px] text-slate-400">
            {userInitial} · Amwal Sys v2.8 Syariah
          </div>
        </div>
      </aside>
    </>
  );
}
