import { Suspense } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  LockKeyhole,
  SearchIcon,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { LoginCard, LoginCardFallback } from '@/components/auth/login-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const moduleCards = [
  {
    title: 'Pontaj experti',
    desc: 'Ore, zile, locatie si activitati validate lunar.',
    href: '/expert',
    icon: CalendarDays,
    status: 'Actualizat',
    tone: 'bg-blue-50 text-blue-700',
  },
  {
    title: 'Livrabile',
    desc: 'Incarcare documente, OPIS si verificare rapida.',
    href: '/expert/peo',
    icon: Upload,
    status: '12 fisiere',
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    title: 'Verificari PM',
    desc: 'Conformitate, observatii si traseu de aprobare.',
    href: '/pm',
    icon: SearchIcon,
    status: 'In lucru',
    tone: 'bg-amber-50 text-amber-700',
  },
  {
    title: 'Rapoarte Anexa 10',
    desc: 'Generare, revizuire si export pentru raportare.',
    href: '/expert/peo',
    icon: FileText,
    status: 'Gata export',
    tone: 'bg-indigo-50 text-indigo-700',
  },
];

const kpiStats = [
  { label: 'Conformitate lunara', value: '74%', status: 'conform' as const },
  { label: 'Rapoarte verificate', value: '18', status: 'verificat' as const },
  { label: 'Cu observatii', value: '6', status: 'cu_observatii' as const },
  { label: 'Lipsa documente', value: '3', status: 'lipsa_documente' as const },
  { label: 'Pontaj incomplet', value: '5', status: 'in_lucru' as const },
  { label: 'Gata export', value: '12', status: 'gata_export' as const },
];

const monthlyRows = [
  ['SA1.1', 'Analiza documente proiect', '8h', 'Conform', 'Verificat'],
  ['SA3.2', 'Raport activitate expert', '6h', 'Cu observatii', 'Revizie'],
  ['SA3.5', 'Livrabile suport membri', '4h', 'In analiza', 'PM'],
];

const projectDetails = [
  ['Cod MySMIS', '302141'],
  ['Beneficiar', 'Confederatia Patronala Concordia'],
  ['Valoarea totala', '37.101.208,87 Lei'],
  ['Cofinantare UE', '28.346.990,99 Lei'],
  ['Buget national', '8.754.217,88 Lei'],
  ['Perioada', '60 de luni'],
];

