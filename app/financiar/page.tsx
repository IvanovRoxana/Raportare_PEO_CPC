'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
} from 'lucide-react';
import { DashboardShell, financialNavItems } from '@/components/layout/dashboard-shell';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useActivitiesByMonth,
  useAllConcurrentProjects,
  useAllExpertNormContracts,
  useConcurrentProjectTimesheetByMonth,
  useExperts,
  useLeaveEntries,
} from '@/hooks/use-backend-data';
import { getMonthName } from '@/lib/app-utils';
import { filterActiveConcurrentProjectsForMonth } from '@/lib/concurrent-projects';
import { buildFinancialReportingSummary } from '@/lib/financial-reporting';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, value) => ({ value, label: getMonthName(value) }));

function financialHourlyRateStorageKey(month: number, year: number) {
  return `financial-peo-hourly-rates-${year}-${String(month + 1).padStart(2, '0')}`;
}

function getStoredFinancialHourlyRate(expert: { id?: string; name?: string }, month: number, year: number) {
  try {
    const storedRates = window.localStorage.getItem(financialHourlyRateStorageKey(month, year));
    const rates = storedRates ? JSON.parse(storedRates) as Record<string, string> : {};
    const rawValue = (expert.id ? rates[expert.id] : undefined) ?? (expert.name ? rates[expert.name] : undefined);
    const value = Number(rawValue?.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export default function FinancialDashboardPage() {
  const today = new Date();
  const currentCalendarYear = today.getFullYear();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(currentCalendarYear);
  const [selectedExpertId, setSelectedExpertId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCentralizer, setIsExportingCentralizer] = useState(false);

  const selectableYears = useMemo(
    () => Array.from(new Set([currentYear, currentCalendarYear, currentCalendarYear - 1, currentCalendarYear + 1])).sort((a, b) => b - a),
    [currentCalendarYear, currentYear],
  );
  const { experts, isLoading: expertsLoading } = useExperts();
  const { activities: monthActivities, isLoading: activitiesLoading } = useActivitiesByMonth(currentMonth, currentYear);
  const { projects: allConcurrentProjects, isLoading: concurrentProjectsLoading } = useAllConcurrentProjects();
  const { entries: concurrentTimesheetEntries, isLoading: concurrentEntriesLoading } = useConcurrentProjectTimesheetByMonth(currentMonth, currentYear);
  const { contracts: normContracts, isLoading: normContractsLoading } = useAllExpertNormContracts();
  const { leaveEntries, isLoading: leaveEntriesLoading } = useLeaveEntries(currentMonth, currentYear);

  useEffect(() => {
    if (!selectedExpertId && experts.length > 0) {
      setSelectedExpertId(experts[0].id);
    }
  }, [experts, selectedExpertId]);

  const selectedExpert = useMemo(
    () => experts.find((expert) => expert.id === selectedExpertId) ?? null,
    [experts, selectedExpertId],
  );
  const peoActivities = useMemo(
    () => selectedExpert ? monthActivities.filter((activity) => activity.expertId === selectedExpert.id) : [],
    [monthActivities, selectedExpert],
  );
  const activeConcurrentProjects = useMemo(
    () => filterActiveConcurrentProjectsForMonth(
      allConcurrentProjects.filter((project) => project.expertId === selectedExpertId),
      currentMonth,
      currentYear,
    ),
    [allConcurrentProjects, currentMonth, currentYear, selectedExpertId],
  );
  const expertConcurrentEntries = useMemo(
    () => selectedExpert ? concurrentTimesheetEntries.filter((entry) => entry.expertId === selectedExpert.id) : [],
    [concurrentTimesheetEntries, selectedExpert],
  );
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

  const handleExportExcel = async () => {
    if (!selectedExpert || exportIsLoading || isExporting) return;

    setIsExporting(true);
    try {
      const response = await fetch('/api/export/pontaj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPontajExportPayload({
          kind: 'consolidated',
          expert: { ...selectedExpert, hourlyRate: getStoredFinancialHourlyRate(selectedExpert, currentMonth, currentYear) },
          activities: peoActivities,
          concurrentProjects: activeConcurrentProjects,
          concurrentTimesheetEntries: expertConcurrentEntries,
          month: currentMonth,
          year: currentYear,
        })),
      });

      if (!response.ok) {
        const contentType = response.headers.get('Content-Type') || '';
        const message = contentType.includes('application/json')
          ? ((await response.json().catch(() => ({}))) as { error?: string }).error
          : await response.text().catch(() => '');
        throw new Error(message || `Exportul pontajului a esuat. Status HTTP: ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename =
        getFilenameFromDisposition(disposition) ||
        `Pontaj_final_consolidat_${selectedExpert.name}_${getMonthName(currentMonth)}_${currentYear}.xlsx`;
      triggerDownload(blob, filename);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Exportul pontajului a esuat.');
    } finally {
      setIsExporting(false);
    }
  };

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
        <>
          <Button asChild variant="outline">
            <Link href="/financiar/pontaje">
              <CalendarDays className="h-4 w-4" />
              Pontaje
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/financiar/concedii">
              <FileText className="h-4 w-4" />
              Concedii
            </Link>
          </Button>
          <Select value={String(currentMonth)} onValueChange={(value) => setCurrentMonth(Number(value))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Luna" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((month) => (
                <SelectItem key={month.value} value={String(month.value)}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(currentYear)} onValueChange={(value) => setCurrentYear(Number(value))}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="An" />
            </SelectTrigger>
            <SelectContent>
              {selectableYears.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedExpertId} onValueChange={setSelectedExpertId} disabled={expertsLoading || experts.length === 0}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={expertsLoading ? 'Se incarca expertii' : 'Selecteaza expert'} />
            </SelectTrigger>
            <SelectContent>
              {experts.map((expert) => (
                <SelectItem key={expert.id} value={expert.id}>
                  {expert.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportExcel} disabled={!selectedExpert || exportIsLoading || isExporting}>
            <FileSpreadsheet className="h-4 w-4" />
            {isExporting ? 'Se exporta' : 'Export Excel'}
          </Button>
          <Button variant="outline" onClick={handleExportCentralizer} disabled={exportIsLoading || isExportingCentralizer || financialSummary.rows.length === 0}>
            <Download className="h-4 w-4" />
            {isExportingCentralizer ? 'Se exporta' : 'Export centralizator'}
          </Button>
          <Button>
            Adaugă înregistrare
            <Plus className="h-4 w-4" />
          </Button>
        </>
      }
    >
      <></>
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
