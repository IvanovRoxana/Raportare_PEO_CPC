import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  Filter,
  History,
  KeyRound,
  Lock,
  MoreHorizontal,
  Plus,
  SearchIcon,
  Settings,
  Sparkles,
  ShieldCheck,
  Upload,
  Users,
  UsersRound,
} from 'lucide-react';
import { DashboardShell, adminNavItems } from '@/components/layout/dashboard-shell';
import { DataTable, ProgressBar, RightInfoCard, StatCard } from '@/components/layout/dashboard-primitives';
import { ActivityDescriptionEditor } from '@/components/admin/activity-description-editor';
import { AiApiStatusPanel } from '@/components/admin/ai-api-status-panel';
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import activities from '@/data/import/sample-activities.json';
import activityCatalog from '@/data/import/activity-catalog.json';
import experts from '@/data/import/experts.json';
import reportStatuses from '@/data/import/report-statuses.json';
import workingGroups from '@/data/import/working-groups.json';
import { buildAdminDashboardSnapshot } from '@/lib/admin-module';
import type { ActivityCatalog, Expert } from '@/lib/types';

const snapshot = buildAdminDashboardSnapshot({
  experts: experts as Expert[],
  activities,
  reportStatuses,
  activeReportingMonths: ['Mai 2026'],
  activityCatalogCount: activityCatalog.length,
  workingGroupsCount: workingGroups.length,
});

const fallbackUsers = [
  ['Andrei Dumitrescu', 'andrei.d@concordia.ro', 'Administrator', 'Concordia', 'Activ', '12 mai 2026, 09:42'],
  ['Maria Curea', 'maria.c@concordia.ro', 'Manager', 'Concordia', 'Activ', '12 mai 2026, 08:15'],
  ['Ionuț Radu', 'ionut.r@concordia.ro', 'Expert', 'CPC', 'Activ', '11 mai 2026, 16:33'],
  ['Laura Stoica', 'laura.s@concordia.ro', 'PM', 'Concordia', 'Activ', '11 mai 2026, 11:06'],
  ['Vlad Bălan', 'vlad.b@concordia.ro', 'Expert', 'CPC', 'Inactiv', '7 mai 2026, 14:20'],
  ['Alexandra Antonescu', 'alexandra.a@concordia.ro', 'Utilizator', 'CPC', 'Activ', '12 mai 2026, 10:01'],
] as const;

const users = fallbackUsers.map(([name, email, role, organization, status, lastAccess]) => ({
  name,
  email,
  role,
  organization,
  status,
  lastAccess,
  initials: name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
}));

const roleStatus = {
  Administrator: 'in_lucru',
  Manager: 'verificat',
  Expert: 'draft',
  PM: 'cu_observatii',
  Utilizator: 'informativ',
} as const;

