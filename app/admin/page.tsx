import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  CheckCircle2,
  Database,
  History,
  KeyRound,
  Lock,
  Plus,
  Settings,
  Sparkles,
  ShieldCheck,
  Upload,
  UsersRound,
} from 'lucide-react';
import { DashboardShell, adminNavItems } from '@/components/layout/dashboard-shell';
import { ProgressBar, RightInfoCard } from '@/components/layout/dashboard-primitives';
import { ActivityDescriptionEditor } from '@/components/admin/activity-description-editor';
import { AiApiStatusPanel } from '@/components/admin/ai-api-status-panel';
import { AiContextHealthPanel } from '@/components/admin/ai-context-health-panel';
import { AdminStatCards } from '@/components/admin/admin-stat-cards';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { AdminProjectsPanel } from '@/components/admin/admin-projects-panel';
import { BusinessHubEntityDirectoryPanel } from '@/components/admin/business-hub-entity-directory-panel';
import { PeoExpertCategoriesPanel } from '@/components/admin/peo-expert-categories-panel';
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import activityCatalog from '@/data/import/activity-catalog.json';
import type { ActivityCatalog } from '@/lib/types';

const adminTabValues = ['utilizatori', 'categorii-experti', 'roluri', 'subactivitati', 'business-hub', 'ai', 'proiecte'] as const;

type AdminTabValue = (typeof adminTabValues)[number];

function resolveAdminTab(tab?: string | string[]): AdminTabValue {
  const value = Array.isArray(tab) ? tab[0] : tab;
  return adminTabValues.includes(value as AdminTabValue) ? (value as AdminTabValue) : 'utilizatori';
}

const initialAdminStats = {
  activeUsers: 0,
  rolesDefined: 0,
  activeExperts: 0,
  activeProjects: 0,
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const selectedTab = resolveAdminTab((await searchParams)?.tab);

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

          <ViewAsExpertPanel />
        </>
      }
    >
      <AdminStatCards initialStats={initialAdminStats} />

      <Card className="overflow-hidden rounded-[1.5rem] py-0">
        <Tabs defaultValue={selectedTab}>
          <div className="border-b border-slate-100 px-6 pt-5">
            <TabsList className="h-auto gap-8 bg-transparent p-0">
              {[
                ['utilizatori', 'Utilizatori', UsersRound],
                ['categorii-experti', 'Categorii experti PEO', BriefcaseBusiness],
                ['roluri', 'Roluri', ShieldCheck],
                ['subactivitati', 'Subactivități', Settings],
                ['business-hub', 'Business Hub', Building2],
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
              <AdminUsersTable />
            </TabsContent>

            <TabsContent value="categorii-experti" className="m-0 p-6">
              <PeoExpertCategoriesPanel />
            </TabsContent>

            {(['roluri'] as const).map((tab) => (
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

            <TabsContent value="proiecte" className="m-0 p-6">
              <AdminProjectsPanel />
            </TabsContent>

            <TabsContent value="subactivitati" className="m-0 p-6">
              <ActivityDescriptionEditor fallbackCatalog={activityCatalog as ActivityCatalog[]} />
            </TabsContent>

            <TabsContent value="business-hub" className="m-0 p-6">
              <BusinessHubEntityDirectoryPanel />
            </TabsContent>

            <TabsContent value="ai" className="m-0 p-6">
              <div className="space-y-6">
                <AiApiStatusPanel />
                <AiContextHealthPanel />
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </DashboardShell>
  );
}
