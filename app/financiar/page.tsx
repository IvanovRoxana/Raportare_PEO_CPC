import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  WalletCards,
} from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { DataTable, ProgressBar, RightInfoCard, StatCard } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';

const monthlySeries = [
  { month: 'Ian', planned: 22000, eligible: 12000 },
  { month: 'Feb', planned: 62000, eligible: 28000 },
  { month: 'Mar', planned: 118000, eligible: 76000 },
  { month: 'Apr', planned: 168000, eligible: 98000 },
  { month: 'Mai', planned: 112000, eligible: 78000 },
  { month: 'Iun', planned: 90000, eligible: 90000 },
  { month: 'Iul', planned: 98000, eligible: 82000 },
  { month: 'Aug', planned: 122000, eligible: 76000 },
  { month: 'Sep', planned: 164000, eligible: 88000 },
  { month: 'Oct', planned: 206000, eligible: 98000 },
  { month: 'Noi', planned: 218000, eligible: 132000 },
  { month: 'Dec', planned: 182000, eligible: 142000 },
];

const transactions = [
  ['12 mai 2026', 'Plată factură 1245 – Furnizor A', 'Servicii externe', '24.800,00 lei', 'Plătit'],
  ['09 mai 2026', 'Rambursare cheltuieli deplasare', 'Deplasări', '1.250,00 lei', 'În curs'],
  ['06 mai 2026', 'Achiziție echipamente IT', 'Echipamente', '18.900,00 lei', 'Validat'],
  ['02 mai 2026', 'Servicii consultanță - aprilie', 'Servicii externe', '12.000,00 lei', 'În așteptare'],
  ['29 apr. 2026', 'Abonament software lunar', 'Alte cheltuieli', '350,00 lei', 'Plătit'],
] as const;

