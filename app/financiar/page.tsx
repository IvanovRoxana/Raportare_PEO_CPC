import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  Cloud,
  Database,
  FileSpreadsheet,
  FileText,
  GitBranch,
  GraduationCap,
  HardDrive,
  LineChart,
  LockKeyhole,
  PieChart,
  Plug,
  Server,
  ShieldCheck,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type FundingSource = {
  label: string;
  amount: number;
  share: number;
  className: string;
};

type ApplicationCost = {
  name: string;
  provider: string;
  area: string;
  status: 'Activ' | 'Pregatit' | 'Partial' | 'Optional';
  monthlyEstimate: string;
  costModel: string;
  usage: string;
  nextStep: string;
  icon: LucideIcon;
  iconClassName: string;
};

type IntegrationStep = {
  title: string;
  owner: string;
  financialImpact: string;
  status: string;
  icon: LucideIcon;
};

const projectBudget = {
  total: 37101208.87,
  eu: 28346990.99,
  national: 8754217.88,
};

const fundingSources: FundingSource[] = [
  {
    label: 'Cofinantare UE',
    amount: projectBudget.eu,
    share: 76.4,
    className: 'bg-primary',
  },
  {
    label: 'Buget national',
    amount: projectBudget.national,
    share: 23.6,
    className: 'bg-teal-500',
  },
];

const applications: ApplicationCost[] = [
  {
    name: 'Aplicatia Raportare PEO',
    provider: 'Next.js, React, Tailwind',
    area: 'Front-end operational',
    status: 'Activ',
    monthlyEstimate: 'Efort intern',
    costModel: 'Dezvoltare si mentenanta',
    usage: 'Dashboard expert, dashboard PM, pontaj, rapoarte, livrabile',
    nextStep: 'Stabilizare fluxuri critice si validari de date',
    icon: Server,
    iconClassName: 'bg-blue-50 text-blue-700',
  },
  {
    name: 'AWS Amplify Hosting',
    provider: 'Amazon Web Services',
    area: 'Hosting aplicatie',
    status: 'Activ',
    monthlyEstimate: '80-250 lei',
    costModel: 'Build, trafic si stocare deployment',
    usage: 'Frontend public pe branch main, deploy static verificat',
    nextStep: 'Monitorizare cost build si decizie static vs SSR',
    icon: Cloud,
    iconClassName: 'bg-sky-50 text-sky-700',
  },
  {
    name: 'Amazon Cognito',
    provider: 'Amazon Web Services',
    area: 'Autentificare',
    status: 'Activ',
    monthlyEstimate: '0-100 lei',
    costModel: 'Cost in functie de utilizatori activi',
    usage: 'Login email, grupuri expert, pm si admin',
    nextStep: 'Testare resetare parola si utilizatori importati',
    icon: LockKeyhole,
    iconClassName: 'bg-indigo-50 text-indigo-700',
  },
  {
    name: 'AppSync + DynamoDB',
    provider: 'Amazon Web Services',
    area: 'Date aplicatie',
    status: 'Activ',
    monthlyEstimate: '80-300 lei',
    costModel: 'Request-uri API si citiri/scrieri DynamoDB',
    usage: 'Experti, activitati, verificari, status rapoarte, audit',
    nextStep: 'Seed initial pentru catalog activitati si grupuri de lucru',
    icon: Database,
    iconClassName: 'bg-teal-50 text-teal-700',
  },
  {
    name: 'Amazon S3 Storage',
    provider: 'Amazon Web Services',
    area: 'Documente',
    status: 'Pregatit',
    monthlyEstimate: '20-100 lei',
    costModel: 'Spatiu, trafic si lifecycle pentru fisiere',
    usage: 'Bucket pregatit pentru livrabile, rapoarte si justificative',
    nextStep: 'Mutare upload livrabile din baza de date catre S3',
    icon: HardDrive,
    iconClassName: 'bg-emerald-50 text-emerald-700',
  },
  {
    name: 'Rute AI / OpenAI',
    provider: 'OpenAI API prin server',
    area: 'Asistenta raportare',
    status: 'Partial',
    monthlyEstimate: '150-500 lei',
    costModel: 'Consum tokeni si compute server-side',
    usage: 'Verificare titluri, date, livrabile si generare raport',
    nextStep: 'Mutare pe SSR/compute sau Lambda cu secrete server-side',
    icon: Brain,
    iconClassName: 'bg-violet-50 text-violet-700',
  },
  {
    name: 'Moodle / Concordia Learning Hub',
    provider: 'Moodle local plugin + SCORM',
    area: 'Invatare si cursuri',
    status: 'Pregatit',
    monthlyEstimate: 'Depinde de hosting',
    costModel: 'Gazduire Moodle si mentenanta plugin',
    usage: 'Plugin local, raport curs si pachet SCORM in workspace',
    nextStep: 'Conectare rapoarte curs cu profilurile proiectului',
    icon: GraduationCap,
    iconClassName: 'bg-amber-50 text-amber-700',
  },
  {
    name: 'GitHub / GitHub Desktop',
    provider: 'GitHub',
    area: 'Versionare',
    status: 'Activ',
    monthlyEstimate: '0 lei / cont existent',
    costModel: 'Repository, istoric si colaborare',
    usage: 'Baza initiala Next.js si flux de publicare cod',
    nextStep: 'Branching controlat pentru schimbari de productie',
    icon: GitBranch,
    iconClassName: 'bg-slate-50 text-slate-700',
  },
  {
    name: 'Export documente si tabele',
    provider: 'docx, xlsx, pdfjs, mammoth',
    area: 'Raportare financiara',
    status: 'Activ',
    monthlyEstimate: '0 lei licente',
    costModel: 'Biblioteci incluse in aplicatie',
    usage: 'Generare rapoarte, OPIS, exporturi si citire documente',
    nextStep: 'Export sumar financiar lunar pentru PM/admin',
    icon: FileSpreadsheet,
    iconClassName: 'bg-orange-50 text-orange-700',
  },
  {
    name: 'Vercel Analytics',
    provider: 'Vercel',
    area: 'Analitice',
    status: 'Optional',
    monthlyEstimate: 'Optional',
    costModel: 'Activ doar daca ramane necesar in productie',
    usage: 'Dependinta existenta, randata doar in productie',
    nextStep: 'Decizie daca pastram analytics separat de AWS',
    icon: LineChart,
    iconClassName: 'bg-cyan-50 text-cyan-700',
  },
];

