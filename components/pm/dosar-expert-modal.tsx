'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2,
  CheckCircle,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Users,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type {
  Activity,
  ConcurrentProject,
  ConcurrentProjectTimesheetEntry,
  Deliverable,
  DocumentMetadata,
  Expert,
  Neconformitate,
  ReportStatus,
  VerificationData,
  PmClarificationThread,
} from '@/lib/types';
import { generateOpisDocument, downloadOpis } from '@/lib/opis-generator';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import { dedupeDeliverablesBySignature } from '@/lib/deliverable-deduplication';
import { GDPR_CONCLUSION_OPTIONS, getGdprDeliverableRequirementLabel, getGdprMinimumEvidenceLabels, getGdprTemplate, parseGdprMetaJson, validateGdprActivityDraft } from '@/lib/gdpr-reporting';
import { buildAnexa10ReportModel } from '@/lib/activity-report/build-report-model';
import { buildAnexa10DocxBlob, buildAnexa10DocxFilename } from '@/lib/activity-report/docx-export';
import { buildPontajExportPayload } from '@/lib/pontaj-export-payload';
import { buildOpisXlsxBlob, buildOpisXlsxFilename } from '@/lib/opis-xls-export';
import { buildPmDossierPdfBlob, buildPmDossierPdfFilename } from '@/lib/pm-dossier-export';
import { clarificationStatusLabel } from '@/lib/pm-clarification-flow';

interface DosarExpertModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expert: Expert | null;
  activities: Activity[];
  verification: VerificationData | null;
  neconformitati: Neconformitate[];
  month: number;
  year: number;
  reportStatus?: ReportStatus | null;
  documents?: DocumentMetadata[];
  canManagePmReview?: boolean;
  onSetInReview?: () => Promise<void> | void;
  onRequestClarifications?: () => Promise<void> | void;
  onRejectMonth?: () => Promise<void> | void;
  onApproveMonth?: () => Promise<void> | void;
  onApproveActivity?: (activities: Activity[]) => Promise<void> | void;
  onRequestActivityClarification?: (activities: Activity[]) => Promise<void> | void;
  clarificationThreads?: PmClarificationThread[];
  initialFocus?: { activityId?: string; documentId?: string; issueType?: string };
  concurrentProjects?: ConcurrentProject[];
  concurrentTimesheetEntries?: ConcurrentProjectTimesheetEntry[];
  projectCode?: string;
  projectTitle?: string;
}

function financialHourlyRateStorageKey(month: number, year: number) {
  return `financial-peo-hourly-rates-${year}-${String(month + 1).padStart(2, '0')}`;
}

