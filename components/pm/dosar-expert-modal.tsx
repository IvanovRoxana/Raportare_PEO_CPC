'use client';

import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useActivityCatalog,
  useActivityMutations,
  useDocumentMutations,
  useReportingWorkBlockBundles,
} from '@/hooks/use-backend-data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  ActivityCatalog,
  PmReviewCaseCreateInput,
} from '@/lib/types';
import fallbackActivityCatalog from '@/data/import/activity-catalog.json';
import { mergeActivityCatalogs } from '@/lib/activity-catalog-merge';
import { generateOpisDocument, downloadOpis } from '@/lib/opis-generator';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import { getDocumentAuditTitle } from '@/lib/document-sharing';
import { dedupeDeliverablesBySignature } from '@/lib/deliverable-deduplication';
import { GDPR_CONCLUSION_OPTIONS, getGdprDeliverableRequirementLabel, getGdprMinimumEvidenceLabels, getGdprTemplate, parseGdprMetaJson, validateGdprActivityDraft } from '@/lib/gdpr-reporting';
import { ANEXA10_EXPORT_SETTINGS, buildAnexa10ReportModel } from '@/lib/activity-report/build-report-model';
import { buildAnexa10DocxBlob, buildAnexa10DocxFilename } from '@/lib/activity-report/docx-export';
import { assertCanExportAnexa10Docx } from '@/lib/activity-report/export-readiness';
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
  onRequestActivityClarification?: (activities: Activity[]) => Promise<{ pmNotes?: string } | void> | { pmNotes?: string } | void;
  onCreatePmReviewCase?: (input: PmReviewCaseCreateInput) => Promise<unknown> | void;
  onApprovePmUnlock?: (document: DocumentMetadata) => Promise<void> | void;
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

type FocusedEligibilityCheck = NonNullable<DocumentMetadata['eligibilityCheck']>;

function isApprovedOrEligibleEligibilityCheck(check?: DocumentMetadata['eligibilityCheck'] | Deliverable['eligibilityCheck']) {
  return Boolean(check?.pmUnlockApproved || check?.status === 'eligibil' || check?.status === 'eligibil_cu_observatii');
}

function resolveFocusedEligibilityCheck(
  documentCheck?: DocumentMetadata['eligibilityCheck'],
  deliverableCheck?: Deliverable['eligibilityCheck'],
): FocusedEligibilityCheck | null {
  if (isApprovedOrEligibleEligibilityCheck(documentCheck)) return documentCheck as FocusedEligibilityCheck;
  if (isApprovedOrEligibleEligibilityCheck(deliverableCheck)) return deliverableCheck as FocusedEligibilityCheck;
  return (documentCheck || deliverableCheck || null) as FocusedEligibilityCheck | null;
}

function getEligibilityLabel(status?: string) {
  if (status === 'eligibil') return 'Livrabil eligibil';
  if (status === 'eligibil_cu_observatii') return 'Livrabil eligibil cu observatii';
  if (status === 'neeligibil') return 'Livrabil neeligibil';
  if (status === 'neconcludent') return 'Livrabil neconcludent';
  return 'Eligibilitate neprecizata';
}

