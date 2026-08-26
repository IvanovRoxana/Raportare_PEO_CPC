'use client';

import { useState } from 'react';
import { FileText, Download, Loader2, FileSpreadsheet, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { Activity, ConcurrentProject, ConcurrentProjectTimesheetEntry, Expert, LeaveEntry } from '@/lib/types';
import type { Deliverable } from '@/lib/types';
import { activitiesService, businessHubEntityDirectoryService } from '@/lib/backend-store';
import { getMonthName } from '@/lib/app-utils';
import { getNonWorkingDayInfo } from '@/lib/non-working-days';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';
import { getWorkingHoursInfo } from '@/lib/working-hours';
import { normalizePeoCategory } from '@/lib/peo-category';
import { ANEXA10_EXPORT_SETTINGS, buildAnexa10ReportModel } from '@/lib/activity-report/build-report-model';
import { buildAnexa10DocxBlob, buildAnexa10DocxFilename } from '@/lib/activity-report/docx-export';
import { assertCanExportAnexa10Docx } from '@/lib/activity-report/export-readiness';
import type { ReportingWorkBlockBundle } from '@/lib/activity-report/work-blocks';
import {
  buildBusinessHubAddressDocxBlob,
  buildBusinessHubAddressFilename,
  buildBusinessHubPvFilename,
  buildBusinessHubPvRows,
  buildBusinessHubPvXlsx,
  groupBusinessHubRowsByEntity,
  resolveBusinessHubEntitiesForRows,
} from '@/lib/business-hub-reporting';
import { buildDocumentS3Key, sha256Hex } from '@/lib/document-sharing';
import { uploadAuthenticatedData } from '@/lib/authenticated-storage';

interface MonthlyReportExportProps {
  expert: Expert;
  activities: Activity[];
  concurrentProjects?: ConcurrentProject[];
  concurrentTimesheetEntries?: ConcurrentProjectTimesheetEntry[];
  leaveEntries?: LeaveEntry[];
  workBlockBundles?: ReportingWorkBlockBundle[];
  workBlockBundlesLoading?: boolean;
  month: number;
  year: number;
}

export function MonthlyReportExport({
  expert,
  activities,
  concurrentProjects = [],
  concurrentTimesheetEntries = [],
  leaveEntries = [],
  workBlockBundles = [],
  workBlockBundlesLoading = false,
  month,
  year,
}: MonthlyReportExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [includeTimesheet, setIncludeTimesheet] = useState(true);
  const [includeRA, setIncludeRA] = useState(true);
  const [includeBusinessHubPv, setIncludeBusinessHubPv] = useState(true);
  const [includeBusinessHubAddresses, setIncludeBusinessHubAddresses] = useState(false);
  const [attachBusinessHubDeliverables, setAttachBusinessHubDeliverables] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);

  const peoDailyHours = Number(expert.oreZi ?? expert.dailyHours ?? expert.norma ?? 8) || 8;
  const workingInfo = getWorkingHoursInfo(month, year, peoDailyHours, activities);
  const peoMonthlyNorm = Number(expert.projectMonthlyNorm) || 0;
  const displayWorkingInfo = {
    ...workingInfo,
    maxHoursWithNorma: peoMonthlyNorm > 0 ? peoMonthlyNorm : workingInfo.maxHoursWithNorma,
  };
  const totalHours = workingInfo.totalHours;
  const normalizedExpertCategory = normalizePeoCategory(expert.category);
  const hasBusinessHubActivities = activities.some((activity) => Boolean(activity.businessHubMetaJson));
  const isBusinessHubExpert = normalizedExpertCategory === 'bh';
  const isBusinessHubExportAvailable = isBusinessHubExpert || hasBusinessHubActivities;
  const businessHubPvRows = isBusinessHubExportAvailable ? buildBusinessHubPvRows(activities, expert.category, month, year) : [];

  const openBusinessHubExportDialog = (mode?: 'pv' | 'addresses') => {
    setIncludeTimesheet(false);
    setIncludeRA(false);
    setIncludeBusinessHubPv(mode !== 'addresses');
    setIncludeBusinessHubAddresses(mode === 'addresses');
    setAttachBusinessHubDeliverables(true);
    setExportError(null);
    setIsOpen(true);
  };

  const handleExport = async () => {
    setIsGenerating(true);
    setExportError(null);
    try {
      // Generate the selected documents
      const failedExports: string[] = [];
      const runExport = async (label: string, action: () => Promise<void> | void) => {
        try {
          await action();
        } catch (error) {
          console.error(`Error exporting ${label}:`, error);
          const message = error instanceof Error ? error.message : 'Exportul a esuat.';
          failedExports.push(`${label}: ${message}`);
        }
      };
      
      if (includeTimesheet) {
        await runExport('Pontaj PEO', () => downloadPontajExcel('peo'));
      }
      
      if (includeRA) {
        await runExport('Raport de Activitate', async () => {
          if (workBlockBundlesLoading) {
            throw new Error('Se incarca work block-urile salvate. Asteapta finalizarea incarcarii si incearca din nou.');
          }

          const model = buildAnexa10ReportModel({
            expert,
            activities,
            month,
            year,
            workBlockBundles: workBlockBundles.length > 0 ? workBlockBundles : undefined,
            settings: ANEXA10_EXPORT_SETTINGS,
          });
          assertCanExportAnexa10Docx(model, {
            usesPersistedWorkBlocks: workBlockBundles.length > 0,
          });
          const blob = await buildAnexa10DocxBlob(model);
          triggerDownload(blob, buildAnexa10DocxFilename(model));
        });
      }

      if (isBusinessHubExportAvailable && (includeBusinessHubPv || includeBusinessHubAddresses)) {
        await runExport('Business Hub', async () => {
          const businessHubFiles = await generateBusinessHubMonthlyFiles({
            includePv: includeBusinessHubPv,
            includeAddresses: includeBusinessHubAddresses,
          });
          businessHubFiles.forEach((file) => triggerDownload(file.blob, file.name));
          if (attachBusinessHubDeliverables) {
            await attachBusinessHubMonthlyDeliverables(businessHubFiles);
          }
        });
      }

      if (failedExports.length > 0) {
        setExportError(`Am descarcat documentele generate, dar unele exporturi au esuat:\n${failedExports.join('\n')}`);
      } else {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      setExportError(error instanceof Error ? error.message : 'Exportul a esuat.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateBusinessHubMonthlyFiles = async (options?: { includePv?: boolean; includeAddresses?: boolean }) => {
    const rows = buildBusinessHubPvRows(activities, expert.category, month, year);
    if (rows.length === 0) {
      throw new Error('Nu exista activitati Business Hub inregistrate pentru luna selectata.');
    }

    const shouldIncludePv = options?.includePv ?? includeBusinessHubPv;
    const shouldIncludeAddresses = options?.includeAddresses ?? includeBusinessHubAddresses;
    const files: { name: string; blob: Blob; deliverableType: string }[] = [];
    if (shouldIncludePv) {
      const pvBuffer = buildBusinessHubPvXlsx(activities, expert.category, month, year);
      files.push({
        name: buildBusinessHubPvFilename(month, year),
        blob: new Blob([pvBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        deliverableType: 'business_hub_monthly_pv',
      });
    }

    if (shouldIncludeAddresses) {
      const directory = await businessHubEntityDirectoryService.getAll();
      const { resolved, missing } = resolveBusinessHubEntitiesForRows(rows, directory);
      if (missing.length > 0) {
        throw new Error(`Completeaza directorul Business Hub pentru: ${missing.join(', ')}.`);
      }

      const rowsByEntity = groupBusinessHubRowsByEntity(rows);
      for (const [entityName, entityRows] of rowsByEntity.entries()) {
        const entity = resolved.get(entityName);
        if (!entity) continue;
        files.push({
          name: buildBusinessHubAddressFilename(entity, month, year),
          blob: await buildBusinessHubAddressDocxBlob({ entity, rows: entityRows, month, year }),
          deliverableType: 'business_hub_monthly_address',
        });
      }
    }

    return files;
  };

  const attachBusinessHubMonthlyDeliverables = async (files: { name: string; blob: Blob; deliverableType: string }[]) => {
    const businessHubActivities = activities.filter((activity) =>
      buildBusinessHubPvRows([activity], expert.category, month, year).length > 0,
    );
    if (businessHubActivities.length === 0 || files.length === 0) return;

    const uploadedDeliverables = await Promise.all(files.map(async (file) => {
      const documentId = `bh_${expert.id}_${year}_${String(month + 1).padStart(2, '0')}_${file.deliverableType}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const s3Key = buildDocumentS3Key({
        projectId: expert.projectCode || '302141',
        documentId,
        originalFileName: file.name,
      });
      const arrayBuffer = await file.blob.arrayBuffer();
      const uploaded = await uploadAuthenticatedData({
        path: s3Key,
        data: file.blob,
        options: { contentType: file.blob.type || 'application/octet-stream' },
      }).result;

      return {
        id: documentId,
        documentId,
        fileName: file.name,
        originalFileName: file.name,
        fileType: file.blob.type || 'application/octet-stream',
        fileSize: file.blob.size,
        filePath: uploaded.path,
        s3Key: uploaded.path,
        fileHash: await sha256Hex(arrayBuffer),
        uploadedByExpertId: expert.id,
        uploadedByExpertName: expert.name,
        projectId: expert.projectCode || '302141',
        projectName: expert.projectTitle,
        activityDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        saCode: 'SA3.2',
        deliverableType: file.deliverableType,
        isCommonDeliverable: true,
        sharedWithExpertIds: [],
        uploadedAt: new Date().toISOString(),
        titleCheckStatus: 'matched',
        aiStatus: 'generated',
      } satisfies Deliverable;
    }));

    await Promise.all(businessHubActivities.map((activity) => {
      const existing = activity.deliverables ?? [];
      const filteredExisting = existing.filter((deliverable) =>
        !uploadedDeliverables.some((generated) => generated.documentId === deliverable.documentId),
      );
      return activitiesService.update(activity.id, {
        ...activity,
        deliverables: [...filteredExisting, ...uploadedDeliverables],
      });
    }));
  };

  const downloadPontajExcel = async (kind: 'peo' | 'consolidated') => {
    const response = await fetch('/api/export/pontaj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPontajExportPayload({
        kind,
        expert,
        activities,
        concurrentProjects,
        concurrentTimesheetEntries,
        leaveEntries,
        month,
        year,
      })),
    });

    if (!response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      const message = contentType.includes('application/json')
        ? ((await response.json().catch(() => ({}))) as { error?: string }).error
        : await response.text().catch(() => '');
      throw new Error(
        contentType.includes('text/html')
          ? `Exportul Excel a fost blocat de server. Status HTTP: ${response.status}. Reincarca pagina si incearca din nou.`
          : message || `Exportul Excel a esuat. Status HTTP: ${response.status}`,
      );
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = getFilenameFromDisposition(disposition) ||
      `${kind === 'peo' ? 'Pontaj_PEO' : 'Pontaj_final_consolidat'}_${expert.name}_${getMonthName(month)}_${year}.xlsx`;
    triggerDownload(blob, filename);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {isBusinessHubExportAvailable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={() => openBusinessHubExportDialog('pv')}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Genereaza PV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => openBusinessHubExportDialog('addresses')}
          >
            <FileText className="h-4 w-4" />
            Genereaza adrese
          </Button>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export lunar
            </Button>
          </DialogTrigger>
        </div>
      ) : (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export Raport Lunar
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Raport Lunar - {getMonthName(month)} {year}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-muted/50 p-3 rounded-lg text-sm">
            <p><strong>Expert:</strong> {expert.name}</p>
            <p><strong>Total ore:</strong> {totalHours}h / {displayWorkingInfo.maxHoursWithNorma}h</p>
            <p><strong>Activități:</strong> {activities.length}</p>
          </div>

          {/* Document selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Documente de generat:</Label>

            {isBusinessHubExportAvailable && (
              <div className="space-y-3 rounded-md border border-sky-100 bg-sky-50/60 p-3">
                <div>
                  <p className="text-sm font-semibold text-sky-950">Business Hub</p>
                  <p className="text-xs text-sky-800">
                    Export lunar pentru proces-verbal, adrese si atasare ca livrabile comune.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="business-hub-pv"
                    checked={includeBusinessHubPv}
                    onCheckedChange={(checked) => setIncludeBusinessHubPv(checked as boolean)}
                  />
                  <label htmlFor="business-hub-pv" className="text-sm flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-sky-700" />
                    PV Business Hub (.xlsx, {businessHubPvRows.length} evenimente)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="business-hub-attach"
                    checked={attachBusinessHubDeliverables}
                    onCheckedChange={(checked) => setAttachBusinessHubDeliverables(checked as boolean)}
                  />
                  <label htmlFor="business-hub-attach" className="text-sm flex items-center gap-2">
                    <FileType className="h-4 w-4 text-sky-700" />
                    Ataseaza ca livrabile lunare
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="business-hub-addresses"
                    checked={includeBusinessHubAddresses}
                    onCheckedChange={(checked) => setIncludeBusinessHubAddresses(checked as boolean)}
                  />
                  <label htmlFor="business-hub-addresses" className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-sky-700" />
                    Adrese Business Hub (.docx)
                  </label>
                </div>
              </div>
            )}
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="timesheet"
                checked={includeTimesheet}
                onCheckedChange={(checked) => setIncludeTimesheet(checked as boolean)}
              />
              <label htmlFor="timesheet" className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                Pontaj PEO
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="ra"
                checked={includeRA}
                onCheckedChange={(checked) => setIncludeRA(checked as boolean)}
              />
              <label htmlFor="ra" className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-600" />
                Raport de Activitate (Anexa 10 .docx)
              </label>
            </div>
          </div>

          {exportError && (
            <div className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {exportError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleExport} disabled={isGenerating || (!includeTimesheet && !includeRA && !(isBusinessHubExportAvailable && (includeBusinessHubPv || includeBusinessHubAddresses)))}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Se generează...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Descarcă
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getFilenameFromDisposition(disposition: string) {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateTimesheet(
  expert: Expert,
  activities: Activity[],
  month: number,
  year: number,
  workingInfo: { workingDays: number; maxHoursWithNorma: number }
) {
  const monthName = getMonthName(month);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const peoDailyHours = Number(expert.oreZi ?? expert.dailyHours ?? expert.norma ?? 8) || 8;
  
  // Group activities by date
  const byDate = new Map<string, Activity[]>();
  activities.forEach(a => {
    const existing = byDate.get(a.date) || [];
    existing.push(a);
    byDate.set(a.date, existing);
  });

  let content = `PONTAJ LUNAR / TIMESHEET
========================
Proiect: PEO - Parteneriat pentru Educație și Oportunități
Cod proiect: 302141

Expert: ${expert.name}
Funcție: ${expert.role}
Luna: ${monthName} ${year}
Normă: ${peoDailyHours} ore/zi

---
Data\t\tOre\tActivitate
---
`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayActivities = byDate.get(dateStr) || [];
    const totalHoursDay = dayActivities.reduce((sum, a) => sum + (a.hours || 0), 0);
    
    const nonWorkingInfo = getNonWorkingDayInfo(dateStr);
    
    if (totalHoursDay > 0) {
      dayActivities.forEach((a, i) => {
        content += `${i === 0 ? dateStr : '\t\t'}\t${a.hours}\t${a.title}\n`;
      });
    } else if (!nonWorkingInfo.isNonWorkingDay) {
      content += `${dateStr}\t0\t-\n`;
    }
  }

  const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
  content += `
---
TOTAL ORE: ${totalHours} / ${workingInfo.maxHoursWithNorma}

Semnătură expert: _____________________
Data: _____________________

Aprobat Manager Proiect: _____________________
Data: _____________________
`;

  return {
    name: `Pontaj_${expert.name.replace(/\s+/g, '_')}_${monthName}_${year}.txt`,
    content,
  };
}