function BudgetChart() {
  const max = 250000;
  const points = monthlySeries
    .map((item, index) => {
      const x = 35 + index * 64;
      const y = 210 - (item.eligible / max) * 170;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="mt-6 overflow-x-auto">
      <svg viewBox="0 0 760 250" className="h-[250px] min-w-[760px]">
        {[0, 50000, 100000, 150000, 200000, 250000].map((tick) => {
          const y = 210 - (tick / max) * 170;
          return (
            <g key={tick}>
              <line x1="34" x2="735" y1={y} y2={y} stroke="#dce5ef" strokeDasharray="4 5" />
              <text x="0" y={y + 4} fill="#60718d" fontSize="11">
                {tick === 0 ? '0' : `${tick / 1000}.000`}
              </text>
            </g>
          );
        })}
        {monthlySeries.map((item, index) => {
          const x = 25 + index * 64;
          const plannedHeight = (item.planned / max) * 170;
          return (
            <g key={item.month}>
              <rect x={x} y={210 - plannedHeight} width="18" height={plannedHeight} rx="5" fill="#d7ebfa" />
              <text x={x + 3} y="236" fill="#60718d" fontSize="11">
                {item.month}
              </text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke="#36c2a0" strokeWidth="3" />
        {monthlySeries.map((item, index) => {
          const x = 35 + index * 64;
          const y = 210 - (item.eligible / max) * 170;
          return <circle key={item.month} cx={x} cy={y} r="5" fill="#36c2a0" stroke="#ffffff" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
}

export default function FinancialDashboardPage() {
  return (
    <DashboardShell
      activeHref="/financiar"
      navItems={financialNavItems}
      eyebrow="Modul Financiar"
      title="Dashboard financiar"
      description="Monitorizează bugetele, cheltuielile și situația financiară a proiectului."
      actions={
        <>
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
          <Button>
            Adaugă înregistrare
            <Plus className="h-4 w-4" />
          </Button>
        </>
      }
      aside={
        <>
          <RightInfoCard title="Execuție bugetară" icon={BarChart3}>
            <div className="flex items-center justify-between gap-5">
              <div>
                <p className="text-4xl font-bold tracking-tight text-slate-950">67,39%</p>
                <p className="mt-1 text-sm text-muted-foreground">Progres general al execuției</p>
              </div>
              <div className="grid h-20 w-20 place-items-center rounded-full border-[8px] border-[#36c2a0] text-[#087a63]">
                <BarChart3 className="h-7 w-7" />
              </div>
            </div>
            <ProgressBar value={67} className="mt-5" />
            <p className="mt-4 text-sm text-muted-foreground">842.350,45 lei din 1.250.000,00 lei</p>
            <Link href="#tranzactii" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi detalii execuție
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Alerte financiare" icon={AlertTriangle}>
            <div className="space-y-3">
              {[
                ['Plata către Furnizor A depășește termenul scadent', 'Scadență: 15 mai 2026', 'warning'],
                ['Limită categorie „Deplasări” depășită cu 12%', 'Limită: 50.000,00 lei', 'warning'],
                ['Raport financiar lunar pentru aprilie este validat', 'Data validării: 8 mai 2026', 'success'],
              ].map(([title, meta, tone]) => (
                <div key={title} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="flex gap-3">
                    {tone === 'success' ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#36c2a0]" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-[#f5a524]" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-700">{title}</p>
                      <p className="text-xs text-muted-foreground">{meta}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              ))}
            </div>
            <Link href="#alerte" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi toate alertele
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>

          <RightInfoCard title="Documente justificative" icon={FileText}>
            <div className="space-y-4 text-sm">
              {[
                ['În așteptare validare', 4, 'cu_observatii'],
                ['Validat', 18, 'conform'],
                ['Arhivate', 27, 'inchisa'],
              ].map(([label, value, status]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label as string}</span>
                  <StatusBadge status={status as 'cu_observatii' | 'conform' | 'inchisa'}>{value}</StatusBadge>
                </div>
              ))}
            </div>
            <Link href="#documente" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Gestionează documente
              <ArrowRight className="h-4 w-4" />
            </Link>
          </RightInfoCard>
        </>
      }
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={WalletCards} label="Buget total" value="1.250.000,00 lei" description="Valoare totală aprobată" progress={100} tone="blue" />
        <StatCard icon={FileSpreadsheet} label="Cheltuieli eligibile" value="842.350,45 lei" description="67,39% din buget total" progress={67} tone="success" />
        <StatCard icon={CircleDollarSign} label="Plăți efectuate" value="612.780,30 lei" description="48,99% din buget total" progress={49} tone="success" />
        <StatCard icon={WalletCards} label="Sold disponibil" value="407.649,55 lei" description="32,61% din buget total" progress={33} tone="success" />
      </section>

      <Card className="rounded-[1.5rem] py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-6 pt-6">
          <div>
            <CardTitle className="text-xl font-bold text-slate-950">Cheltuieli lunare vs. buget</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">Comparație cheltuieli eligibile cu bugetul planificat</p>
          </div>
          <Select defaultValue="2026">
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">Anul 2026</SelectItem>
              <SelectItem value="2025">Anul 2025</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-8 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-7 border-t-2 border-dashed border-blue-400" />
              Buget planificat (lei)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-7 bg-[#36c2a0]" />
              Cheltuieli eligibile (lei)
            </span>
          </div>
          <BudgetChart />
        </CardContent>
      </Card>

      <section id="tranzactii" className="scroll-mt-24">
        <DataTable
          columns={['Data', 'Descriere', 'Categorie', 'Valoare', 'Status', 'Acțiuni']}
          rows={transactions.map(([date, description, category, value, status]) => [
            date,
            description,
            category,
            <span key={`${description}-value`} className="font-semibold text-slate-900">{value}</span>,
            <StatusBadge
              key={`${description}-status`}
              status={status === 'În așteptare' ? 'cu_observatii' : status === 'În curs' ? 'in_lucru' : 'conform'}
            >
              {status}
            </StatusBadge>,
            <div key={`${description}-actions`} className="flex gap-2">
              <Button variant="outline" size="icon-sm" aria-label={`Vezi ${description}`}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label={`Descarcă ${description}`}>
                <Download className="h-4 w-4" />
              </Button>
            </div>,
          ])}
          footer={
            <Link href="#tranzactii" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Vezi toate tranzacțiile
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </section>
    </DashboardShell>
  );
}