function getEligibilityBadgeClass(status?: string) {
  if (status === 'eligibil') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (status === 'eligibil_cu_observatii') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (status === 'neeligibil') return 'border-red-300 bg-red-50 text-red-700';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function splitCatalogDeliverables(value?: string | null) {
  return (value || '')
    .split(/\s*\|\s*|\r?\n|\s*;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFileExtension(fileName?: string) {
  const match = fileName?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function isDocxPreviewFile(fileName?: string, mimeType?: string) {
  const extension = getFileExtension(fileName);
  return extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function canEmbedPreview(fileName?: string, mimeType?: string) {
  const extension = getFileExtension(fileName);
  return mimeType?.includes('pdf')
    || mimeType?.startsWith('image/')
    || ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt'].includes(extension);
}

function buildDocxPreviewHtml(bodyHtml: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        background: #f8fafc;
        color: #0f172a;
        font-family: Calibri, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.55;
      }
      .page {
        box-sizing: border-box;
        max-width: 900px;
        min-height: calc(100vh - 32px);
        margin: 16px auto;
        padding: 48px 56px;
        background: #fff;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      td, th {
        border: 1px solid #cbd5e1;
        padding: 6px 8px;
        vertical-align: top;
      }
      img {
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <main class="page">${bodyHtml || '<p>Documentul nu conține text convertibil pentru preview.</p>'}</main>
  </body>
</html>`;
}

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
  onCreatePmReviewCase,
  onApprovePmUnlock,
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
  const [inlinePreview, setInlinePreview] = useState<{ url: string; fileName: string; objectUrl?: string } | null>(null);
  const [docxPreviewHtml, setDocxPreviewHtml] = useState<string | null>(null);
  const [docxPreviewError, setDocxPreviewError] = useState<string | null>(null);
  const [inlinePreviewLoading, setInlinePreviewLoading] = useState(false);
  const [localActivityReviewOverrides, setLocalActivityReviewOverrides] = useState<Map<string, Pick<Activity, 'status' | 'pmNotes'>>>(new Map());
  const [selectedEligibilityCategories, setSelectedEligibilityCategories] = useState<string[]>([]);
  const [eligibilitySaCode, setEligibilitySaCode] = useState('');
  const [eligibilityCatalogActivityId, setEligibilityCatalogActivityId] = useState('');
  const [eligibilityDeliverableType, setEligibilityDeliverableType] = useState('');
  const [eligibilityNotes, setEligibilityNotes] = useState('');
  const [isSavingEligibilityAssignment, setIsSavingEligibilityAssignment] = useState(false);
  const [eligibilityAssignmentMessage, setEligibilityAssignmentMessage] = useState<string | null>(null);
  const { catalog: backendActivityCatalog } = useActivityCatalog();
  const { update: updateActivity } = useActivityMutations();
  const { update: updateDocument } = useDocumentMutations();
  const {
    bundles: persistedRaWorkBlockBundles,
    isLoading: isLoadingRaWorkBlockBundles,
    isRefreshing: isRefreshingRaWorkBlockBundles,
  } = useReportingWorkBlockBundles(expert?.id ?? null, month, year);

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

  useEffect(() => {
    if (!open) setLocalActivityReviewOverrides(new Map());
  }, [open]);

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

  const displayActivities = useMemo(() => {
    if (localActivityReviewOverrides.size === 0) return activities;
    return activities.map((activity) => {
      const override = localActivityReviewOverrides.get(activity.id);
      return override ? { ...activity, ...override } : activity;
    });
  }, [activities, localActivityReviewOverrides]);

  // Group activities by SA and consolidate multi-day entries from the same pontaj thread.
  const activitiesByType = useMemo(() => {
    const byType: Record<string, DossierActivityGroup[]> = {};
    const groupsByKey = new Map<string, DossierActivityGroup>();

    displayActivities.forEach(act => {
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
  }, [displayActivities]);

  const documentsById = useMemo(() => {
    return new Map(documents.map((document) => [document.id, document]));
  }, [documents]);

  // All deliverables
  const allDeliverables = useMemo<DossierDeliverable[]>(() => {
    return dedupeDeliverablesBySignature(activities.flatMap(act => 
      (act.deliverables || []).map((d): DossierDeliverable => ({
        ...d,
        activityId: d.activityId || act.id,
        activityDate: act.date,
        activityTitle: act.title,
        activityType: act.activityType,
      }))
    )).sort((a, b) => (a.activityDate || '').localeCompare(b.activityDate || ''));
  }, [activities]);

  const focusedDocument = initialFocus?.documentId ? documentsById.get(initialFocus.documentId) : undefined;
  const focusedDeliverableIndex = initialFocus?.documentId
    ? allDeliverables.findIndex((deliverable) => deliverable.documentId === initialFocus.documentId || deliverable.id === initialFocus.documentId)
    : -1;
  const focusedDeliverable = focusedDeliverableIndex >= 0 ? allDeliverables[focusedDeliverableIndex] : null;
  const focusedEligibilityCheck = resolveFocusedEligibilityCheck(
    focusedDocument?.eligibilityCheck,
    focusedDeliverable?.eligibilityCheck,
  );
  const focusedSourceActivity = useMemo(() => {
    if (focusedDeliverable?.activityId) {
      const directActivity = activities.find((activity) => activity.id === focusedDeliverable.activityId);
      if (directActivity) return directActivity;
    }
    if (focusedDocument?.sourceActivityId) {
      const documentActivity = activities.find((activity) => activity.id === focusedDocument.sourceActivityId);
      if (documentActivity) return documentActivity;
    }
    return activities.find((activity) => (activity.deliverables || []).some((deliverable) => (
      deliverable.documentId === focusedDocument?.id
      || deliverable.id === focusedDocument?.id
      || deliverable.id === focusedDeliverable?.id
    ))) || null;
  }, [activities, focusedDeliverable?.activityId, focusedDeliverable?.id, focusedDocument?.id, focusedDocument?.sourceActivityId]);
  const activityCatalog = useMemo(() => {
    return mergeActivityCatalogs(fallbackActivityCatalog as ActivityCatalog[], backendActivityCatalog);
  }, [backendActivityCatalog]);
  const categoryOptions = useMemo(() => {
    return Array.from(new Set(activityCatalog.map((item) => item.category).filter(Boolean))).sort();
  }, [activityCatalog]);
  const filteredEligibilityCatalog = useMemo(() => {
    return activityCatalog.filter((item) => (
      item.isActive !== false
      && (selectedEligibilityCategories.length === 0 || selectedEligibilityCategories.includes(item.category))
    ));
  }, [activityCatalog, selectedEligibilityCategories]);
  const eligibilitySaOptions = useMemo(() => {
    return Array.from(new Set(filteredEligibilityCatalog.map((item) => item.saCode).filter(Boolean))).sort();
  }, [filteredEligibilityCatalog]);
  const eligibilityActivityOptions = useMemo(() => {
    return filteredEligibilityCatalog
      .filter((item) => !eligibilitySaCode || item.saCode === eligibilitySaCode)
      .sort((a, b) => (a.activityNumber || 0) - (b.activityNumber || 0) || a.activityName.localeCompare(b.activityName));
  }, [eligibilitySaCode, filteredEligibilityCatalog]);
  const selectedEligibilityCatalogActivity = useMemo(() => {
    return activityCatalog.find((item) => item.id === eligibilityCatalogActivityId) || null;
  }, [activityCatalog, eligibilityCatalogActivityId]);
  const eligibilityDeliverableOptions = useMemo(() => {
    return splitCatalogDeliverables(selectedEligibilityCatalogActivity?.deliverables);
  }, [selectedEligibilityCatalogActivity?.deliverables]);
  const focusedPreviewFileName = inlinePreview?.fileName
    || focusedDocument?.originalFileName
    || (focusedDeliverable ? getDeliverableFileName(focusedDeliverable) : 'Fisier');
  const focusedPreviewText = (
    focusedDocument?.docText
    || focusedDocument?.firstPageText
    || focusedDeliverable?.docText
    || focusedDeliverable?.firstPageText
    || ''
  ).trim();
  const shouldEmbedFocusedPreview = canEmbedPreview(
    focusedPreviewFileName,
    focusedDocument?.mimeType || focusedDeliverable?.fileType,
  );
  const isFocusedEligibilityDossier = Boolean(
    initialFocus?.documentId
    && (
      initialFocus.issueType === 'pm_unlock_requests'
      || initialFocus.issueType === 'pm_unlock_requested'
      || initialFocus.issueType === 'eligibility_manual_review'
      || initialFocus.issueType === 'eligibility_ai_review'
      || initialFocus.issueType === 'eligibility_rules'
    )
  );

  useEffect(() => {
    if (!open || !isFocusedEligibilityDossier) return;
    const initialCatalogId = focusedEligibilityCheck?.checkedActivityId
      || focusedSourceActivity?.catalogActivityId
      || '';
    const initialCatalogActivity = initialCatalogId
      ? activityCatalog.find((item) => item.id === initialCatalogId)
      : null;
    const initialSaCode = focusedEligibilityCheck?.checkedSaCode
      || initialCatalogActivity?.saCode
      || focusedSourceActivity?.saCode
      || focusedDeliverable?.saCode
      || focusedDocument?.saCode
      || '';
    const initialDeliverableType = focusedEligibilityCheck?.checkedDeliverableType
      || focusedDocument?.deliverableType
      || focusedDeliverable?.deliverableType
      || '';
    const initialCategory = initialCatalogActivity?.category
      || focusedDeliverable?.category
      || '';

    setEligibilitySaCode(initialSaCode);
    setEligibilityCatalogActivityId(initialCatalogId);
    setEligibilityDeliverableType(initialDeliverableType);
    setEligibilityNotes('');
    setEligibilityAssignmentMessage(null);
    setSelectedEligibilityCategories(initialCategory ? [initialCategory] : []);
  }, [
    activityCatalog,
    focusedDeliverable?.category,
    focusedDeliverable?.deliverableType,
    focusedDeliverable?.saCode,
    focusedDocument?.deliverableType,
    focusedDocument?.saCode,
    focusedEligibilityCheck,
    focusedSourceActivity?.catalogActivityId,
    focusedSourceActivity?.saCode,
    isFocusedEligibilityDossier,
    open,
  ]);

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

  const resolveFocusedDocumentUrl = async () => {
    if (focusedDeliverable) return resolveDeliverableUrl(focusedDeliverable);
    if (focusedDocument?.s3Key) {
      const result = await getSecureDocumentUrl(focusedDocument);
      return { url: result.url, fileName: result.fileName, shouldRevoke: false };
    }
    throw new Error('Fisier indisponibil.');
  };

  const saveEligibilityAssignment = async () => {
    if (!focusedSourceActivity || !focusedDocument) {
      setEligibilityAssignmentMessage('Nu am gasit activitatea sursa pentru acest livrabil.');
      return;
    }
    if (!selectedEligibilityCatalogActivity || !eligibilityDeliverableType.trim()) {
      setEligibilityAssignmentMessage('Alege activitatea din catalog si tipul de livrabil.');
      return;
    }

    setIsSavingEligibilityAssignment(true);
    setEligibilityAssignmentMessage(null);
    try {
      const now = new Date().toISOString();
      const checkedDeliverableType = eligibilityDeliverableType.trim();
      const nextCheck: FocusedEligibilityCheck = {
        ...(focusedEligibilityCheck || {
          status: 'eligibil_cu_observatii',
          score: 75,
          summary: '',
          checks: [],
          missingElements: [],
          recommendations: [],
          riskFlags: [],
        }),
        status: 'eligibil_cu_observatii',
        score: Math.max(Number(focusedEligibilityCheck?.score) || 0, 75),
        summary: eligibilityNotes.trim()
          || `Reincadrare PM: ${selectedEligibilityCatalogActivity.saCode} - ${selectedEligibilityCatalogActivity.activityName}; livrabil: ${checkedDeliverableType}.`,
        checkedAt: now,
        checkedBy: 'PM',
        checkedActivityId: selectedEligibilityCatalogActivity.id,
        checkedSaCode: selectedEligibilityCatalogActivity.saCode,
        checkedActivityName: selectedEligibilityCatalogActivity.activityName,
        checkedDeliverableType,
        suggestedSettings: {
          ...(focusedEligibilityCheck?.suggestedSettings || {
            confidence: 'high',
            reason: 'Reincadrare manuala PM.',
            changes: ['activity', 'deliverableType'],
          }),
          saCode: selectedEligibilityCatalogActivity.saCode,
          activityName: selectedEligibilityCatalogActivity.activityName,
          selectedActivityId: selectedEligibilityCatalogActivity.id,
          deliverableType: checkedDeliverableType,
          confidence: 'high',
          reason: eligibilityNotes.trim() || 'Reincadrare manuala PM.',
          changes: ['activity', 'deliverableType'],
        },
        pmUnlockResolvedByCorrection: true,
        pmUnlockResolvedAt: now,
      };
      const matchesFocusedDeliverable = (deliverable: Deliverable) => (
        deliverable.documentId === focusedDocument.id
        || deliverable.id === focusedDocument.id
        || deliverable.id === focusedDeliverable?.id
        || Boolean(focusedDocument.s3Key && deliverable.s3Key === focusedDocument.s3Key)
        || Boolean(focusedDocument.fileHash && deliverable.fileHash === focusedDocument.fileHash)
        || Boolean(focusedDocument.firstPageTextHash && deliverable.firstPageTextHash === focusedDocument.firstPageTextHash)
        || Boolean(focusedDocument.contentFingerprint && deliverable.contentFingerprint === focusedDocument.contentFingerprint)
      );

      await updateActivity(focusedSourceActivity.id, {
        saCode: selectedEligibilityCatalogActivity.saCode,
        catalogActivityId: selectedEligibilityCatalogActivity.id,
        activityType: selectedEligibilityCatalogActivity.activityName,
        title: selectedEligibilityCatalogActivity.activityName,
        deliverables: (focusedSourceActivity.deliverables || []).map((deliverable) => (
          matchesFocusedDeliverable(deliverable)
            ? {
                ...deliverable,
                saCode: selectedEligibilityCatalogActivity.saCode,
                category: selectedEligibilityCatalogActivity.category,
                deliverableType: checkedDeliverableType,
                eligibilityCheck: nextCheck,
              }
            : deliverable
        )),
      });
      await updateDocument(focusedDocument.id, {
        sourceActivityId: focusedSourceActivity.id,
        activityDate: focusedSourceActivity.date || focusedDocument.activityDate,
        saCode: selectedEligibilityCatalogActivity.saCode,
        deliverableType: checkedDeliverableType,
        stadiu: focusedDeliverable?.stadiu || focusedDocument.stadiu,
        eligibilityCheck: nextCheck,
      });
      setEligibilityAssignmentMessage('Reincadrarea a fost salvata in activitatea sursa si in metadatele documentului.');
    } catch (error) {
      setEligibilityAssignmentMessage(error instanceof Error ? error.message : 'Reincadrarea nu a putut fi salvata.');
    } finally {
      setIsSavingEligibilityAssignment(false);
    }
  };

  useEffect(() => {
    if (!open || !isFocusedEligibilityDossier) return;
    let cancelled = false;
    let objectUrl: string | undefined;

    setInlinePreviewLoading(true);
    setDocumentError(null);
    setInlinePreview(null);
    setDocxPreviewHtml(null);
    setDocxPreviewError(null);

    resolveFocusedDocumentUrl()
      .then(async (result) => {
        if (cancelled) return;
        if (result.shouldRevoke) {
          objectUrl = result.url;
        }
        const response = await fetch(result.url);
        if (!response.ok) throw new Error('Fisierul nu a putut fi preluat pentru previzualizare.');
        const blob = await response.blob();
        if (!objectUrl) objectUrl = URL.createObjectURL(blob);
        if (cancelled) return;
        setInlinePreview({ url: objectUrl, fileName: result.fileName, objectUrl });
        if (isDocxPreviewFile(result.fileName, blob.type)) {
          try {
            const mammoth = await import('mammoth');
            const converted = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
            if (!cancelled) setDocxPreviewHtml(buildDocxPreviewHtml(converted.value));
          } catch {
            if (!cancelled) setDocxPreviewError('Preview-ul DOCX nu a putut fi randat. Poți deschide fișierul în tab nou.');
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setDocumentError(error instanceof Error ? error.message : 'Fisierul nu a putut fi previzualizat.');
      })
      .finally(() => {
        if (!cancelled) setInlinePreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [focusedDeliverable, focusedDocument, isFocusedEligibilityDossier, open]);

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
    setDocumentError(null);
    try {
      if (isLoadingRaWorkBlockBundles || isRefreshingRaWorkBlockBundles) {
        throw new Error('Se incarca work block-urile salvate. Asteapta finalizarea incarcarii si incearca din nou.');
      }
      const model = buildAnexa10ReportModel({
        expert,
        activities,
        month,
        year,
        workBlockBundles: persistedRaWorkBlockBundles.length > 0 ? persistedRaWorkBlockBundles : undefined,
        settings: ANEXA10_EXPORT_SETTINGS,
      });
      assertCanExportAnexa10Docx(model, {
        usesPersistedWorkBlocks: persistedRaWorkBlockBundles.length > 0,
      });
      const blob = await buildAnexa10DocxBlob(model);
      saveBlob(blob, buildAnexa10DocxFilename(model));
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Exportul Raportului de Activitate a fost blocat.');
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
    handler?: (activities: Activity[]) => Promise<{ pmNotes?: string } | void> | { pmNotes?: string } | void
  ) => {
    if (!handler) return;

    setActivityActionId(`${action}-${group.key}`);
    setDocumentError(null);
    try {
      const result = await handler(group.activities);
      if (action === 'approve') {
        setLocalActivityReviewOverrides((current) => {
          const next = new Map(current);
          group.activities.forEach((activity) => next.set(activity.id, { status: 'approved', pmNotes: '' }));
          return next;
        });
      } else if (action === 'clarification') {
        const pmNotes = result && 'pmNotes' in result && result.pmNotes
          ? result.pmNotes
          : 'Clarificari solicitate de PM pentru aceasta activitate.';
        setLocalActivityReviewOverrides((current) => {
          const next = new Map(current);
          group.activities.forEach((activity) => next.set(activity.id, {
            status: 'sent',
            pmNotes,
          }));
          return next;
        });
      }
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Actiunea PM nu a putut fi salvata.');
    } finally {
      setActivityActionId(null);
    }
  };

  const createActivityPmReviewCase = async (group: DossierActivityGroup) => {
    if (!expert || !onCreatePmReviewCase) return;
    const title = window.prompt('Titlul cazului PM:', `${group.saCode} - ${group.title}`);
    if (title === null) return;
    const description = window.prompt('Descriere / ce trebuie verificat:', group.description || group.title);
    if (description === null) return;
    const priorityInput = window.prompt('Prioritate: low, medium, high sau blocking', 'medium');
    if (priorityInput === null) return;
    const priority = ['low', 'medium', 'high', 'blocking'].includes(priorityInput.trim())
      ? priorityInput.trim()
      : 'medium';

    setActivityActionId(`case-${group.key}`);
    setDocumentError(null);
    try {
      await onCreatePmReviewCase({
        expertId: expert.id,
        expertName: expert.name,
        projectCode,
        month,
        year,
        subjectType: 'activity',
        subjectId: group.representative.id,
        sourceActivityId: group.representative.id,
        subjectLabel: `${group.saCode} · ${group.title}`,
        title: title.trim() || `${group.saCode} - ${group.title}`,
        description: description.trim() || 'Caz PM creat punctual din dosarul expertului.',
        priority,
        status: 'open',
      });
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Cazul PM nu a putut fi creat.');
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

        {!isFocusedEligibilityDossier && (
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
        )}

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
                    {reportStatus.status === 'approved' ? 'Redeschide raportarea' : 'In verificare'}
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

        {!isFocusedEligibilityDossier && (
        <>
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
        </>
        )}

        {isFocusedEligibilityDossier ? (
          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
            <ScrollArea className="min-h-0 rounded-lg border bg-white">
              <div className="space-y-4 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={getEligibilityBadgeClass(focusedEligibilityCheck?.status)}>
                      {getEligibilityLabel(focusedEligibilityCheck?.status)}
                    </Badge>
                    {focusedEligibilityCheck?.pmUnlockApproved ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Deblocare PM aprobata
                      </Badge>
                    ) : focusedEligibilityCheck?.pmUnlockRequested ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Deblocare PM solicitată</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">
                    {focusedDocument?.declaredTitle
                      || focusedDocument?.extractedTitle
                      || (focusedDeliverable ? getDeliverableTitle(focusedDeliverable) : null)
                      || focusedDocument?.originalFileName
                      || 'Livrabil'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {focusedDocument?.originalFileName || (focusedDeliverable ? getDeliverableFileName(focusedDeliverable) : '')}
                  </p>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Context activitate</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-600">
                    <div><span className="font-semibold text-slate-800">SA:</span> {focusedEligibilityCheck?.checkedSaCode || focusedDeliverable?.saCode || 'neprecizată'}</div>
                    <div><span className="font-semibold text-slate-800">Activitate:</span> {focusedEligibilityCheck?.checkedActivityName || focusedDeliverable?.activityTitle || focusedDeliverable?.activityType || 'neidentificată'}</div>
                    <div><span className="font-semibold text-slate-800">Data:</span> {focusedDeliverable?.activityDate || focusedDocument?.uploadDate?.slice(0, 10) || '-'}</div>
                    <div><span className="font-semibold text-slate-800">Tip livrabil:</span> {focusedEligibilityCheck?.checkedDeliverableType || focusedDocument?.deliverableType || focusedDeliverable?.deliverableType || '-'}</div>
                  </CardContent>
                </Card>

                {isFocusedEligibilityDossier && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Reincadrare PM</CardTitle>
                      <CardDescription className="text-xs">
                        Modifica incadrarea si salveaza direct in activitatea sursa.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="space-y-2">
                        <Label className="text-xs">Categorii expert</Label>
                        <div className="flex flex-wrap gap-2">
                          {categoryOptions.map((category) => {
                            const checked = selectedEligibilityCategories.includes(category);
                            return (
                              <Label key={category} className="rounded-md border bg-white px-2 py-1 text-xs">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    setSelectedEligibilityCategories((current) => (
                                      value
                                        ? Array.from(new Set([...current, category]))
                                        : current.filter((item) => item !== category)
                                    ));
                                    setEligibilityCatalogActivityId('');
                                    setEligibilityDeliverableType('');
                                  }}
                                />
                                {category.toUpperCase()}
                              </Label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="pm-eligibility-sa" className="text-xs">SA</Label>
                          <Select
                            value={eligibilitySaCode || undefined}
                            onValueChange={(value) => {
                              setEligibilitySaCode(value);
                              setEligibilityCatalogActivityId('');
                              setEligibilityDeliverableType('');
                            }}
                          >
                            <SelectTrigger id="pm-eligibility-sa" className="h-8 text-xs">
                              <SelectValue placeholder="Alege SA" />
                            </SelectTrigger>
                            <SelectContent>
                              {eligibilitySaOptions.map((saCode) => (
                                <SelectItem key={saCode} value={saCode}>{saCode}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="pm-eligibility-deliverable-type" className="text-xs">Tip livrabil</Label>
                          <Select value={eligibilityDeliverableType || undefined} onValueChange={setEligibilityDeliverableType}>
                            <SelectTrigger id="pm-eligibility-deliverable-type" className="h-8 text-xs">
                              <SelectValue placeholder="Alege livrabil" />
                            </SelectTrigger>
                            <SelectContent>
                              {eligibilityDeliverableOptions.map((deliverableType) => (
                                <SelectItem key={deliverableType} value={deliverableType}>{deliverableType}</SelectItem>
                              ))}
                              {eligibilityDeliverableType && !eligibilityDeliverableOptions.includes(eligibilityDeliverableType) ? (
                                <SelectItem value={eligibilityDeliverableType}>{eligibilityDeliverableType}</SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="pm-eligibility-activity" className="text-xs">Activitate catalog</Label>
                        <Select
                          value={eligibilityCatalogActivityId || undefined}
                          onValueChange={(value) => {
                            const catalogActivity = activityCatalog.find((item) => item.id === value);
                            setEligibilityCatalogActivityId(value);
                            setEligibilitySaCode(catalogActivity?.saCode || eligibilitySaCode);
                            const firstDeliverable = splitCatalogDeliverables(catalogActivity?.deliverables)[0];
                            setEligibilityDeliverableType(firstDeliverable || eligibilityDeliverableType);
                          }}
                        >
                          <SelectTrigger id="pm-eligibility-activity" className="h-8 text-xs">
                            <SelectValue placeholder="Alege activitatea" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligibilityActivityOptions.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.saCode} · {item.activityNumber || '-'} · {item.activityName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="pm-eligibility-note" className="text-xs">Nota PM</Label>
                        <Input
                          id="pm-eligibility-note"
                          value={eligibilityNotes}
                          onChange={(event) => setEligibilityNotes(event.target.value)}
                          placeholder="Motivul reincadrarii"
                          className="h-8 text-xs"
                        />
                      </div>

                      {eligibilityAssignmentMessage && (
                        <p className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {eligibilityAssignmentMessage}
                        </p>
                      )}

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveEligibilityAssignment()}
                          disabled={isSavingEligibilityAssignment || !selectedEligibilityCatalogActivity || !eligibilityDeliverableType.trim()}
                        >
                          {isSavingEligibilityAssignment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Salveaza reincadrare
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Verificare AI</CardTitle>
                    <CardDescription className="text-xs">
                      Scor {focusedEligibilityCheck?.score ?? 0}/100
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      {focusedEligibilityCheck?.summary || 'Nu există sumar AI pentru acest livrabil.'}
                    </div>
                    {(focusedEligibilityCheck?.missingElements || []).length > 0 ? (
                      <div>
                        <div className="mb-1 font-semibold text-slate-800">Elemente lipsă</div>
                        <ul className="list-disc space-y-1 pl-4 text-slate-600">
                          {(focusedEligibilityCheck?.missingElements || []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {(focusedEligibilityCheck?.riskFlags || []).length > 0 ? (
                      <div>
                        <div className="mb-1 font-semibold text-slate-800">Riscuri</div>
                        <ul className="list-disc space-y-1 pl-4 text-slate-600">
                          {(focusedEligibilityCheck?.riskFlags || []).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Tracking PM</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-600">
                    <div><span className="font-semibold text-slate-800">Solicitat:</span> {focusedEligibilityCheck?.pmUnlockRequestedAt || '-'}</div>
                    <div><span className="font-semibold text-slate-800">Solicitant:</span> {focusedEligibilityCheck?.pmUnlockRequestedBy || '-'}</div>
                    <div><span className="font-semibold text-slate-800">Motiv:</span> {focusedEligibilityCheck?.pmUnlockReason || '-'}</div>
                    {focusedEligibilityCheck?.pmUnlockApproved ? (
                      <>
                        <div><span className="font-semibold text-slate-800">Aprobat:</span> {focusedEligibilityCheck.pmUnlockApprovedAt || '-'}</div>
                        <div><span className="font-semibold text-slate-800">Aprobat de:</span> {focusedEligibilityCheck.pmUnlockApprovedBy || '-'}</div>
                      </>
                    ) : null}
                    {focusedDocument && focusedEligibilityCheck?.pmUnlockRequested && !focusedEligibilityCheck.pmUnlockApproved ? (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-2"
                        onClick={() => void onApprovePmUnlock?.(focusedDocument)}
                        disabled={!onApprovePmUnlock}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Aproba deblocare PM
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">Preview livrabil</h3>
                  <p className="text-xs text-slate-500">{focusedPreviewFileName}</p>
                </div>
                {inlinePreview ? (
                  <Button size="sm" variant="outline" onClick={() => window.open(inlinePreview.url, '_blank')}>
                    <Eye className="h-4 w-4" />
                    Tab nou
                  </Button>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 bg-slate-100">
                {inlinePreviewLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Se încarcă preview...
                  </div>
                ) : inlinePreview && shouldEmbedFocusedPreview ? (
                  <iframe title="Preview livrabil" src={inlinePreview.url} className="h-full w-full border-0 bg-white" />
                ) : docxPreviewHtml ? (
                  <iframe
                    title="Preview DOCX livrabil"
                    srcDoc={docxPreviewHtml}
                    sandbox=""
                    className="h-full w-full border-0 bg-slate-100"
                  />
                ) : focusedPreviewText ? (
                  <ScrollArea className="h-full bg-white">
                    <div className="space-y-3 p-4">
                      {docxPreviewError ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {docxPreviewError}
                        </div>
                      ) : null}
                      <pre className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{focusedPreviewText}</pre>
                    </div>
                  </ScrollArea>
                ) : inlinePreview ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
                    <FileText className="h-8 w-8 text-slate-400" />
                    <p>Preview intern indisponibil pentru acest format. Deschide fisierul in tab nou.</p>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                    {documentError || 'Preview indisponibil pentru acest fișier.'}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (

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
                              const hasClarification = !isApproved && group.activities.some((activity) => Boolean(activity.pmNotes));
                              const approveActionId = `approve-${group.key}`;
                              const clarificationActionId = `clarification-${group.key}`;
                              const caseActionId = `case-${group.key}`;

                              return (
                                <div
                                  id={`dossier-activity-${group.representative.id}`}
                                  key={group.key}
                                  className={`rounded-lg border p-3 text-xs shadow-sm ${
                                    hasClarification
                                      ? 'border-amber-200 bg-amber-50/40'
                                      : isApproved
                                        ? 'border-green-200 bg-green-50/40'
                                        : 'border-slate-200 bg-white'
                                  }`}
                                >
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
                                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-100/70 px-2 py-1 text-[10px] text-amber-900">
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
                                    {hasClarification && (
                                      <Badge variant="outline" className="border-amber-200 bg-amber-100 text-[10px] text-amber-800">
                                        clarificari cerute
                                      </Badge>
                                    )}
                                  </div>
                                  </div>
                                  {canManagePmReview && (
                                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-2">
                                      <Button
                                        type="button"
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
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[10px]"
                                        onClick={() => runActivityAction('clarification', group, onRequestActivityClarification)}
                                        disabled={!onRequestActivityClarification || activityActionId !== null || hasClarification || isApproved}
                                        title={hasClarification ? 'Clarificarile au fost deja cerute pentru aceasta activitate' : 'Cere clarificari pentru aceasta activitate'}
                                      >
                                        {activityActionId === clarificationActionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                                        Cere clarificari
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-[10px]"
                                        onClick={() => createActivityPmReviewCase(group)}
                                        disabled={!onCreatePmReviewCase || activityActionId !== null}
                                        title="Creeaza un caz PM punctual pentru aceasta activitate"
                                      >
                                        {activityActionId === caseActionId ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                                        Caz PM
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
        )}
      </DialogContent>
    </Dialog>
  );
}
