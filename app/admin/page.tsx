import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  DatabaseBackup,
  FileSpreadsheet,
  FileText,
  Gauge,
  History,
  Lock,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { adminMenuItems, buildAdminDashboardSnapshot, protectedAdminBoundaries, ruleSeverityLevels } from '@/lib/admin-module';
import activities from '@/data/import/sample-activities.json';
import activityCatalog from '@/data/import/activity-catalog.json';
import experts from '@/data/import/experts.json';
import reportStatuses from '@/data/import/report-statuses.json';
import workingGroups from '@/data/import/working-groups.json';
import type { Expert } from '@/lib/types';

const menuIcons = [
  Gauge,
  UsersRound,
  ShieldCheck,
  FileText,
  ClipboardCheck,
  FileSpreadsheet,
  CalendarClock,
  SlidersHorizontal,
  Archive,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Bot,
  DatabaseBackup,
  History,
  Settings2,
];

const snapshot = buildAdminDashboardSnapshot({
  experts: experts as Expert[],
  activities,
  reportStatuses,
  activeReportingMonths: ['Mai 2026'],
  activityCatalogCount: activityCatalog.length,
  workingGroupsCount: workingGroups.length,
});

const dashboardStats = [
  { label: 'Experti in proiect', value: snapshot.totalExperts, hint: `${snapshot.activeExperts} activi` },
  { label: 'Au raportat in seed', value: snapshot.reportedExperts, hint: 'activitati importate' },
  { label: 'Pontaje detectate', value: snapshot.completeTimesheets, hint: 'cu ore inregistrate' },
  { label: 'Activitati incomplete', value: snapshot.incompleteActivities, hint: 'draft sau fara SA' },
  { label: 'Livrabile lipsa', value: snapshot.missingDeliverables, hint: 'de verificat la PM' },
  { label: 'Rapoarte draft', value: snapshot.draftReports, hint: 'netrimise inca' },
  { label: 'Trimise catre PM', value: snapshot.sentReports, hint: 'in verificare' },
  { label: 'Validate', value: snapshot.validatedReports, hint: 'conforme' },
];

const adminCoreModules = [
  {
    title: 'Utilizatori si roluri',
    description: 'Administrare utilizatori, roluri si permisiuni pe module (expert, PM, financiar, audit).',
    controls: ['Invitare utilizator', 'Atribuire rol', 'Dezactivare cont'],
    href: '/admin/users',
  },
  {
    title: 'Experti',
    description: 'Profiluri experti, date contractuale, stari active/inactive si eligibilitate pe proiect.',
    controls: ['Date expert', 'Status colaborare', 'Validare eligibilitate'],
  },
  {
    title: 'Proiecte',
    description: 'Configurare proiecte, luni active, reguli de raportare si echipele aferente fiecarui proiect.',
    controls: ['Calendar raportare', 'Echipa proiect', 'Reguli proiect'],
  },
  {
    title: 'Subactivitati',
    description: 'Gestionarea subactivitatilor pentru fiecare activitate principala si conditii de raportare.',
    controls: ['Mapare activitate-SA', 'Conditii ore', 'Reguli validare'],
  },
  {
    title: 'Catalog activitati',
    description: 'Catalog central pentru activitati, coduri, tipuri de livrabile si clasificari operationale.',
    controls: ['Adaugare activitate', 'Coduri si etichete', 'Arhivare activitate'],
  },
  {
    title: 'Import istoric raportare',
    description: 'Incarcare dosare lunare istorice: PDF raport, Excel pontaj, metadate si sursa auditabila.',
    controls: ['PDF Anexa 10', 'Pontaj Excel', 'Istoric PM'],
    href: '/admin/historical-import',
  },
] as const;

const phaseDescriptions = {
  'Etapa 1': 'Admin minim viabil: elimina modificarile in cod pentru configurarile de baza.',
  'Etapa 2': 'Admin operational complet: verificare, exporturi, audit, import si arhivare.',
  'Etapa 3': 'Admin avansat: AI governance, reguli complexe, template builder si multi-proiect.',
} as const;