const integrationSteps: IntegrationStep[] = [
  {
    title: 'Upload livrabile in S3',
    owner: 'PM + dezvoltare',
    financialImpact: 'Reduce presiunea pe baza de date si separa costul documentelor',
    status: 'Urmatorul sprint',
    icon: HardDrive,
  },
  {
    title: 'AI in Lambda sau SSR compute',
    owner: 'Dezvoltare',
    financialImpact: 'Permite control pe consum tokeni si pastreaza cheile in server',
    status: 'Necesita decizie hosting',
    icon: Zap,
  },
  {
    title: 'Seed catalog si grupuri de lucru',
    owner: 'PM',
    financialImpact: 'Scade timpul manual de operare si erorile de raportare',
    status: 'Pregatit pentru import',
    icon: CheckCircle2,
  },
  {
    title: 'Moodle raportare curs',
    owner: 'Learning Hub',
    financialImpact: 'Leaga participarea la cursuri de activitatile proiectului',
    status: 'Integrare urmatoare',
    icon: Plug,
  },
  {
    title: 'AWS Budgets + tag-uri cost',
    owner: 'Admin financiar',
    financialImpact: 'Alerta lunara inainte de depasirea pragurilor aprobate',
    status: 'Propus',
    icon: ShieldCheck,
  },
];

const costMix = [
  { label: 'Infrastructura AWS', value: 38, className: 'bg-primary' },
  { label: 'Date si API', value: 24, className: 'bg-teal-500' },
  { label: 'AI si automatizari', value: 20, className: 'bg-violet-500' },
  { label: 'Documente si stocare', value: 12, className: 'bg-amber-500' },
  { label: 'Analitice optionale', value: 6, className: 'bg-orange-500' },
];

