import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  SearchIcon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  User,
  Users,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  badge?: string;
  disabled?: boolean;
};

export type DashboardQuickTab = {
  label: string;
  href: string;
  icon?: LucideIcon;
  active?: boolean;
  disabled?: boolean;
};

export const dashboardNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Activitatile mele', href: '/expert/peo', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Indexare livrabile', href: '/expert/livrabile-indexare', icon: SearchIcon, disabled: true },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Verificari PM', href: '/pm', icon: SearchIcon },
  { label: 'Grup Tinta', href: '/gt', icon: UsersRound },
  { label: 'Achizitii', href: '/achizitii', icon: ClipboardList },
  { label: 'Experti', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
  { label: 'Dashboard financiar', href: '/financiar', icon: CircleDollarSign },
];

export const expertNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Activitatile mele', href: '/expert/peo', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Indexare livrabile', href: '/expert/livrabile-indexare', icon: SearchIcon, disabled: true },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Grup Tinta', href: '/gt', icon: UsersRound },
  { label: 'Profil', href: '/expert/profil', icon: User },
];

export const pmNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/pm#pm-tabs', icon: CalendarDays },
  { label: 'Rapoarte', href: '/pm#pm-tabs', icon: FileText },
  { label: 'Livrabile', href: '/pm#pm-tabs', icon: Upload },
  { label: 'Indexare livrabile', href: '/expert/livrabile-indexare', icon: SearchIcon, disabled: true },
  { label: 'Verificari PM', href: '/pm', icon: SearchIcon },
  { label: 'Grup Tinta', href: '/gt', icon: UsersRound },
  { label: 'Achizitii', href: '/achizitii', icon: ClipboardList },
  { label: 'Experti', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
];

export const adminNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/', icon: BarChart3 },
  { label: 'Pontaj lunar', href: '/expert', icon: CalendarDays },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Indexare livrabile', href: '/expert/livrabile-indexare', icon: SearchIcon, disabled: true },
  { label: 'Grup Tinta', href: '/gt', icon: UsersRound },
  { label: 'Achizitii', href: '/achizitii', icon: ClipboardList },
  { label: 'Experti', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
];

export const financialNavItems: DashboardNavItem[] = [
  { label: 'Dashboard financiar', href: '/financiar', icon: BarChart3 },
  { label: 'Salariati', href: '/financiar/salariati', icon: Users },
  { label: 'Pontaje', href: '/financiar/pontaje', icon: CalendarDays },
  { label: 'Concedii', href: '/financiar/concedii', icon: ShieldCheck },
  { label: 'Achizitii', href: '/achizitii', icon: ClipboardList },
  { label: 'Activitatile mele', href: '/expert/peo', icon: FileText },
  { label: 'Rapoarte', href: '/expert/peo#rapoarte', icon: FileText },
  { label: 'Livrabile', href: '/expert/peo#livrabile', icon: Upload },
  { label: 'Indexare livrabile', href: '/expert/livrabile-indexare', icon: SearchIcon, disabled: true },
  { label: 'Experti', href: '/pm#situatie-lunara', icon: Users },
  { label: 'Administrare', href: '/admin', icon: Settings },
];

export const procurementNavItems: DashboardNavItem[] = [
  { label: 'Dashboard', href: '/achizitii', icon: BarChart3 },
  { label: 'Planificare', href: '/achizitii#planificare', icon: CalendarDays },
  { label: 'Proiecte', href: '/achizitii#proiecte', icon: ClipboardList },
  { label: 'Documentatie', href: '/achizitii#documentatie', icon: FileText },
  { label: 'Lansare', href: '/achizitii#lansare', icon: Upload },
  { label: 'Evaluare', href: '/achizitii#evaluare', icon: SearchIcon },
  { label: 'Contracte', href: '/achizitii#contracte', icon: FileText },
  { label: 'Receptie si facturare', href: '/achizitii#receptie-facturare', icon: CircleDollarSign },
  { label: 'Arhiva', href: '/achizitii#arhiva', icon: Settings },
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
  hideHeader?: boolean;
};

export function DashboardShell({
  children,
  title,
  eyebrow,
  description,
  reportingMonth,
  quickTabs,
  actions,
  aside,
  className,
  contentClassName,
  hideHeader = false,
}: DashboardShellProps) {
  return (
    <div className={cn('min-h-screen bg-background text-foreground', className)}>
      <main className={cn('mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7', contentClassName)}>
        {!hideHeader ? (
        <header className="rounded-2xl border border-[#dce5ef] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex w-fit items-center gap-2 rounded-full bg-[#eaf3fb] px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                {eyebrow}
              </div>
              <h1 className="max-w-4xl text-2xl font-bold tracking-tight text-slate-950 md:text-[1.75rem]">
                {title}
              </h1>
              {reportingMonth ? (
                <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#dce5ef] bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {reportingMonth}
                </div>
              ) : null}
              {description ? (
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions || aside ? (
              <div className="flex flex-wrap items-center gap-2">
                {actions}
                {aside ? (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="lg:hidden">
                        <SlidersHorizontal className="h-4 w-4" />
                        Detalii
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[min(92vw,28rem)] overflow-y-auto p-0 sm:max-w-md">
                      <SheetHeader className="border-b border-border px-5 py-4 text-left">
                        <SheetTitle>Detalii</SheetTitle>
                        <SheetDescription>Informatii si actiuni rapide pentru pagina curenta.</SheetDescription>
                      </SheetHeader>
                      <div className="space-y-6 p-5">{aside}</div>
                    </SheetContent>
                  </Sheet>
                ) : null}
              </div>
            ) : null}
          </div>

          {quickTabs?.length ? (
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {quickTabs.map((tab) => {
                const Icon = tab.icon;

                if (tab.disabled) {
                  return (
                    <span
                      key={tab.label}
                      aria-disabled="true"
                      title="Modul in lucru"
                      className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400"
                    >
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      {tab.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      tab.active
                        ? 'border-primary/20 bg-[#eaf3fb] text-primary shadow-sm'
                        : 'border-border bg-white text-muted-foreground hover:bg-secondary hover:text-primary',
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
        ) : null}

        {aside ? (
          <div className={cn(!hideHeader && 'mt-5', 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start')}>
            <div className="min-w-0 space-y-6">{children}</div>
            <aside className="hidden space-y-6 lg:block">{aside}</aside>
          </div>
        ) : (
          <div className={cn(!hideHeader && 'mt-5', 'space-y-6')}>{children}</div>
        )}
      </main>
    </div>
  );
}
