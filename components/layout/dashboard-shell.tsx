import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  FileText,
  SearchIcon,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
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
  { label: 'Livrabile', href: '/expert/peo', icon: Upload },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Verificari PM', href: '/pm', icon: SearchIcon },
  { label: 'Experti', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
  { label: 'Financiar', href: '/financiar', icon: CircleDollarSign },
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
  reportingMonth = 'Mai 2026',
  progressLabel = 'progres validare',
  progressValue = 74,
  className,
  contentClassName,
}: DashboardShellProps) {
  const activePath = normalizeHref(activeHref);
  const clampedProgress = Math.max(0, Math.min(100, progressValue));

  return (
    <div className={cn('min-h-screen bg-background text-foreground', className)}>
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-white/90 px-5 py-6 shadow-sm lg:flex">
          <Link href="/" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-primary">Raportare PEO</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          </Link>

          <nav className="mt-9 space-y-1.5 text-sm" aria-label="Navigatie dashboard">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.active ?? normalizeHref(item.href) === activePath;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl px-4 py-3 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
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

          <div className="mt-auto rounded-3xl bg-primary p-5 text-primary-foreground shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold">Luna de raportare</p>
            <p className="mt-1 text-xs leading-5 text-white/75">
              {reportingMonth} · {progressLabel} {clampedProgress}%
            </p>
            <div className="mt-4 h-2 rounded-full bg-white/20">
              <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${clampedProgress}%` }} />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className={cn('px-4 py-5 sm:px-6 lg:px-8 lg:py-7', contentClassName)}>
            <header className="rounded-[2rem] border border-white bg-white/85 p-5 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {eyebrow}
                  </div>
                  <h1 className="max-w-4xl text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
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
                            ? 'border-primary/20 bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-white text-muted-foreground hover:bg-secondary hover:text-foreground'
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