export default function AdminPage() {
  return (
    <DashboardShell
      activeHref="/admin"
      eyebrow="Modul admin · PEO 302141"
      title="Control operational fara modificari in cod"
      description="Adminul gestioneaza continutul, regulile si fluxurile: utilizatori, experti, proiecte, subactivitati, luni de raportare, statusuri, livrabile, exporturi, notificari, template-uri si guvernanta AI."
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/">Inapoi la aplicatie</Link>
          </Button>
          <Button asChild>
            <a href="#nucleu-dashboard-admin">Nucleu Admin</a>
          </Button>
        </>
      }
      quickTabs={[
        { label: 'Dashboard', href: '#dashboard-admin', icon: Gauge, active: true },
        { label: 'Prioritizare', href: '#prioritizare', icon: ClipboardCheck },
        { label: 'Control & audit', href: '#granite', icon: Lock },
        { label: 'Utilizatori', href: '/admin/users', icon: UsersRound },
        { label: 'Import istoric', href: '/admin/historical-import', icon: Archive },
      ]}
    >
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Regula de aur</p>
          <p className="mt-2 text-lg leading-8 text-foreground">
            Orice lista, regula, status, text, subactivitate, tip de livrabil, template sau limita
            care se poate schimba in timp trebuie stocata configurabil si administrata din modulul
            de admin, nu scrisa fix in cod.
          </p>
        </CardContent>
      </Card>

      <section id="dashboard-admin" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Gauge className="h-5 w-5 text-primary" />
                Dashboard admin
              </CardTitle>
              <CardDescription>
                Panou de avertizare pentru luna curenta si pentru datele de referinta existente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {dashboardStats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border bg-secondary/35 p-4">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border bg-background p-4">
                  <p className="font-medium text-foreground">Luni de raportare active</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {snapshot.activeReportingMonths.map((month) => (
                      <Badge key={month} variant="secondary">
                        {month}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Luna mai 2026 este deschisa pentru completare pana la deadline-ul stabilit de admin,
                    apoi intra in verificare PM.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Alerte de configurare
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-6">
                    {snapshot.configurationErrors.length > 0 ? (
                      snapshot.configurationErrors.slice(0, 4).map((error) => <li key={error}>• {error}</li>)
                    ) : (
                      <li>• Nu exista erori de configurare in datele importate.</li>
                    )}
                    <li>• Catalog activitati: {snapshot.referenceData.activityCatalogCount} intrari configurabile.</li>
                    <li>• Grupuri de lucru: {snapshot.referenceData.workingGroupsCount} intrari.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="nucleu-dashboard-admin" className="scroll-mt-24">
            <CardHeader>
              <CardTitle className="text-xl">Nucleu Dashboard Admin</CardTitle>
              <CardDescription>
                Zonele cerute pentru administrarea operationala: utilizatori, experti, proiecte, subactivitati si catalog.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {adminCoreModules.map((module) => {
                  const moduleContent = (
                    <>
                      <h2 className="font-semibold text-foreground">{module.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {module.controls.map((control) => (
                          <Badge key={control} variant="secondary" className="font-normal">
                            {control}
                          </Badge>
                        ))}
                      </div>
                    </>
                  );

                  return 'href' in module && module.href ? (
                    <Link
                      key={module.title}
                      href={module.href}
                      className="block rounded-2xl border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {moduleContent}
                    </Link>
                  ) : (
                    <article key={module.title} className="rounded-2xl border bg-background p-4">
                      {moduleContent}
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Meniu admin propus</CardTitle>
              <CardDescription>
                Structura separa adminul minim viabil de functiile operationale si avansate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {adminMenuItems.map((item, index) => {
                  const Icon = menuIcons[index] ?? Settings2;
                  const menuContent = (
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-foreground">
                            {index + 1}. {item.title}
                          </h2>
                          <Badge variant="outline">{item.phase}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.controls.slice(0, 4).map((control) => (
                            <Badge key={control} variant="secondary" className="font-normal">
                              {control}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  );

                  return item.href ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="block rounded-2xl border bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {menuContent}
                    </Link>
                  ) : (
                    <article key={item.id} className="rounded-2xl border bg-background p-4">
                      {menuContent}
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <ViewAsExpertPanel experts={experts as Expert[]} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Severitate reguli
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ruleSeverityLevels.map((rule) => (
                <div key={rule.level} className="rounded-2xl border bg-background p-3">
                  <p className="font-medium text-foreground">{rule.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{rule.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="granite" className="border-destructive/30 scroll-mt-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-destructive" />
                Zone protejate
              </CardTitle>
              <CardDescription>Adminul operational nu trebuie sa poata strica infrastructura.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                {protectedAdminBoundaries.map((boundary) => (
                  <li key={boundary}>• {boundary}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </section>

      <section id="prioritizare" className="scroll-mt-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Prioritizare build</CardTitle>
            <CardDescription>
              Recomandarea este sa livram intai administrarea de baza, apoi operationalizarea completa si functiile avansate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-3">
              {Object.entries(phaseDescriptions).map(([phase, description]) => (
                <div key={phase} className="rounded-2xl border bg-background p-5">
                  <Badge>{phase}</Badge>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                  <Separator className="my-4" />
                  <ul className="space-y-2 text-sm text-foreground">
                    {adminMenuItems
                      .filter((item) => item.phase === phase)
                      .slice(0, 6)
                      .map((item) => (
                        <li key={item.id}>• {item.title}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </DashboardShell>
  );
}
