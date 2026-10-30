import { Link, useLocation } from '@tanstack/react-router';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  to: string;
  activeIcon?: string;
  inactiveIcon?: string;
  isProfile?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Beranda',
    to: '/dashboard',
    activeIcon: '/assets/images/navbar/1-active.png',
    inactiveIcon: '/assets/images/navbar/1-deactivated.png',
  },
  {
    name: 'Wakaf',
    to: '/wakaf',
    activeIcon: '/assets/images/navbar/2-active.png',
    inactiveIcon: '/assets/images/navbar/2-deactivated.png',
  },
  {
    name: 'Riwayat',
    to: '/riwayat',
    activeIcon: '/assets/images/navbar/3-active.png',
    inactiveIcon: '/assets/images/navbar/3-deactivated.png',
  },
  {
    name: 'Edukasi',
    to: '/edukasi',
    activeIcon: '/assets/images/navbar/4-active.png',
    inactiveIcon: '/assets/images/navbar/4-deactivated.png',
  },
  {
    name: 'Profil',
    to: '/profil',
    isProfile: true,
  },
];

/**
 * Paints the Hi-Fi PNG's silhouette in the current text color. The raw assets
 * ship with a light/lime green, so the brand color is applied here instead of
 * relying on whatever is baked into the image.
 */
function MaskIcon({ src, className }: { src: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block size-6 bg-current transition-transform duration-150 group-hover:scale-105',
        className
      )}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

function isActive(pathname: string, to: string): boolean {
  if (to === '/dashboard') {
    return pathname === '/dashboard' || pathname === '/';
  }
  return pathname.startsWith(to);
}

const ACTIVE_COLOR = 'text-[#356152]';
const INACTIVE_COLOR = 'text-[#6B7280]';

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  const iconSrc = (active ? item.activeIcon : item.inactiveIcon) ?? '';

  return (
    <Link
      className="group flex h-full cursor-pointer flex-col items-center justify-center py-2"
      to={item.to}
    >
      <span className="relative flex size-6 items-center justify-center">
        {item.isProfile ? (
          <User
            aria-hidden="true"
            className={cn(
              'size-5 transition-transform duration-150 group-hover:scale-105',
              color
            )}
            strokeWidth={active ? 2.5 : 2}
          />
        ) : (
          <MaskIcon className={color} src={iconSrc} />
        )}
      </span>
      <span
        className={cn(
          'mt-1 text-[12px] leading-[16px] transition-colors duration-150',
          active
            ? `font-medium ${ACTIVE_COLOR}`
            : `font-normal ${INACTIVE_COLOR} group-hover:text-gray-700`
        )}
      >
        {item.name}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed right-0 bottom-0 left-0 z-50 h-[72px] shrink-0 border-[#F3F4F6] border-t bg-white shadow-[0px_-4px_12px_rgba(13,26,13,0.06)] md:hidden dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="grid h-full grid-cols-5 items-center">
        {NAV_ITEMS.map((item) => (
          <NavLink
            active={isActive(pathname, item.to)}
            item={item}
            key={item.to}
          />
        ))}
      </div>
    </nav>
  );
}