function getStoredFinancialHourlyRate(expert: Expert, month: number, year: number) {
  try {
    const storedRates = window.localStorage.getItem(financialHourlyRateStorageKey(month, year));
    const rates = storedRates ? JSON.parse(storedRates) as Record<string, string> : {};
    const rawValue = rates[expert.id] ?? rates[expert.name];
    const value = Number(rawValue?.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

type DossierDeliverable = Deliverable & {
  activityDate?: string;
  activityTitle?: string;
  activityType?: string;
};

type ReviewAction = 'in_review' | 'clarifications' | 'rejected' | 'approved';

type DossierActivityGroup = {
  key: string;
  type: string;
  saCode: string;
  title: string;
  description?: string;
  activities: Activity[];
  dates: string[];
  totalHours: number;
  deliverables: Deliverable[];
  representative: Activity;
};

const REPORT_STATUS_LABELS: Record<ReportStatus['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  sent: { label: 'Trimis catre PM', variant: 'outline' },
  in_review: { label: 'In verificare', variant: 'outline' },
  approved: { label: 'Aprobat', variant: 'default' },
  rejected: { label: 'Respins', variant: 'destructive' },
  clarifications: { label: 'Clarificari', variant: 'destructive' },
};

function GdprPmSummary({ activity }: { activity: Activity }) {
  const template = getGdprTemplate(activity.gdprTemplateCode);
  const meta = parseGdprMetaJson(activity.gdprMetaJson);
  const validation = validateGdprActivityDraft({
    templateCode: activity.gdprTemplateCode,
    meta,
    description: activity.gdprGeneratedText || activity.description,
    hasDeliverable: (activity.deliverables ?? []).length > 0,
  });
  const conclusion = GDPR_CONCLUSION_OPTIONS.find((option) => option.code === activity.gdprConclusionCode)?.label
    || GDPR_CONCLUSION_OPTIONS.find((option) => option.code === meta.concluzie)?.label
    || 'Concluzie neprecizata';

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-12">
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800">
        {template?.code || activity.gdprTemplateCode}
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        {conclusion}
      </Badge>
      {template && (
        <span className="text-[10px] text-slate-500">
          {getGdprDeliverableRequirementLabel(template.deliverableRequirement)}; dovada: {getGdprMinimumEvidenceLabels(template.minimumEvidenceTypes).join(', ')}
        </span>
      )}
      {template?.deliverableTitle && template.deliverableRequirement !== 'nu_este_necesar' && (
        <span className="max-w-[360px] truncate text-[10px] text-slate-500">
          Livrabil: {template.deliverableTitle}
        </span>
      )}
      {!validation.ok && (
        <Badge variant="destructive" className="text-[10px]">
          lipsa: {validation.missingFields.join(', ')}
        </Badge>
      )}
      {(meta.incidente === true || meta.concluzie === 'neconform_cu_remediere') && (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800">
          risc / recomandari
        </Badge>
      )}
    </div>
  );
}

export function DosarExpertModal({
  open,
  onOpenChange,
  expert,
  activities,
  verification,
  neconformitati,
  month,
  year,
  reportStatus,
  documents = [],
  canManagePmReview = false,
  onSetInReview,
  onRequestClarifications,
  onRejectMonth,
  onApproveMonth,
  onApproveActivity,
  onRequestActivityClarification,
  clarificationThreads = [],
  initialFocus,
  concurrentProjects = [],
  concurrentTimesheetEntries = [],
  projectCode = 'PEO',
  projectTitle = 'Program de Educatie si Ocupare',
}: DosarExpertModalProps) {
  const [activeTab, setActiveTab] = useState('sectiunea-a');
  const [isGeneratingOpis, setIsGeneratingOpis] = useState(false);
  const [isGeneratingOpisXls, setIsGeneratingOpisXls] = useState(false);
  const [isGeneratingRa, setIsGeneratingRa] = useState(false);
  const [isGeneratingPontaj, setIsGeneratingPontaj] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [activityActionId, setActivityActionId] = useState<string | null>(null);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];
  const statusMeta = reportStatus
    ? REPORT_STATUS_LABELS[reportStatus.status] || REPORT_STATUS_LABELS.draft
    : null;
  const formattedSentDate = reportStatus?.sentDate
    ? new Date(reportStatus.sentDate).toLocaleString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  useEffect(() => {
    if (!open || !initialFocus) return;
    setActiveTab('sectiunea-a');
    window.setTimeout(() => {
      const targetId = initialFocus.activityId
        ? `dossier-activity-${initialFocus.activityId}`
        : initialFocus.documentId
          ? `dossier-document-${initialFocus.documentId}`
          : initialFocus.issueType
            ? 'dossier-problems'
            : null;
      if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }, [initialFocus, open]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
    const totalActivities = activities.length;
    const totalDeliverables = activities.reduce((sum, a) => sum + (a.deliverables?.length || 0), 0);
    const workDays = new Set(activities.map(a => a.date)).size;
    const openIssues = neconformitati.filter(n => !n.resolved).length;
    
    return { totalHours, totalActivities, totalDeliverables, workDays, openIssues };
  }, [activities, neconformitati]);

  const formatActivityDate = (date: string) => {
    const dt = new Date(date);
    return isNaN(dt.getTime()) ? date : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
  };

  const formatActivityDay = (date: string) => {
    const dt = new Date(date);
    return isNaN(dt.getTime()) ? date : dt.toLocaleDateString('ro-RO', { day: '2-digit' });
  };

  const getActivitySaLabel = (activity: Activity) => activity.saCode || activity.deliverables?.find((deliverable) => deliverable.saCode)?.saCode || 'SA neprecizata';

  const getDeliverableTitle = (deliverable: Deliverable) => getDocumentAuditTitle({
    declaredTitle: deliverable.declaredTitle,
    suggestedTitle: deliverable.suggestedTitle,
    extractedTitle: deliverable.docTitle,
    docTitle: deliverable.docTitle,
    originalFileName: deliverable.originalFileName,
    fileName: deliverable.fileName,
  });

  const getDeliverableFileName = (deliverable: Deliverable) =>
    deliverable.originalFileName || deliverable.fileName || 'livrabil';

  const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  // Group activities by SA and consolidate multi-day entries from the same pontaj thread.
  const activitiesByType = useMemo(() => {
    const byType: Record<string, DossierActivityGroup[]> = {};
    const groupsByKey = new Map<string, DossierActivityGroup>();

    activities.forEach(act => {
      const type = getActivitySaLabel(act);
      const groupIdentity = act.periodGroupId
        || act.workingGroupId
        || act.originActivityId
        || [
          type,
          act.title || 'Activitate',
          act.description || '',
          act.gdprTemplateCode || '',
          act.gdprMetaJson || '',
        ].join('|');
      const key = `${type}|${groupIdentity}`;
      const existing = groupsByKey.get(key);

      if (existing) {
        existing.activities.push(act);
        existing.totalHours += act.hours || 0;
        existing.deliverables.push(...(act.deliverables || []));
        existing.dates = Array.from(new Set([...existing.dates, act.date])).sort();
        return;
      }

      const group: DossierActivityGroup = {
        key,
        type,
        saCode: type,
        title: act.title || 'Activitate',
        description: act.description,
        activities: [act],
        dates: [act.date],
        totalHours: act.hours || 0,
        deliverables: [...(act.deliverables || [])],
        representative: act,
      };
      groupsByKey.set(key, group);
      if (!byType[type]) byType[type] = [];
      byType[type].push(group);
    });

    return Object.entries(byType)
      .map(([type, groups]) => [
        type,
        groups.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.title.localeCompare(b.title)),
      ] as const)
      .sort((a, b) => b[1].length - a[1].length);
  }, [activities]);

  const documentsById = useMemo(() => {
    return new Map(documents.map((document) => [document.id, document]));
  }, [documents]);

  // All deliverables
  const allDeliverables = useMemo<DossierDeliverable[]>(() => {
    return dedupeDeliverablesBySignature(activities.flatMap(act => 
      (act.deliverables || []).map((d): DossierDeliverable => ({
        ...d,
        activityDate: act.date,
        activityTitle: act.title,
        activityType: act.activityType,
      }))
    )).sort((a, b) => (a.activityDate || '').localeCompare(b.activityDate || ''));
  }, [activities]);

  const handleDownloadOpis = async () => {
    if (!expert) return;
    setIsGeneratingOpis(true);
    try {
      const blob = await generateOpisDocument(expert, activities, month, year, projectCode, projectTitle);
      downloadOpis(blob, expert, month, year);
    } catch (error) {
      console.error('Error generating OPIS:', error);
    } finally {
      setIsGeneratingOpis(false);
    }
  };

  const getDeliverableKey = (deliverable: DossierDeliverable, index: number) =>
    deliverable.id || `${deliverable.activityDate || 'date'}-${deliverable.fileName}-${index}`;

  const hasDeliverableSource = (deliverable: DossierDeliverable) =>
    Boolean(
      deliverable.s3Key ||
      (deliverable.documentId && documentsById.get(deliverable.documentId)?.s3Key) ||
      deliverable.fileData
    );

  const resolveDeliverableUrl = async (deliverable: DossierDeliverable) => {
    const fileName = getDeliverableFileName(deliverable);

    if (deliverable.s3Key) {
      const result = await getSecureDocumentUrl({
        s3Key: deliverable.s3Key,
        originalFileName: fileName,
      });
      return { url: result.url, fileName: result.fileName, shouldRevoke: false };
    }

    if (deliverable.documentId) {
      const document = documentsById.get(deliverable.documentId);
      if (document?.s3Key) {
        const result = await getSecureDocumentUrl(document);
        return { url: result.url, fileName: result.fileName, shouldRevoke: false };
      }
    }

    if (deliverable.fileData) {
      const dataUrlMatch = deliverable.fileData.match(/^data:([^;]+);base64,(.*)$/);
      const mimeType = dataUrlMatch?.[1] || deliverable.fileType || 'application/octet-stream';
      const base64 = dataUrlMatch?.[2] || deliverable.fileData;
      const bytes = window.atob(base64);
      const byteNumbers = Array.from(bytes, (char) => char.charCodeAt(0));
      const blob = new Blob([new Uint8Array(byteNumbers) as BlobPart], { type: mimeType });
      return { url: URL.createObjectURL(blob), fileName, shouldRevoke: true };
    }

    throw new Error('Fisier indisponibil.');
  };

  const openDeliverable = async (deliverable: DossierDeliverable, index: number) => {
    const key = getDeliverableKey(deliverable, index);
    setDocumentActionId(`open-${key}`);
    setDocumentError(null);
    const previewWindow = window.open('', '_blank');

    try {
      const result = await resolveDeliverableUrl(deliverable);
      if (result.shouldRevoke) {
        if (previewWindow) {
          previewWindow.location.href = result.url;
        } else {
          window.open(result.url, '_blank');
        }
        window.setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
        return;
      }

      const response = await fetch(result.url);
      if (!response.ok) throw new Error('Fisierul nu a putut fi preluat pentru vizualizare.');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = objectUrl;
      } else {
        window.open(objectUrl, '_blank');
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      setDocumentError(error instanceof Error ? error.message : 'Fisierul nu a putut fi deschis.');
    } finally {
      setDocumentActionId(null);
    }
  };

  const downloadDeliverable = async (deliverable: DossierDeliverable, index: number) => {
    const key = getDeliverableKey(deliverable, index);
    setDocumentActionId(`download-${key}`);
    setDocumentError(null);

    try {
      const result = await resolveDeliverableUrl(deliverable);
      if (result.shouldRevoke) {
        const response = await fetch(result.url);
        const blob = await response.blob();
        saveBlob(blob, result.fileName);
        URL.revokeObjectURL(result.url);
        return;
      }

      const response = await fetch(result.url);
      if (!response.ok) throw new Error('Fisierul nu a putut fi preluat pentru descarcare.');
      const blob = await response.blob();
      saveBlob(blob, result.fileName);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Fisierul nu a putut fi descarcat.');
    } finally {
      setDocumentActionId(null);
    }
  };

  const runReviewAction = async (action: ReviewAction, handler?: () => Promise<void> | void) => {
    if (!handler) return;

    setReviewAction(action);
    try {
      await handler();
    } finally {
      setReviewAction(null);
    }
  };

  const handleDownloadOpisXls = () => {
    if (!expert) return;
    setIsGeneratingOpisXls(true);
    try {
      const blob = buildOpisXlsxBlob({
        experts: [expert],
        activities,
        month,
        year,
        projectCode,
      });
      saveBlob(blob, buildOpisXlsxFilename(expert.name, month, year));
    } finally {
      setIsGeneratingOpisXls(false);
    }
  };

  const handleDownloadRa = async () => {
    if (!expert) return;
    setIsGeneratingRa(true);
    try {
      const model = buildAnexa10ReportModel({ expert, activities, month, year });
      const blob = await buildAnexa10DocxBlob(model);
      saveBlob(blob, buildAnexa10DocxFilename(model));
    } finally {
      setIsGeneratingRa(false);
    }
  };

  const handleDownloadPontaj = async () => {
    if (!expert) return;
    setIsGeneratingPontaj(true);
    try {
      const response = await fetch('/api/export/pontaj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPontajExportPayload({
          kind: 'peo',
          expert: { ...expert, hourlyRate: getStoredFinancialHourlyRate(expert, month, year) },
          activities,
          concurrentProjects,
          concurrentTimesheetEntries,
          month,
          year,
        })),
      });
      if (!response.ok) throw new Error(`Exportul pontajului a esuat. Status HTTP: ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
      saveBlob(blob, match?.[1] ? decodeURIComponent(match[1]) : `Pontaj_PEO_${expert.name}_${monthName}_${year}.xlsx`);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Exportul pontajului a esuat.');
    } finally {
      setIsGeneratingPontaj(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!expert) return;
    setIsGeneratingPdf(true);
    try {
      const blob = buildPmDossierPdfBlob({
        expert,
        activities,
        neconformitati,
        clarifications: clarificationThreads,
        month,
        year,
        reportStatus,
      });
      saveBlob(blob, buildPmDossierPdfFilename(expert, month, year));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const runActivityAction = async (
    action: 'approve' | 'clarification',
    group: DossierActivityGroup,
    handler?: (activities: Activity[]) => Promise<void> | void
  ) => {
    if (!handler) return;

    setActivityActionId(`${action}-${group.key}`);
    try {
      await handler(group.activities);
    } finally {
      setActivityActionId(null);
    }
  };

  if (!expert) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden p-4 sm:max-w-none md:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Users className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <span>Dosar Expert: {expert.name}</span>
              <Badge variant="secondary" className="ml-2 text-xs">{expert.role}</Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            {monthName} {year} — {projectCode}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 rounded-lg border bg-slate-50 p-3">
          <Button variant="outline" size="sm" onClick={handleDownloadRa} disabled={isGeneratingRa}>
            {isGeneratingRa ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Descarca RA
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPontaj} disabled={isGeneratingPontaj}>
            {isGeneratingPontaj ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Descarca pontaj
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descarca PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadOpisXls} disabled={isGeneratingOpisXls}>
            {isGeneratingOpisXls ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            OPIS XLS
          </Button>
        </div>

        {reportStatus && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {statusMeta && <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>}
                  {formattedSentDate && (
                    <span className="text-xs text-slate-500">Trimis: {formattedSentDate}</span>
                  )}
                  {verification?.status && (
                    <Badge variant="outline" className="text-[10px]">
                      Verificare: {verification.status}
                    </Badge>
                  )}
                </div>
                {reportStatus.pmNotes && (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                    Observatii PM: {reportStatus.pmNotes}
                  </p>
                )}
              </div>

              {canManagePmReview && (
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runReviewAction('in_review', onSetInReview)}
                    disabled={reviewAction !== null || reportStatus.status === 'in_review'}
                  >
                    {reviewAction === 'in_review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    In verificare
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runReviewAction('clarifications', onRequestClarifications)}
                    disabled={reviewAction !== null}
                  >
                    {reviewAction === 'clarifications' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                    Cere clarificari
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runReviewAction('rejected', onRejectMonth)}
                    disabled={reviewAction !== null}
                  >
                    {reviewAction === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Respinge
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runReviewAction('approved', onApproveMonth)}
                    disabled={reviewAction !== null || reportStatus.status === 'approved'}
                  >
                    {reviewAction === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Aproba luna
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-5 gap-2 py-3 border-y border-slate-200">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.totalHours}h</div>
            <div className="text-[10px] text-slate-500">Ore totale</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.workDays}</div>
            <div className="text-[10px] text-slate-500">Zile lucrate</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.totalActivities}</div>
            <div className="text-[10px] text-slate-500">Activitati</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">{stats.totalDeliverables}</div>
            <div className="text-[10px] text-slate-500">Livrabile</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${stats.openIssues > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stats.openIssues}
            </div>
            <div className="text-[10px] text-slate-500">Neconformitati</div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sectiunea-a" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Sectiunea A - Activitati
            </TabsTrigger>
            <TabsTrigger value="sectiunea-b" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" />
              Sectiunea B - Documente
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="mt-3 min-h-0 flex-1 overflow-y-auto pr-3">
            {/* Section A - Activities */}
            <TabsContent value="sectiunea-a" className="mt-0 space-y-4">
              <Card id="dossier-problems" className={initialFocus?.issueType === 'problems' ? 'border-amber-300' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Probleme si clarificari
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clarificationThreads.length === 0 && neconformitati.length === 0 ? (
                    <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-500">
                      Nu exista clarificari sau neconformitati inregistrate pentru dosarul curent.
                    </div>
                  ) : null}
                  {clarificationThreads.map((thread) => (
                    <div key={thread.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{clarificationStatusLabel(thread.status)}</span>
                        <Badge variant={thread.status === 'resolved' ? 'secondary' : 'outline'}>{thread.targetType}</Badge>
                      </div>
                      <p className="mt-2 leading-5">{thread.pmMessage}</p>
                      {thread.expertResponse ? (
                        <p className="mt-2 rounded bg-white/70 p-2 text-amber-950">Raspuns expert: {thread.expertResponse}</p>
                      ) : null}
                      <div className="mt-2 text-[10px] text-amber-800">
                        Ceruta: {thread.requestedAt ? new Date(thread.requestedAt).toLocaleString('ro-RO') : 'data lipsa'}
                        {thread.answeredAt ? ` / raspuns: ${new Date(thread.answeredAt).toLocaleString('ro-RO')}` : ''}
                        {thread.resolvedAt ? ` / rezolvata: ${new Date(thread.resolvedAt).toLocaleString('ro-RO')}` : ''}
                      </div>
                    </div>
                  ))}
                  {neconformitati.filter((item) => !item.resolved).map((item) => (
                    <div key={item.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                      <Badge variant="destructive" className="mb-2">{item.type}</Badge>
                      <div>{item.description}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Activities by Type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Activitati per SA</CardTitle>
                </CardHeader>
                <CardContent>
                  {activitiesByType.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      Nicio activitate inregistrata
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activitiesByType.map(([type, groups]) => (
                        <div key={type}>
                          <div className="flex justify-between items-center mb-2">
                            <Badge variant="outline" className="text-xs">{type}</Badge>
                            <span className="text-xs text-slate-500">
                              {groups.length} activitati · {groups.reduce((s, group) => s + group.totalHours, 0)}h
                            </span>
                          </div>
                          <div className="space-y-2 pl-3 border-l-2 border-slate-200">
                            {groups.map(group => {
                              const datesLabel = group.dates.map(formatActivityDay).join(', ');
                              const fullDatesLabel = group.dates.map(formatActivityDate).join(', ');
                              const isApproved = group.activities.every((activity) => activity.status === 'approved');
                              const hasClarification = group.activities.some((activity) => Boolean(activity.pmNotes));
                              const approveActionId = `approve-${group.key}`;
                              const clarificationActionId = `clarification-${group.key}`;

                              return (
                                <div id={`dossier-activity-${group.representative.id}`} key={group.key} className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
                                  <div className="flex justify-between items-start gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex gap-2">
                                      <span className="text-slate-400 w-20 shrink-0">{fullDatesLabel}</span>
                                      <span className="font-medium text-slate-700">{group.saCode} · {group.title}</span>
                                    </div>
                                    {group.description && (
                                      <p className="mt-1 pl-12 text-[11px] leading-5 text-slate-500">
                                        In zilele de {datesLabel} am {group.description}
                                      </p>
                                    )}
                                    {(group.deliverables.length || 0) > 0 && (
                                      <div className="mt-2 space-y-1 pl-12">
                                        {group.deliverables.map((deliverable, deliverableIndex) => {
                                          const dossierDeliverable = deliverable as DossierDeliverable;
                                          const deliverableKey = getDeliverableKey(dossierDeliverable, deliverableIndex);
                                          const hasSource = hasDeliverableSource(dossierDeliverable);
                                          const isOpening = documentActionId === `open-${deliverableKey}`;
                                          const isDownloading = documentActionId === `download-${deliverableKey}`;
                                          const fileName = getDeliverableFileName(deliverable);

                                          return (
                                            <div
                                              id={deliverable.documentId ? `dossier-document-${deliverable.documentId}` : undefined}
                                              key={deliverable.id || deliverable.fileName || deliverableIndex}
                                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-slate-50 px-2 py-1.5"
                                            >
                                              <div className="min-w-0">
                                                <div className="truncate text-[11px] font-medium text-slate-800">{fileName}</div>
                                                <div className="truncate text-[10px] text-slate-500">Titlu detectat: {getDeliverableTitle(deliverable)}</div>
                                              </div>
                                              <div className="flex shrink-0 gap-1">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 px-2 text-[10px]"
                                                  onClick={() => openDeliverable(dossierDeliverable, deliverableIndex)}
                                                  disabled={!hasSource || documentActionId !== null}
                                                >
                                                  {isOpening ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                                  Deschide
                                                </Button>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 px-2 text-[10px]"
                                                  onClick={() => downloadDeliverable(dossierDeliverable, deliverableIndex)}
                                                  disabled={!hasSource || documentActionId !== null}
                                                >
                                                  {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                                  Descarca
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {group.representative.gdprTemplateCode && (
                                      <GdprPmSummary activity={group.representative} />
                                    )}
                                    {hasClarification && (
                                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                                        Clarificare PM: {group.activities.find((activity) => activity.pmNotes)?.pmNotes}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="text-slate-500">{group.totalHours}h</span>
                                    {isApproved && (
                                      <Badge variant="outline" className="border-green-200 bg-green-50 text-[10px] text-green-700">
                                        conform
                                      </Badge>
                                    )}
                                  </div>
                                  </div>
                                  {canManagePmReview && (
                                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[10px]"
                                        onClick={() => runActivityAction('approve', group, onApproveActivity)}
                                        disabled={!onApproveActivity || activityActionId !== null || isApproved}
                                        title="Marcheaza activitatea ca fiind conforma"
                                      >
                                        {activityActionId === approveActionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                        Bifeaza conform
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[10px]"
                                        onClick={() => runActivityAction('clarification', group, onRequestActivityClarification)}
                                        disabled={!onRequestActivityClarification || activityActionId !== null}
                                        title="Cere clarificari pentru aceasta activitate"
                                      >
                                        {activityActionId === clarificationActionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                                        Cere clarificari
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Calendar View */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Calendar Activitati</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: 31 }, (_, i) => {
                      const day = i + 1;
                      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const dayActs = activities.filter(a => a.date === dayStr);
                      const dayHours = dayActs.reduce((s, a) => s + (a.hours || 0), 0);
                      
                      return (
                        <div
                          key={day}
                          className={`w-7 h-7 rounded text-[10px] flex items-center justify-center ${
                            dayHours > 0 
                              ? dayHours > 4 ? 'bg-green-500 text-white' : 'bg-green-200 text-green-800'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                          title={`${day} ${monthName}: ${dayHours}h`}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Issues */}
              {neconformitati.length > 0 && (
                <Card className={stats.openIssues > 0 ? 'border-red-200' : ''}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${stats.openIssues > 0 ? 'text-red-600' : 'text-green-600'}`} />
                      Neconformitati
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {neconformitati.map(nc => (
                        <div 
                          key={nc.id} 
                          className={`p-2 rounded-lg border text-xs ${
                            nc.resolved 
                              ? 'border-green-200 bg-green-50' 
                              : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <Badge variant={nc.resolved ? 'secondary' : 'destructive'} className="text-[10px] mb-1">
                                {nc.type}
                              </Badge>
                              <div className="text-slate-700">{nc.description}</div>
                            </div>
                            {nc.resolved ? (
                              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                            )}
                          </div>
                          {nc.resolution && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Rezolvare: {nc.resolution}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Section B - Documents */}
            <TabsContent value="sectiunea-b" className="mt-0 space-y-4">
              {/* Download OPIS */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Export OPIS</div>
                      <div className="text-xs text-slate-500">
                        Genereaza documentul OPIS cu lista livrabilelor
                      </div>
                    </div>
                    <Button onClick={handleDownloadOpis} disabled={isGeneratingOpis} size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      {isGeneratingOpis ? 'Se genereaza...' : 'Descarca OPIS'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Deliverables List */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lista Livrabile</CardTitle>
                  <CardDescription className="text-xs">
                    Toate documentele incarcate pentru {monthName} {year}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {documentError && (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {documentError}
                    </div>
                  )}
                  {allDeliverables.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Niciun livrabil incarcat
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allDeliverables.map((deliv, i) => {
                        const dt = new Date(deliv.activityDate || '');
                        const ds = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                        const deliverableKey = getDeliverableKey(deliv, i);
                        const hasSource = hasDeliverableSource(deliv);
                        const isOpening = documentActionId === `open-${deliverableKey}`;
                        const isDownloading = documentActionId === `download-${deliverableKey}`;
                        const deliverableTitle = getDeliverableTitle(deliv);
                        const fileName = getDeliverableFileName(deliv);
                        
                        return (
                          <div key={i} className="flex items-start gap-3 p-2 bg-slate-50 rounded-lg">
                            <div className="text-[10px] text-slate-400 font-mono w-8">{i + 1}.</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {fileName}
                              </div>
                              <div className="mt-0.5 text-[11px] font-medium text-slate-700">
                                Titlu livrabil: {deliverableTitle}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {ds} · {deliv.saCode || 'SA neprecizata'} · {deliv.activityType || 'Activitate'} · {deliv.activityTitle}
                              </div>
                              {!hasSource && (
                                <div className="mt-1 text-[10px] text-amber-700">
                                  Fisier indisponibil
                                </div>
                              )}
                            </div>
                            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
                              <Badge variant="outline" className="text-[9px]">
                                {deliv.fileType || 'DOC'}
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => openDeliverable(deliv, i)}
                                disabled={!hasSource || documentActionId !== null}
                                title={hasSource ? 'Deschide livrabilul' : 'Fisier indisponibil'}
                              >
                                {isOpening ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                Deschide
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => downloadDeliverable(deliv, i)}
                                disabled={!hasSource || documentActionId !== null}
                                title={hasSource ? 'Descarca livrabilul' : 'Fisier indisponibil'}
                              >
                                {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                Descarca
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Document Checklist */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Checklist Documente</CardTitle>
                  <CardDescription className="text-xs">Verificare completitudine dosar</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { label: 'Pontaj semnat', ok: stats.totalHours > 0 },
                      { label: 'Raport activitate', ok: stats.totalActivities > 0 },
                      { label: 'Livrabile incarcate', ok: stats.totalDeliverables > 0 },
                      { label: 'OPIS generat', ok: false },
                      { label: 'Fara neconformitati deschise', ok: stats.openIssues === 0 },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          item.ok ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {item.ok ? '✓' : '○'}
                        </div>
                        <span className={item.ok ? 'text-slate-900' : 'text-slate-500'}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
