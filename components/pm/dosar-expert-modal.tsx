'use client';

import { useState, useMemo } from 'react';
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
  Deliverable,
  DocumentMetadata,
  Expert,
  Neconformitate,
  ReportStatus,
  VerificationData,
} from '@/lib/types';
import { generateOpisDocument, downloadOpis } from '@/lib/opis-generator';
import { getSecureDocumentUrl } from '@/lib/document-retrieval';
import { GDPR_CONCLUSION_OPTIONS, getGdprDeliverableRequirementLabel, getGdprMinimumEvidenceLabels, getGdprTemplate, parseGdprMetaJson, validateGdprActivityDraft } from '@/lib/gdpr-reporting';

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
  projectCode?: string;
  projectTitle?: string;
}

type DossierDeliverable = Deliverable & {
  activityDate?: string;
  activityTitle?: string;
  activityType?: string;
};

type ReviewAction = 'in_review' | 'clarifications' | 'rejected' | 'approved';

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
  projectCode = 'PEO',
  projectTitle = 'Program de Educatie si Ocupare',
}: DosarExpertModalProps) {
  const [activeTab, setActiveTab] = useState('sectiunea-a');
  const [isGeneratingOpis, setIsGeneratingOpis] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
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

  // Calculate stats
  const stats = useMemo(() => {
    const totalHours = activities.reduce((sum, a) => sum + (a.hours || 0), 0);
    const totalActivities = activities.length;
    const totalDeliverables = activities.reduce((sum, a) => sum + (a.deliverables?.length || 0), 0);
    const workDays = new Set(activities.map(a => a.date)).size;
    const openIssues = neconformitati.filter(n => !n.resolved).length;
    
    return { totalHours, totalActivities, totalDeliverables, workDays, openIssues };
  }, [activities, neconformitati]);

  // Group activities by type
  const activitiesByType = useMemo(() => {
    const byType: Record<string, Activity[]> = {};
    activities.forEach(act => {
      const type = act.activityType || 'Nespecificat';
      if (!byType[type]) byType[type] = [];
      byType[type].push(act);
    });
    return Object.entries(byType).sort((a, b) => b[1].length - a[1].length);
  }, [activities]);

  const documentsById = useMemo(() => {
    return new Map(documents.map((document) => [document.id, document]));
  }, [documents]);

  // All deliverables
  const allDeliverables = useMemo<DossierDeliverable[]>(() => {
    return activities.flatMap(act => 
      (act.deliverables || []).map((d): DossierDeliverable => ({
        ...d,
        activityDate: act.date,
        activityTitle: act.title,
        activityType: act.activityType,
      }))
    ).sort((a, b) => (a.activityDate || '').localeCompare(b.activityDate || ''));
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
    const fileName = deliverable.originalFileName || deliverable.fileName || 'livrabil';

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

    try {
      const result = await resolveDeliverableUrl(deliverable);
      window.open(result.url, '_blank', 'noopener,noreferrer');
      if (result.shouldRevoke) {
        window.setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
      }
    } catch (error) {
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
      const anchor = document.createElement('a');
      anchor.href = result.url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (result.shouldRevoke) {
        window.setTimeout(() => URL.revokeObjectURL(result.url), 1_000);
      }
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
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

          <ScrollArea className="flex-1 mt-3">
            {/* Section A - Activities */}
            <TabsContent value="sectiunea-a" className="mt-0 space-y-4">
              {/* Activities by Type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Activitati per Sub-Activitate</CardTitle>
                </CardHeader>
                <CardContent>
                  {activitiesByType.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      Nicio activitate inregistrata
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activitiesByType.map(([type, acts]) => (
                        <div key={type}>
                          <div className="flex justify-between items-center mb-2">
                            <Badge variant="outline" className="text-xs">{type}</Badge>
                            <span className="text-xs text-slate-500">
                              {acts.length} activitati · {acts.reduce((s, a) => s + (a.hours || 0), 0)}h
                            </span>
                          </div>
                          <div className="space-y-1 pl-3 border-l-2 border-slate-200">
                            {acts.map(act => {
                              const dt = new Date(act.date);
                              const ds = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
                              return (
                                <div key={act.id} className="flex justify-between items-start gap-3 text-xs py-1">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex gap-2">
                                      <span className="text-slate-400 w-10">{ds}</span>
                                      <span className="text-slate-700">{act.title || 'Activitate'}</span>
                                    </div>
                                    {act.description && (
                                      <p className="mt-1 pl-12 text-[11px] leading-5 text-slate-500">
                                        {act.description}
                                      </p>
                                    )}
                                    {(act.deliverables?.length || 0) > 0 && (
                                      <div className="mt-1 flex flex-wrap gap-1 pl-12">
                                        {act.deliverables?.slice(0, 3).map((deliverable) => (
                                          <Badge key={deliverable.id || deliverable.fileName} variant="secondary" className="max-w-[220px] truncate text-[10px]">
                                            {deliverable.fileName}
                                          </Badge>
                                        ))}
                                        {(act.deliverables?.length || 0) > 3 && (
                                          <Badge variant="outline" className="text-[10px]">
                                            +{(act.deliverables?.length || 0) - 3}
                                          </Badge>
                                        )}
                                      </div>
                                    )}
                                    {act.gdprTemplateCode && (
                                      <GdprPmSummary activity={act} />
                                    )}
                                  </div>
                                  <span className="text-slate-500">{act.hours}h</span>
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
                        
                        return (
                          <div key={i} className="flex items-start gap-3 p-2 bg-slate-50 rounded-lg">
                            <div className="text-[10px] text-slate-400 font-mono w-8">{i + 1}.</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-900 truncate">
                                {deliv.fileName}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {ds} · {deliv.activityType || 'Activitate'} · {deliv.activityTitle}
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
