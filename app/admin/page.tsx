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
import { ViewAsExpertPanel } from '@/components/admin/view-as-expert-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { adminMenuItems, adminRoles, buildAdminDashboardSnapshot, protectedAdminBoundaries, ruleSeverityLevels } from '@/lib/admin-module';
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
  activities: activities,
  reportStatuses: reportStatuses,
  activeReportingMonths: ['Mai 2026'],
  activityCatalogCount: activityCatalog.length,
  workingGroupsCount: workingGroups.length,
});

const dashboardStats = [
  { label: 'Experți în proiect', value: snapshot.totalExperts, hint: `${snapshot.activeExperts} activi` },
  { label: 'Au raportat în seed', value: snapshot.reportedExperts, hint: 'activități importate' },
  { label: 'Pontaje detectate', value: snapshot.completeTimesheets, hint: 'cu ore înregistrate' },
  { label: 'Activități incomplete', value: snapshot.incompleteActivities, hint: 'draft sau fără SA' },
  { label: 'Livrabile lipsă', value: snapshot.missingDeliverables, hint: 'de verificat la PM' },
  { label: 'Rapoarte draft', value: snapshot.draftReports, hint: 'netrimise încă' },
  { label: 'Trimise către PM', value: snapshot.sentReports, hint: 'în verificare' },
  { label: 'Validate', value: snapshot.validatedReports, hint: 'conforme' },
];


const adminCoreModules = [
  {
    title: 'Utilizatori și roluri',
    description: 'Administrare utilizatori, roluri și permisiuni pe module (expert, PM, financiar, audit).',
    controls: ['Invitare utilizator', 'Atribuire rol', 'Dezactivare cont'],
  },
  {
    title: 'Experți',
    description: 'Profiluri experți, date contractuale, stări active/inactive și eligibilitate pe proiect.',
    controls: ['Date expert', 'Status colaborare', 'Validare eligibilitate'],
  },
  {
    title: 'Proiecte',
    description: 'Configurare proiecte, luni active, reguli de raportare și echipele aferente fiecărui proiect.',
    controls: ['Calendar raportare', 'Echipă proiect', 'Reguli proiect'],
  },
  {
    title: 'Subactivități',
    description: 'Gestionarea subactivităților pentru fiecare activitate principală și condiții de raportare.',
    controls: ['Mapare activitate-SA', 'Condiții ore', 'Reguli validare'],
  },
  {
    title: 'Catalog activități',
    description: 'Catalog central pentru activități, coduri, tipuri de livrabile și clasificări operaționale.',
    controls: ['Adăugare activitate', 'Coduri și etichete', 'Arhivare activitate'],
  },
] as const;