export default function AdminPage() {
  const statCards = [
    {
      label: 'Utilizatori activi',
      value: 128,
      description: '+12 față de luna trecută',
      icon: UsersRound,
      tone: 'blue' as const,
    },
    {
      label: 'Roluri definite',
      value: 6,
      description: 'Nicio modificare recentă',
      icon: ShieldCheck,
      tone: 'navy' as const,
    },
    {
      label: 'Experți activi',
      value: snapshot.activeExperts || 27,
      description: '+3 față de luna trecută',
      icon: Users,
      tone: 'blue' as const,
    },
    {
      label: 'Proiecte active',
      value: 4,
      description: 'PEO și proiecte asociate',
      icon: Building2,
      tone: 'success' as const,
    },
  ];

  return (
    <DashboardShell
      activeHref="/admin"
      navItems={adminNavItems}
      eyebrow="Modul Admin"
      title="Administrare"
      description="Gestionează utilizatori, roluri, experți și catalogul de activități."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/admin/historical-import">
              <Upload className="h-4 w-4" />
              Import utilizatori
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/users">
              Adaugă utilizator
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </>
      }
      aside={
        <>
          <RightInfoCard title="Permisiuni rapide" icon={Lock}>
            <div className="space-y-3">
              {[
                ['Gestionează roluri', UsersRound],
                ['Setări permisiuni', ShieldCheck],
                ['Asignare acces proiecte', KeyRound],
                ['Vizualizare audit', History],
              ].map(([label, Icon]) => (
                <Link
                  key={label as string}
                  href="/admin/users"
                  className="flex items-center justify-between rounded-xl px-1 py-1.5 text-sm font-medium text-slate-600 hover:text-primary"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-primary" />
                    {label as string}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </RightInfoCard>

          <RightInfoCard title="Audit activitate" icon={History}>
            <p className="text-3xl font-bold text-slate-950">246</p>
            <p className="mt-1 text-sm text-muted-foreground">Acțiuni în ultimele 7 zile</p>
            <ProgressBar value={74} className="mt-4" />
            <div className="mt-5 space-y-3 text-sm">
              {[
                ['Creări utilizatori', 18],
                ['Actualizări roluri', 27],
                ['Schimbări permisiuni', 96],
                ['Încărcări / exporturi', 12],
                ['Alte acțiuni', 93],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-[#36c2a0]" />
                    {label as string}
                  </span>
                  <span className="font-semibold text-[#087a63]">{value}</span>
                </div>
              ))}
            </div>
            <Link href="#audit" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi jurnal complet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Sistem / sănătate" icon={Database}>
            <div className="space-y-3 text-sm">
              {['Bază de date', 'Servicii aplicație', 'Stocare fișiere', 'Cozi procesare'].map((item) => (
                <div key={item} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#36c2a0]" />
                    {item}
                  </span>
                  <span className="font-semibold text-[#087a63]">Sănătos</span>
                </div>
              ))}
            </div>
            <Link href="/admin/users" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi detalii sistem
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <ViewAsExpertPanel experts={experts as Expert[]} />
        </>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <Card className="overflow-hidden rounded-[1.5rem] py-0">
        <Tabs defaultValue="utilizatori">
          <div className="border-b border-slate-100 px-6 pt-5">
            <TabsList className="h-auto gap-8 bg-transparent p-0">
              {[
                ['utilizatori', 'Utilizatori', UsersRound],
                ['roluri', 'Roluri', ShieldCheck],
                ['subactivitati', 'Subactivități', Settings],
                ['ai', 'AI API', Sparkles],
                ['proiecte', 'Proiecte', Building2],
              ].map(([value, label, Icon]) => (
                <TabsTrigger
                  key={value as string}
                  value={value as string}
                  className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 text-sm font-semibold text-slate-600 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <CardContent className="p-0">
            <TabsContent value="utilizatori" className="m-0">
              <div className="grid gap-3 border-b border-slate-100 p-6 lg:grid-cols-[1.4fr_0.85fr_0.85fr_auto]">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Caută după nume, email sau organizație..." />
                </div>
                <Select defaultValue="all">
                  <SelectTrigger>
                    <SelectValue placeholder="Toate rolurile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate rolurile</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="pm">PM</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue="all">
                  <SelectTrigger>
                    <SelectValue placeholder="Toate organizațiile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate organizațiile</SelectItem>
                    <SelectItem value="concordia">Concordia</SelectItem>
                    <SelectItem value="cpc">CPC</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <Filter className="h-4 w-4" />
                  Filtrează
                </Button>
              </div>

              <DataTable
                className="rounded-none border-0 shadow-none"
                columns={['Nume', 'Email', 'Rol', 'Organizație', 'Status', 'Ultima accesare', 'Acțiuni']}
                rows={users.map((user, index) => [
                  <div key={`${user.name}-name`} className="flex items-center gap-3 font-semibold text-primary">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf3fb] text-xs">
                      {user.initials}
                    </span>
                    {user.name}
                  </div>,
                  user.email,
                  <StatusBadge key={`${user.name}-role`} status={roleStatus[user.role as keyof typeof roleStatus] ?? 'informativ'}>
                    {user.role}
                  </StatusBadge>,
                  user.organization,
                  <StatusBadge key={`${user.name}-status`} status={user.status === 'Activ' ? 'deschisa' : 'inchisa'}>
                    {user.status}
                  </StatusBadge>,
                  user.lastAccess,
                  <Button key={`${user.name}-action`} variant="ghost" size="icon" aria-label={`Acțiuni ${user.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>,
                ])}
                footer={
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>Afișare 1-6 din 128 utilizatori</span>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3].map((page) => (
                        <Button key={page} variant={page === 1 ? 'default' : 'outline'} size="icon-sm">
                          {page}
                        </Button>
                      ))}
                      <Button variant="outline" size="icon-sm">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                }
              />
            </TabsContent>

            {(['roluri', 'proiecte'] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="m-0 p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    ['Configurare', 'Reguli și valori administrabile fără modificări în cod.'],
                    ['Validare', 'Stări, limite și permisiuni vizibile pentru PM/Admin.'],
                    ['Audit', 'Istoric disponibil pentru controale și verificări interne.'],
                  ].map(([title, description]) => (
                    <div key={title} className="rounded-2xl border bg-slate-50/60 p-5">
                      <p className="font-bold text-slate-950">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}

            <TabsContent value="subactivitati" className="m-0 p-6">
              <ActivityDescriptionEditor fallbackCatalog={activityCatalog as ActivityCatalog[]} />
            </TabsContent>

            <TabsContent value="ai" className="m-0 p-6">
              <AiApiStatusPanel />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </DashboardShell>
  );
}
