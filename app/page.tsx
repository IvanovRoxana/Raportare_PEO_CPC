import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { LoginCard, LoginCardFallback } from '@/components/auth/login-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const modules = [
  {
    title: 'Pontaj experți',
    desc: 'Ore, zile, locație și activități validate lunar.',
    icon: CalendarDays,
    statusLabel: 'Actualizat',
    statusVariant: 'verificat' as const,
    iconTone: 'bg-sky-50 text-sky-700',
    href: '/expert',
  },
  {
    title: 'Livrabile',
    desc: 'Încărcare documente, OPIS și verificare rapidă.',
    icon: Upload,
    statusLabel: '12 fișiere',
    statusVariant: 'conform' as const,
    iconTone: 'bg-indigo-50 text-indigo-700',
    href: '/expert',
  },
  {
    title: 'Verificări PM',
    desc: 'Conformitate, observații și traseu de aprobare.',
    icon: ClipboardCheck,
    statusLabel: 'În lucru',
    statusVariant: 'in_lucru' as const,
    iconTone: 'bg-amber-50 text-amber-700',
    href: '/pm',
  },
  {
    title: 'Rapoarte Anexa 10',
    desc: 'Generare, revizuire și export pentru raportare.',
    icon: FileText,
    statusLabel: 'Gata export',
    statusVariant: 'gata_export' as const,
    iconTone: 'bg-emerald-50 text-emerald-700',
    href: '/expert/peo',
  },
];

const rows = [
  ['SA1.1', 'Analiză documente proiect', '8h', 'Conform', 'Verificat'],
  ['SA3.2', 'Raport activitate expert', '6h', 'Cu observații', 'Revizie'],
  ['SA3.5', 'Livrabile suport membri', '4h', 'În lucru', 'PM'],
] as const;

export default function HomePage() {
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
            {[
              { icon: BarChart3, label: 'Dashboard' },
              { icon: CalendarDays, label: 'Pontaj lunar' },
              { icon: FileText, label: 'Rapoarte' },
              { icon: Upload, label: 'Livrabile' },
              { icon: Users, label: 'Experți' },
              { icon: Settings, label: 'Administrare' },
            ].map(({ icon: Icon, label }, index) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-medium transition ${
                  index === 0 ? 'bg-[#eaf3fb] text-[#0b3a67] shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </div>
            ))}
          </nav>

          <div className="mt-auto rounded-3xl bg-[#0b3a67] p-5 text-white shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold">Luna de raportare</p>
            <p className="mt-1 text-xs leading-5 text-white/75">Mai 2026 · progres validare 74%</p>
            <div className="mt-4 h-2 rounded-full bg-white/20">
              <div className="h-2 w-[74%] rounded-full bg-[#36c2a0]" />
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          <header className="flex flex-col gap-4 rounded-[2rem] border border-white bg-white/80 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex w-fit items-center gap-2 rounded-full bg-[#eaf3fb] px-3 py-1 text-xs font-semibold text-[#0b3a67]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Proiect PEO 302141
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
                Consolidarea capacității Concordia pentru dialog social
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Platformă internă pentru pontaj, livrabile, rapoarte de activitate și verificări de conformitate.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-2xl border-slate-200 bg-white">
                <Link href="/financiar">Export lunar</Link>
              </Button>
              <Button asChild className="rounded-2xl bg-[#0b3a67] hover:bg-[#082f56]">
                <Link href="/expert/peo">
                  Adaugă raport
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <Card key={module.title} className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${module.iconTone}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <Badge variant={module.statusVariant}>{module.statusLabel}</Badge>
                    </div>
                    <h3 className="mt-5 text-base font-bold text-slate-950">{module.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{module.desc}</p>
                    <Button asChild variant="ghost" className="mt-3 h-8 px-0 text-[#0b3a67]">
                      <Link href={module.href}>Deschide modul</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-950">Situație raportare lunară</CardTitle>
                  <CardDescription className="mt-1 text-sm text-slate-500">Privire rapidă asupra activităților, orelor și verificărilor.</CardDescription>
                </div>
                <Button variant="outline" className="rounded-2xl border-slate-200 bg-white">Vezi tot</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-6 py-4 font-semibold">SA</th>
                        <th className="px-6 py-4 font-semibold">Activitate</th>
                        <th className="px-6 py-4 font-semibold">Ore</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold">Responsabil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <tr key={row.join('-')} className="hover:bg-slate-50/70">
                          <td className="px-6 py-4 font-semibold text-[#0b3a67]">{row[0]}</td>
                          <td className="px-6 py-4 text-slate-700">{row[1]}</td>
                          <td className="px-6 py-4 font-medium text-slate-900">{row[2]}</td>
                          <td className="px-6 py-4">
                            <Badge variant={row[3] === 'Conform' ? 'conform' : row[3] === 'Cu observații' ? 'cu_observatii' : 'in_lucru'}>{row[3]}</Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-500">{row[4]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Conformitate lunară</p>
                      <p className="mt-2 text-4xl font-bold tracking-tight text-slate-950">74%</p>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#e9faf5] text-[#087a63]"><CheckCircle2 className="h-7 w-7" /></div>
                  </div>
                  <div className="mt-5 h-3 rounded-full bg-slate-100"><div className="h-3 w-[74%] rounded-full bg-[#36c2a0]" /></div>
                  <p className="mt-4 text-sm leading-6 text-slate-500">18 rapoarte verificate, 6 cu observații, 3 în curs de completare.</p>
                </CardContent>
              </Card>

              <section id="autentificare" className="scroll-mt-32">
                <Suspense fallback={<LoginCardFallback />}>
                  <LoginCard title="Intră în aplicație" description="Acces securizat pentru experți, PM și administratori tehnici." />
                </Suspense>
              </section>

              <Card className="rounded-[2rem] border-slate-200 bg-white shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff7e6] text-[#b7791f]"><ClipboardList className="h-5 w-5" /></div>
                    <div>
                      <p className="font-bold text-slate-950">Checklist PM</p>
                      <p className="text-sm text-slate-500">5 observații rămase</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
