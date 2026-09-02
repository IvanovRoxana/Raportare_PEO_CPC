'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Download,
  FileText,
  Users,
} from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useActivitiesByMonth,
  useAllConcurrentProjects,
  useAllExpertNormContracts,
  useConcurrentProjectTimesheetByMonth,
  useExperts,
  useLeaveEntries,
} from '@/hooks/use-backend-data';
import { getMonthName } from '@/lib/app-utils';
import { buildFinancialReportingSummary } from '@/lib/financial-reporting';

export default function FinancialDashboardPage() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const [isExportingCentralizer, setIsExportingCentralizer] = useState(false);

  const { experts, isLoading: expertsLoading } = useExperts();
  const { activities: monthActivities, isLoading: activitiesLoading } = useActivitiesByMonth(currentMonth, currentYear);
  const { projects: allConcurrentProjects, isLoading: concurrentProjectsLoading } = useAllConcurrentProjects();
  const { entries: concurrentTimesheetEntries, isLoading: concurrentEntriesLoading } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const { contracts: normContracts, isLoading: normContractsLoading } = useAllExpertNormContracts();
  const { leaveEntries, isLoading: leaveEntriesLoading } = useLeaveEntries(currentMonth, currentYear);

  const financialSummary = useMemo(() => buildFinancialReportingSummary({
    experts,
    activities: monthActivities,
    concurrentProjects: allConcurrentProjects,
    concurrentEntries: concurrentTimesheetEntries,
    normContracts,
    leaveEntries,
    month: currentMonth,
    year: currentYear,
  }), [allConcurrentProjects, concurrentTimesheetEntries, currentMonth, currentYear, experts, leaveEntries, monthActivities, normContracts]);
  const exportIsLoading =
    expertsLoading ||
    activitiesLoading ||
    concurrentProjectsLoading ||
    concurrentEntriesLoading ||
    normContractsLoading ||
    leaveEntriesLoading;

  const handleExportCentralizer = async () => {
    if (exportIsLoading || isExportingCentralizer || financialSummary.rows.length === 0) return;

    setIsExportingCentralizer(true);
    try {
      const response = await fetch('/api/export/financial-timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: currentMonth,
          year: currentYear,
          mode: 'timesheets',
          rows: financialSummary.rows,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('Content-Type') || '';
        const message = contentType.includes('application/json')
          ? ((await response.json().catch(() => ({}))) as { error?: string }).error
          : await response.text().catch(() => '');
        throw new Error(message || `Exportul centralizatorului a esuat. Status HTTP: ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename =
        getFilenameFromDisposition(disposition) ||
        `Pontaje_centralizat_${currentYear}-${String(currentMonth + 1).padStart(2, '0')}.xlsx`;
      triggerDownload(blob, filename);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Exportul centralizatorului a esuat.');
    } finally {
      setIsExportingCentralizer(false);
    }
  };

  return (
    <DashboardShell
      activeHref="/financiar"
      navItems={financialNavItems}
      eyebrow="Modul Financiar"
      title="Dashboard financiar"
      description="Monitorizează bugetele, cheltuielile și situația financiară a proiectului."
      actions={
        <Button variant="outline" onClick={handleExportCentralizer} disabled={exportIsLoading || isExportingCentralizer || financialSummary.rows.length === 0}>
          <Download className="h-4 w-4" />
          {isExportingCentralizer ? 'Se exporta' : `Export centralizator ${getMonthName(currentMonth)} ${currentYear}`}
        </Button>
      }
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-[1.5rem]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              Pontaje
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              Centralizatorul cu cele 12 coloane din Excel, buline de conflict la hover si export TEST.
            </p>
            <Button asChild>
              <Link href="/financiar/pontaje">
                Deschide Pontaje
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Concedii
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              CO automat, CO manual cu justificare si validare/respingere, separat de gestiunea HR.
            </p>
            <Button asChild>
              <Link href="/financiar/concedii">
                Deschide Concedii
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Salariati si validare HR
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              Verifica profilurile reale din aplicatie fata de tabelul Excel HR: pozitii, functii si norme.
            </p>
            <Button asChild>
              <Link href="/financiar/salariati">
                Deschide Salariati
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </DashboardShell>
  );
}

function getFilenameFromDisposition(disposition: string) {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
