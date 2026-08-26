'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { configureAmplify } from '@/lib/aws/client';
import { useExperts, useHistoricalImportMutations, useHistoricalReports } from '@/hooks/use-backend-data';
import { uploadAuthenticatedData } from '@/lib/authenticated-storage';

const months = [
  { value: 1, label: 'Ianuarie' },
  { value: 2, label: 'Februarie' },
  { value: 3, label: 'Martie' },
  { value: 4, label: 'Aprilie' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Iunie' },
  { value: 7, label: 'Iulie' },
  { value: 8, label: 'August' },
  { value: 9, label: 'Septembrie' },
  { value: 10, label: 'Octombrie' },
  { value: 11, label: 'Noiembrie' },
  { value: 12, label: 'Decembrie' },
];

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionOf(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension || 'other';
}

type ImportResult = {
  reportId: string;
  monthLabel: string;
  expertName: string;
};

export function HistoricalImportPanel() {
  const { experts, isLoading: isLoadingExperts } = useExperts();
  const { reports, isLoading: isLoadingReports, mutate: refreshReports } = useHistoricalReports({ year: 2026 });
  const { createBatch, createReport, createFile } = useHistoricalImportMutations();

  const activeExperts = useMemo(
    () => experts.filter((expert) => expert.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [experts],
  );

  const [expertId, setExpertId] = useState('');
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState('1');
  const [totalPeoHours, setTotalPeoHours] = useState('');
  const [subactivities, setSubactivities] = useState('');
  const [notes, setNotes] = useState('');
  const [activityReportFile, setActivityReportFile] = useState<File | null>(null);
  const [timesheetFile, setTimesheetFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const selectedExpert = activeExperts.find((expert) => expert.id === expertId);
  const selectedMonth = months.find((item) => item.value === Number(month)) ?? months[0];
  const canSave = Boolean(selectedExpert && year && month && (activityReportFile || timesheetFile));

  const uploadHistoricalFile = async (file: File, batchId: string, type: 'monthly_activity_report_pdf' | 'timesheet_excel') => {
    configureAmplify();
    const path = `historical-import/${year}/${String(month).padStart(2, '0')}/${selectedExpert?.id}/${Date.now()}-${safeFileName(file.name)}`;
    const uploaded = await uploadAuthenticatedData({
      path,
      data: file,
      options: {
        contentType: file.type || 'application/octet-stream',
      },
    }).result;

    return createFile({
      expertId: selectedExpert?.id,
      importBatchId: batchId,
      originalFileName: file.name,
      storagePath: uploaded.path,
      s3Key: uploaded.path,
      fileType: type,
      extension: extensionOf(file),
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      reportingYear: Number(year),
      reportingMonth: Number(month),
      detectedExpertName: selectedExpert?.name,
      detectedProjectCode: selectedExpert?.projectCode ?? '302141',
      uploadStatus: 'uploaded',
      parsingStatus: 'not_parsed',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'admin',
    });
  };

  const handleSave = async () => {
    if (!selectedExpert) {
      setError('Alege un expert inainte de salvare.');
      return;
    }
    if (!activityReportFile && !timesheetFile) {
      setError('Incarca cel putin PDF-ul raportului lunar sau Excelul de pontaj.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setResult(null);

    try {
      const batch = await createBatch({
        projectCode: selectedExpert.projectCode ?? '302141',
        label: `Import istoric ${selectedMonth.label} ${year} - ${selectedExpert.name}`,
        reportingYear: Number(year),
        monthsIncluded: [Number(month)],
        importedBy: 'admin',
        importedAt: new Date().toISOString(),
        totalExperts: 1,
        totalTimesheets: timesheetFile ? 1 : 0,
        totalActivityReports: activityReportFile ? 1 : 0,
        totalFiles: [activityReportFile, timesheetFile].filter(Boolean).length,
        status: 'completed',
        notes: notes || undefined,
      });

      const activityFile = activityReportFile
        ? await uploadHistoricalFile(activityReportFile, batch.id, 'monthly_activity_report_pdf')
        : null;
      const pontajFile = timesheetFile
        ? await uploadHistoricalFile(timesheetFile, batch.id, 'timesheet_excel')
        : null;

      const report = await createReport({
        expertId: selectedExpert.id,
        expertName: selectedExpert.name,
        projectCode: selectedExpert.projectCode ?? '302141',
        projectTitle: selectedExpert.projectTitle,
        positionInProject: selectedExpert.positionInProject,
        reportingYear: Number(year),
        reportingMonth: Number(month),
        reportingMonthLabel: selectedMonth.label,
        sourceType: 'historical_import',
        importBatchId: batch.id,
        activityReportFileId: activityFile?.id,
        timesheetWorkbookFileId: pontajFile?.id,
        totalPeoHours: totalPeoHours ? Number(totalPeoHours) : undefined,
        subactivities: subactivities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        status: 'imported',
        pmReviewStatus: 'not_reviewed',
        pmObservations: notes ? [notes] : [],
        createdBy: 'admin',
      });

      await refreshReports();
      setResult({ reportId: report.id, monthLabel: selectedMonth.label, expertName: selectedExpert.name });
      setActivityReportFile(null);
      setTimesheetFile(null);
      setTotalPeoHours('');
      setSubactivities('');
      setNotes('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Importul istoric a esuat.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Upload className="h-5 w-5 text-primary" />
            Import dosar lunar
          </CardTitle>
          <CardDescription>
            Salveaza o baza istorica auditabila pentru un expert si o luna: raport PDF, pontaj Excel si metadate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Import nereusit</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {result ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import salvat</AlertTitle>
              <AlertDescription>
                {result.expertName} - {result.monthLabel} {year}. Dosar istoric: {result.reportId}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Expert</Label>
              <Select value={expertId} onValueChange={setExpertId} disabled={isLoadingExperts || isSaving}>
                <SelectTrigger>
                  <SelectValue placeholder="Alege expert" />
                </SelectTrigger>
                <SelectContent>
                  {activeExperts.map((expert) => (
                    <SelectItem key={expert.id} value={expert.id}>
                      {expert.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-2">
                <Label>Luna</Label>
                <Select value={month} onValueChange={setMonth} disabled={isSaving}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((item) => (
                      <SelectItem key={item.value} value={String(item.value)}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>An</Label>
                <Input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" disabled={isSaving} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Total ore PEO</Label>
              <Input
                value={totalPeoHours}
                onChange={(event) => setTotalPeoHours(event.target.value)}
                inputMode="decimal"
                placeholder="ex. 108"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label>Subactivitati</Label>
              <Input
                value={subactivities}
                onChange={(event) => setSubactivities(event.target.value)}
                placeholder="ex. SA3.4, SA3.5"
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>PDF raport lunar / Anexa 10</Label>
              <Input
                type="file"
                accept=".pdf"
                disabled={isSaving}
                onChange={(event) => setActivityReportFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">{activityReportFile?.name ?? 'Niciun PDF selectat'}</p>
            </div>
            <div className="space-y-2">
              <Label>Excel pontaj</Label>
              <Input
                type="file"
                accept=".xls,.xlsx"
                disabled={isSaving}
                onChange={(event) => setTimesheetFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">{timesheetFile?.name ?? 'Niciun Excel selectat'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observatii import</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="ex. Import retroactiv din fisierele existente pentru ianuarie-aprilie 2026."
              disabled={isSaving}
            />
          </div>

          <Button onClick={handleSave} disabled={!canSave || isSaving} className="w-full sm:w-auto">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Salveaza import istoric
          </Button>
        </CardContent>
      </Card>

      <aside className="space-y-6">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">Istoric 2026</CardTitle>
            <CardDescription>Primele inregistrari importate in AWS pentru anul 2026.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingReports ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Se incarca istoricul...
              </div>
            ) : reports.length === 0 ? (
              <p className="text-sm leading-6 text-muted-foreground">Nu exista inca dosare istorice salvate.</p>
            ) : (
              reports.slice(0, 8).map((report) => (
                <div key={report.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{report.expertName}</p>
                      <p className="text-sm text-muted-foreground">
                        {report.reportingMonthLabel ?? report.reportingMonth} {report.reportingYear}
                      </p>
                    </div>
                    <Badge variant="secondary">{report.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {report.activityReportFileId ? (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        PDF
                      </span>
                    ) : null}
                    {report.timesheetWorkbookFileId ? (
                      <span className="inline-flex items-center gap-1">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Pontaj
                      </span>
                    ) : null}
                    {report.totalPeoHours ? <span>{report.totalPeoHours} ore</span> : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Separat de raportarea curenta</AlertTitle>
          <AlertDescription>
            Inregistrarile create aici sunt marcate cu `historical_import`, ca sa nu fie confundate cu date introduse nativ de experti.
          </AlertDescription>
        </Alert>
      </aside>
    </div>
  );
}
