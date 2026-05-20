import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
};

export function DashboardShell({
  title,
  subtitle,
  project = 'Proiect PEO 302141',
  monthLabel = 'Mai 2026',
  roleLabel,
  navItems,
  children,
}: {
  title: string;
  subtitle: string;
  project?: string;
  monthLabel?: string;
  roleLabel?: string;
  navItems: DashboardNavItem[];
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-screen-2xl gap-6 px-4 py-5 lg:px-8 lg:py-7">
        <aside className="hidden w-72 flex-col rounded-[2rem] border border-slate-200/90 bg-white/90 px-5 py-6 shadow-sm lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0b3a67] text-white shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-[#0b3a67]">Raportare PEO</p>
              <p className="text-xs text-slate-500">Concordia · CPC</p>
            </div>
          </div>
          <nav className="mt-9 space-y-1.5 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 font-medium transition',
                  item.active ? 'bg-[#eaf3fb] text-[#0b3a67] shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-3xl bg-[#0b3a67] p-5 text-white shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs"><CalendarDays className="h-4 w-4" />Luna de raportare</div>
            <p className="text-sm font-semibold">{monthLabel}</p>
            <div className="mt-4 h-2 rounded-full bg-white/20"><div className="h-2 w-[74%] rounded-full bg-[#36c2a0]" /></div>
          </div>
        </aside>

        <section className="flex-1 space-y-6">
          <header className="rounded-[2rem] border border-white bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full bg-[#eaf3fb] text-[#0b3a67]">{project}</Badge>
              {roleLabel ? <Badge variant="outline">Rol: {roleLabel}</Badge> : null}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">{subtitle}</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
