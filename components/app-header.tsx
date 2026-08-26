'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PanelLeftIcon,
  SearchIcon,
  Settings,
  Upload,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { getSignedInUser, type AppRole } from '@/lib/aws/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserMenu } from '@/components/user-menu';

type HeaderNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: AppRole[];
  active: (pathname: string) => boolean;
};

const headerNavItems: HeaderNavItem[] = [
  {
    label: 'Dashboard',
    href: '/auth/select-dashboard',
    icon: LayoutDashboard,
    active: (pathname) => pathname === '/' || pathname === '/auth/select-dashboard',
  },
  {
    label: 'Home',
    href: '/expert',
    icon: CalendarDays,
    roles: ['expert', 'admin'],
    active: (pathname) => pathname === '/expert',
  },
  {
    label: 'Activitati',
    href: '/expert/peo',
    icon: FileText,
    roles: ['expert'],
    active: (pathname) => pathname === '/expert/peo' || pathname.startsWith('/expert/peo/'),
  },
  {
    label: 'Rapoarte',
    href: '/expert/peo#rapoarte',
    icon: FileText,
    roles: ['expert', 'admin'],
    active: () => false,
  },
  {
    label: 'Livrabile',
    href: '/expert/peo#livrabile',
    icon: Upload,
    roles: ['expert', 'admin'],
    active: () => false,
  },
  {
    label: 'Indexare',
    href: '/expert/livrabile-indexare',
    icon: SearchIcon,
    roles: ['expert', 'pm', 'admin'],
    active: (pathname) => pathname === '/expert/livrabile-indexare',
  },
  {
    label: 'Verificari PM',
    href: '/pm',
    icon: SearchIcon,
    roles: ['pm', 'admin'],
    active: (pathname) => pathname === '/pm' || pathname.startsWith('/pm/'),
  },
  {
    label: 'Grup Tinta',
    href: '/gt',
    icon: UsersRound,
    roles: ['expert', 'pm', 'admin'],
    active: (pathname) => pathname === '/gt' || pathname.startsWith('/gt/'),
  },
  {
    label: 'Achizitii',
    href: '/achizitii',
    icon: ClipboardList,
    roles: ['pm', 'admin'],
    active: (pathname) => pathname === '/achizitii' || pathname.startsWith('/achizitii/'),
  },
  {
    label: 'Experti',
    href: '/pm#situatie-lunara',
    icon: Users,
    roles: ['pm', 'admin'],
    active: () => false,
  },
  {
    label: 'Financiar',
    href: '/financiar',
    icon: CircleDollarSign,
    roles: ['pm', 'admin'],
    active: (pathname) => pathname === '/financiar' || pathname.startsWith('/financiar/'),
  },
  {
    label: 'Administrare',
    href: '/admin',
    icon: Settings,
    roles: ['admin'],
    active: (pathname) => pathname === '/admin' || pathname.startsWith('/admin/'),
  },
];

function canShowItem(item: HeaderNavItem, roles: AppRole[]) {
  if (!item.roles) return true;
  return item.roles.some((role) => roles.includes(role));
}

export function AppHeader() {
  const pathname = usePathname() || '/';
  const [roles, setRoles] = useState<AppRole[] | null>(null);
  const [hasCheckedUser, setHasCheckedUser] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHasCheckedUser(false);

    getSignedInUser()
      .then((user) => {
        if (!isMounted) return;
        setRoles(user?.roles ?? null);
      })
      .finally(() => {
        if (isMounted) setHasCheckedUser(true);
      });

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const visibleNavItems = useMemo(() => {
    if (!hasCheckedUser || !roles) return [];
    return headerNavItems.filter((item) => canShowItem(item, roles));
  }, [hasCheckedUser, roles]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center gap-3 px-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Concordia"
          className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/identity/logo-cpc-header.png"
            alt="Confederatia Patronala Concordia"
            width={769}
            height={247}
            priority
            className="h-10 w-auto max-w-[9rem] object-contain sm:h-12 sm:max-w-[13rem]"
          />
        </Link>

        {visibleNavItems.length ? (
          <nav
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2 xl:flex"
            aria-label="Navigatie principala"
          >
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.active(pathname);

              return (
                <Button
                  key={item.label}
                  asChild
                  variant="ghost"
                  className={cn(
                    'h-10 shrink-0 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-[#eef3ff] hover:text-primary',
                    isActive && 'bg-[#315be7] text-white shadow-sm hover:bg-[#274bd0] hover:text-white',
                  )}
                >
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {visibleNavItems.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-md xl:hidden">
                  <PanelLeftIcon className="h-4 w-4" />
                  Menu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <DropdownMenuItem key={item.label} asChild>
                      <Link href={item.href} className={cn(item.active(pathname) && 'bg-secondary text-primary')}>
                        <Icon className="mr-2 h-4 w-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
