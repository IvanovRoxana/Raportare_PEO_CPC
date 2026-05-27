import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  MessageSquare,
  SearchIcon,
  Settings,
  ShieldCheck,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: string;
};

export type DashboardQuickTab = {
  label: string;
  href: string;
  icon?: LucideIcon;
  active?: boolean;
};

export const dashboardNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Activitățile mele', href: '/expert/peo', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Verificări PM', href: '/pm', icon: SearchIcon },
  { label: 'Achiziții', href: '/achizitii', icon: ClipboardList },
  { label: 'Experți', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
  { label: 'Dashboard financiar', href: '/financiar', icon: CircleDollarSign },
];

export const expertNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Activitățile mele', href: '/expert/peo', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Profil', href: '/expert/profil', icon: User },
];

export const pmNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/pm#pm-tabs', icon: CalendarDays },
  { label: 'Rapoarte', href: '/pm#pm-tabs', icon: FileText },
  { label: 'Livrabile', href: '/pm#pm-tabs', icon: Upload },
  { label: 'Verificări PM', href: '/pm', icon: SearchIcon },
  { label: 'Achiziții', href: '/achizitii', icon: ClipboardList },
  { label: 'Experți', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
];

export const adminNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Achiziții', href: '/achizitii', icon: ClipboardList },
  { label: 'Experți', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
];

export const financialNavItems: DashboardNavItem[] = [
  { label: 'Dashboard financiar', href: '/financiar', icon: BarChart3 },
  { label: 'Achiziții', href: '/achizitii', icon: ClipboardList },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Activitățile mele', href: '/expert/peo', icon: FileText },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Experți', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
];

export const procurementNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/achizitii', icon: BarChart3 },
  { label: 'Planificare', href: '/achizitii#planificare', icon: CalendarDays },
  { label: 'Proiecte', href: '/achizitii#proiecte', icon: ClipboardList },
  { label: 'Documentație', href: '/achizitii#documentatie', icon: FileText },
  { label: 'Lansare', href: '/achizitii#lansare', icon: Upload },
  { label: 'Evaluare oferte', href: '/achizitii#evaluare-oferte', icon: SearchIcon },
  { label: 'Contracte', href: '/achizitii#contracte', icon: FileText },
  { label: 'Recepție și facturare', href: '/achizitii#receptie-facturare', icon: CircleDollarSign },
  { label: 'Arhivă', href: '/achizitii#arhiva', icon: Settings },
];

type DashboardShellProps = {
  children: ReactNode;
  title: string;
  eyebrow: string;
  description?: string;
  activeHref?: string;
  navItems?: DashboardNavItem[];
  quickTabs?: DashboardQuickTab[];
  actions?: ReactNode;
  aside?: ReactNode;
  roleLabel?: string;
  reportingMonth?: string;
  progressLabel?: string;
  progressValue?: number;
  className?: string;
  contentClassName?: string;
};

function normalizeHref(href: string) {
  return href.split('#')[0];
}

function isActiveHref(itemHref: string, activeHref: string) {
  if (activeHref.includes('#')) {
    return itemHref === activeHref;
  }

  return normalizeHref(itemHref) === normalizeHref(activeHref) && !itemHref.includes('#');
}

export function DashboardShell({
  children,
  title,
  eyebrow,
  description,
  activeHref = '/',
  navItems = dashboardNavItems,
  quickTabs,
  actions,
  aside,
  roleLabel = 'Concordia · CPC',
  className,
  contentClassName,
}: DashboardShellProps) {
  return (
    <div className={cn('min-h-screen bg-background text-foreground', className)}>
      <div className="flex min-h-screen">
        <aside className="hidden w-[18.25rem] shrink-0 flex-col border-r border-[#dce5ef] bg-white px-5 py-7 shadow-[10px_0_30px_rgba(15,23,42,0.04)] lg:flex">
          <Link href="/" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-primary">Raportare PEO</p>
              <p className="text-sm text-muted-foreground">{roleLabel}</p>
            </div>
          </Link>

          <nav className="mt-10 space-y-2 text-sm" aria-label="Navigație dashboard">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.active ?? isActiveHref(item.href, activeHref);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-[#eaf3fb] text-primary shadow-sm'
                      : 'text-slate-600 hover:bg-[#eaf3fb]/70 hover:text-primary'
                  )}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {item.badge ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-primary shadow-sm">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[1.25rem] border border-[#dce5ef] bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eaf3fb] text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-slate-950">Ai nevoie de ajutor?</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Contactează echipa de suport</p>
            <Link
              href="mailto:suport@concordia.ro"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Deschide tichet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className={cn('px-4 py-5 sm:px-6 lg:px-8 lg:py-7', contentClassName)}>
            <header className="rounded-[2rem] border border-[#dce5ef] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="mb-3 flex w-fit items-center gap-2 rounded-full bg-[#eaf3fb] px-3 py-1 text-xs font-semibold text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {eyebrow}
                  </div>
                  <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-slate-950 md:text-[2rem]">
                    {title}
                  </h1>
                  {description ? (
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>
                  ) : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
              </div>

              {quickTabs?.length ? (
                <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                  {quickTabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <Link
                        key={tab.label}
                        href={tab.href}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          tab.active
                            ? 'border-primary/20 bg-[#eaf3fb] text-primary shadow-sm'
                            : 'border-border bg-white text-muted-foreground hover:bg-secondary hover:text-primary'
                        )}
                      >
                        {Icon ? <Icon className="h-4 w-4" /> : null}
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </header>

            {aside ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-6">{children}</div>
                <aside className="space-y-6">{aside}</aside>
              </div>
            ) : (
              <div className="mt-6 space-y-6">{children}</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