const statusTone: Record<ApplicationCost['status'], string> = {
  Activ: 'border-teal-200 bg-teal-50 text-teal-800',
  Pregatit: 'border-blue-200 bg-blue-50 text-blue-800',
  Partial: 'border-amber-200 bg-amber-50 text-amber-800',
  Optional: 'border-slate-200 bg-slate-50 text-slate-700',
};

const formatLei = new Intl.NumberFormat('ro-RO', {
  style: 'currency',
  currency: 'RON',
  maximumFractionDigits: 0,
});

export default function FinancialDashboardPage() {
  const activeApps = applications.filter((application) => application.status === 'Activ').length;
  const plannedApps = applications.filter((application) => application.status !== 'Activ').length;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-primary">Dashboard financiar</p>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Aplicatii folosite si integrari urmatoare
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Vedere de control pentru ecosistemul tehnic al proiectului PEO 302141, cu impact
              financiar estimativ si pasi de integrare.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Acasa
              </Link>
            </Button>
            <Button asChild>
              <Link href="/pm">
                Dashboard PM
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <WalletCards className="h-4 w-4 text-primary" />
                Valoare proiect
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatLei.format(projectBudget.total)}</div>
              <p className="mt-1 text-xs text-muted-foreground">Buget total PEO 302141</p>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CircleDollarSign className="h-4 w-4 text-primary" />
                Aplicatii active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeApps}</div>
              <p className="mt-1 text-xs text-muted-foreground">{plannedApps} pregatite, partiale sau optionale</p>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Banknote className="h-4 w-4 text-primary" />
                Cofinantare UE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fundingSources[0].share}%</div>
              <p className="mt-1 text-xs text-muted-foreground">{formatLei.format(projectBudget.eu)}</p>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <BadgeDollarSign className="h-4 w-4 text-primary" />
                Buget national
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fundingSources[1].share}%</div>
              <p className="mt-1 text-xs text-muted-foreground">{formatLei.format(projectBudget.national)}</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PieChart className="h-5 w-5 text-primary" />
                Structura finantarii
              </CardTitle>
              <CardDescription>
                Valori preluate din datele proiectului. Costurile aplicatiilor sunt estimari de planificare.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-4 overflow-hidden rounded-md bg-muted">
                <div className="flex h-full w-full">
                  {fundingSources.map((source) => (
                    <div
                      key={source.label}
                      className={source.className}
                      style={{ width: `${source.share}%` }}
                      title={`${source.label}: ${source.share}%`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {fundingSources.map((source) => (
                  <div key={source.label} className="rounded-md border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{source.label}</span>
                      <Badge variant="outline">{source.share}%</Badge>
                    </div>
                    <p className="mt-2 text-lg font-semibold">{formatLei.format(source.amount)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <BarChart3 className="h-5 w-5 text-primary" />
                Mix estimativ costuri tehnice
              </CardTitle>
              <CardDescription>Orientare interna pentru prioritizarea cheltuielilor lunare.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {costMix.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">{item.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${item.className}`} style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          {integrationSteps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="rounded-lg">
                <CardHeader className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{step.title}</CardTitle>
                    <CardDescription>{step.owner}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant="outline" className="rounded-md">
                    {step.status}
                  </Badge>
                  <p className="text-sm leading-6 text-muted-foreground">{step.financialImpact}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-5 w-5 text-primary" />
              Aplicatii si platforme folosite
            </CardTitle>
            <CardDescription>
              Inventar financiar pentru instrumentele deja folosite in proiect si pentru cele pregatite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aplicatie</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Estimare lunara</TableHead>
                  <TableHead>Model cost</TableHead>
                  <TableHead>Urmatorul pas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => {
                  const Icon = application.icon;
                  return (
                    <TableRow key={application.name}>
                      <TableCell className="min-w-64">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${application.iconClassName}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{application.name}</div>
                            <div className="text-xs text-muted-foreground">{application.provider}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{application.area}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`rounded-md ${statusTone[application.status]}`}>
                          {application.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{application.monthlyEstimate}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal text-muted-foreground">
                        {application.costModel}
                        <div className="mt-1 text-xs">{application.usage}</div>
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal">{application.nextStep}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