const phaseDescriptions = {
  'Etapa 1': 'Admin minim viabil: elimină modificările în cod pentru configurările de bază.',
  'Etapa 2': 'Admin operațional complet: verificare, exporturi, audit, import și arhivare.',
  'Etapa 3': 'Admin avansat: AI governance, reguli complexe, template builder și multi-proiect.',
} as const;

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <section className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge className="mb-4 w-fit rounded-md bg-primary/10 text-primary hover:bg-primary/10">
                Modul admin · PEO 302141
              </Badge>
              <h1 className="max-w-4xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Control operațional fără modificări în cod
              </h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
                Adminul gestionează conținutul, regulile și fluxurile: utilizatori, experți,
                proiecte, subactivități, luni de raportare, statusuri, livrabile, exporturi,
                notificări, template-uri și guvernanță AI. Codul rămâne mecanismul, iar
                configurațiile devin date administrabile și auditate.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/">Înapoi la aplicație</Link>
              </Button>
              <Button asChild>
                <a href="#prioritizare">Vezi etapele</a>
              </Button>
            </div>
          </div>

          <Card className="rounded-lg border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm font-medium uppercase tracking-wide text-primary">Regula de aur</p>
              <p className="mt-2 text-lg leading-8 text-foreground">
                Orice listă, regulă, status, text, subactivitate, tip de livrabil, template sau
                limită care se poate schimba în timp trebuie stocată configurabil și administrată
                din modulul de admin, nu scrisă fix în cod.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="space-y-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Gauge className="h-5 w-5 text-primary" />
                Dashboard admin
              </CardTitle>
              <CardDescription>
                Panou de avertizare pentru luna curentă și pentru datele de referință existente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {dashboardStats.map((stat) => (
                  <div key={stat.label} className="rounded-lg border bg-background p-4">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-foreground">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border bg-background p-4">
                  <p className="font-medium text-foreground">Luni de raportare active</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {snapshot.activeReportingMonths.map((month) => (
                      <Badge key={month} variant="secondary">{month}</Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Exemplu operațional: luna mai 2026 este deschisă pentru completare până la
                    deadline-ul stabilit de admin, apoi intră în verificare PM.
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Alerte de configurare
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-6">
                    {snapshot.configurationErrors.length > 0 ? (
                      snapshot.configurationErrors.slice(0, 4).map((error) => <li key={error}>• {error}</li>)
                    ) : (
                      <li>• Nu există erori de configurare în datele importate.</li>
                    )}
                    <li>• Catalog activități: {snapshot.referenceData.activityCatalogCount} intrări configurabile.</li>
                    <li>• Grupuri de lucru: {snapshot.referenceData.workingGroupsCount} intrări.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>


          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-xl">Nucleu Dashboard Admin</CardTitle>
              <CardDescription>
                Zonele cerute pentru administrarea operațională: utilizatori, experți, proiecte, subactivități și catalog.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {adminCoreModules.map((module) => (
                  <article key={module.title} className="rounded-lg border bg-background p-4">
                    <h2 className="font-semibold text-foreground">{module.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {module.controls.map((control) => (
                        <Badge key={control} variant="secondary" className="font-normal">{control}</Badge>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-xl">Meniu admin propus</CardTitle>
              <CardDescription>
                Structura separă adminul minim viabil de funcțiile operaționale și avansate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {adminMenuItems.map((item, index) => {
                  const Icon = menuIcons[index] ?? Settings2;
                  return (
                    <article key={item.id} className="rounded-lg border bg-background p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-primary/10 p-2 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-foreground">{index + 1}. {item.title}</h2>
                            <Badge variant="outline">{item.phase}</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.controls.slice(0, 4).map((control) => (
                              <Badge key={control} variant="secondary" className="font-normal">{control}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <ViewAsExpertPanel experts={experts as Expert[]} />

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Roluri minime
              </CardTitle>
              <CardDescription>Arhitectura permite mai mult decât expert / PM / admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminRoles.map((role) => (
                <div key={role.role} className="rounded-md border bg-background p-3">
                  <p className="font-medium text-foreground">{role.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{role.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Severitate reguli
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ruleSeverityLevels.map((rule) => (
                <div key={rule.level} className="rounded-md border bg-background p-3">
                  <p className="font-medium text-foreground">{rule.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{rule.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-destructive" />
                Zone protejate
              </CardTitle>
              <CardDescription>Adminul operațional nu trebuie să poată strica infrastructura.</CardDescription>
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

      <section id="prioritizare" className="mx-auto max-w-screen-2xl px-4 pb-10 sm:px-6 lg:px-8">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-xl">Prioritizare build</CardTitle>
            <CardDescription>
              Recomandarea este să livrăm întâi administrarea de bază, apoi operaționalizarea completă și funcțiile avansate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-3">
              {Object.entries(phaseDescriptions).map(([phase, description]) => (
                <div key={phase} className="rounded-lg border bg-background p-5">
                  <Badge>{phase}</Badge>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                  <Separator className="my-4" />
                  <ul className="space-y-2 text-sm text-foreground">
                    {adminMenuItems
                      .filter((item) => item.phase === phase)
                      .slice(0, 6)
                      .map((item) => <li key={item.id}>• {item.title}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