export default function HomePage() {
  return (
    <DashboardShell
      activeHref="/"
      eyebrow="Proiect PEO 302141"
      title="Consolidarea capacitatii Concordia pentru dialog social"
      description="Platforma interna pentru pontaj, livrabile, rapoarte de activitate si verificari de conformitate."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/financiar">Export lunar</Link>
          </Button>
          <Button asChild>
            <Link href="/expert/peo">
              Adauga raport
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </>
      }
      quickTabs={[
        { label: 'Overview', href: '#overview', icon: CheckCircle2, active: true },
        { label: 'Alerte', href: '#alerte', icon: AlertTriangle },
        { label: 'Conformitate', href: '#conformitate', icon: CheckCircle2 },
        { label: 'Export', href: '#export', icon: FileText },
      ]}
      aside={
        <>
          <Card className="border-primary/20 bg-primary text-primary-foreground shadow-sm">
            <CardContent className="p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-lg font-bold">Intra in aplicatie</h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Acces securizat pentru experti, PM si administratori tehnici.
              </p>
              <div id="autentificare" className="mt-5 scroll-mt-28">
                <Suspense fallback={<LoginCardFallback />}>
                  <LoginCard
                    redirectTo="/expert"
                    title="Autentificare"
                    description="Continua in modulul tau operational."
                  />
                </Suspense>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-950">Checklist PM</p>
                  <p className="text-sm text-muted-foreground">5 observatii ramase</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detalii proiect</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {projectDetails.map(([label, value]) => (
                <div key={label} className="rounded-2xl border bg-secondary/40 p-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      }
    >
      <section id="overview" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {moduleCards.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.title} href={module.href} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${module.tone}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <StatusBadge status={module.status === 'In lucru' ? 'in_lucru' : 'conform'}>{module.status}</StatusBadge>
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-950">{module.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.desc}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpiStats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <StatusBadge status={stat.status}>{stat.label}</StatusBadge>
              <p className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/70 px-6 py-5">
            <div>
              <CardTitle className="text-lg font-bold text-slate-950">Situatie raportare lunara</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Privire rapida asupra activitatilor, orelor si verificarilor.
              </p>
            </div>
            <Button asChild variant="outline" className="hidden md:inline-flex">
              <Link href="/pm">Vezi tot</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-secondary/70 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-semibold">SA</th>
                    <th className="px-6 py-4 font-semibold">Activitate</th>
                    <th className="px-6 py-4 font-semibold">Ore</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Responsabil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {monthlyRows.map((row) => (
                    <tr key={row.join('-')} className="hover:bg-secondary/40">
                      <td className="px-6 py-4 font-semibold text-primary">{row[0]}</td>
                      <td className="px-6 py-4 text-slate-700">{row[1]}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{row[2]}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={row[3] === 'Cu observatii' ? 'cu_observatii' : row[3] === 'In analiza' ? 'in_lucru' : 'conform'}>
                          {row[3]}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{row[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card id="conformitate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conformitate lunara</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-slate-950">74%</p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
            </div>
            <div className="mt-5 h-3 rounded-full bg-secondary">
              <div className="h-3 w-[74%] rounded-full bg-emerald-400" />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              18 rapoarte verificate, 6 cu observatii, 3 in curs de completare.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card id="alerte">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Tablou operational
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="alerte" className="gap-5">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="alerte">Alerte & prioritati</TabsTrigger>
              <TabsTrigger value="calendar">Calendar operational</TabsTrigger>
              <TabsTrigger value="experti">Conformitate pe expert</TabsTrigger>
              <TabsTrigger value="documente">Flux documente</TabsTrigger>
              <TabsTrigger value="anexa">Anexa 10 QA</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="alerte" className="grid gap-3 md:grid-cols-3">
              {([
                ['Critic', '2 activitati fara livrabile obligatorii', 'neconform' as const],
                ['Important', '6 rapoarte cu observatii PM', 'cu_observatii' as const],
                ['Informativ', '12 exporturi pregatite pentru luna curenta', 'gata_export' as const],
              ] as const).map(([label, text, status]) => (
                <div key={label} className="rounded-2xl border bg-secondary/40 p-4">
                  <StatusBadge status={status}>{label}</StatusBadge>
                  <p className="mt-3 text-sm font-medium text-foreground">{text}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="calendar" className="grid gap-3 md:grid-cols-4">
              {['Deadline pontaj', 'Revizie PM', 'Corectii experti', 'Export lunar'].map((item, index) => (
                <div key={item} className="rounded-2xl border bg-white p-4">
                  <Clock3 className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">{item}</p>
                  <p className="text-sm text-muted-foreground">{24 + index} mai 2026</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="experti" className="grid gap-3 md:grid-cols-3">
              {['Expert senior politici publice', 'Expert dialog social', 'Expert comunicare'].map((expert, index) => (
                <div key={expert} className="rounded-2xl border bg-white p-4">
                  <Users className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">{expert}</p>
                  <p className="text-sm text-muted-foreground">{index === 1 ? '2 observatii PM' : 'Status conform'}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="documente" className="grid gap-3 md:grid-cols-4">
              {['Incarcat', 'In verificare', 'Cu observatii', 'Aprobat'].map((step, index) => (
                <div key={step} className="rounded-2xl border bg-white p-4">
                  <p className="text-2xl font-bold text-primary">{[18, 9, 6, 12][index]}</p>
                  <p className="mt-1 text-sm font-medium">{step}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="anexa" id="export" className="rounded-2xl border bg-emerald-50 p-4 text-emerald-900">
              <p className="font-semibold">Scor ready for export: 74%</p>
              <p className="mt-2 text-sm leading-6">
                Checklist-ul evidentiaza campuri lipsa, incoerente ore/activitati si titluri de livrabile de corectat.
              </p>
            </TabsContent>

            <TabsContent value="audit" className="rounded-2xl border bg-white p-4">
              <p className="font-semibold">Istoric & audit</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Modificarile de pontaj, livrabile si verificari PM raman urmaribile pe luna si expert.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
