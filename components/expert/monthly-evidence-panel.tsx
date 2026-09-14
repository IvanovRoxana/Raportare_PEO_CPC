'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { extractDocxText, extractImageText, extractPdfText, formatFileSize, isImageFile } from '@/lib/document-utils';
import { buildDocumentS3Key, hashFirstPageText, normalizeDocumentTextForFingerprint, sha256Hex } from '@/lib/document-sharing';
import { buildMonthlyEvidenceCoverage, extractMonthlyEvidenceDates, getEvidenceDates, type MonthlyEvidenceInput } from '@/lib/monthly-evidence';
import { formatDateRo, generateId, getMonthName } from '@/lib/app-utils';
import { uploadAuthenticatedData } from '@/lib/authenticated-storage';
import type { Activity, Deliverable, Expert } from '@/lib/types';

interface MonthlyEvidencePanelProps {
  expert: Expert;
  activities: Activity[];
  month: number;
  year: number;
  isApproved?: boolean;
  onUpdateActivity: (id: string, updates: Partial<Activity>) => Promise<void>;
  onRefreshActivities: () => Promise<void> | void;
}

interface EvidenceDraft extends MonthlyEvidenceInput {
  file: File;
  fileType: string;
  fileSize: number;
  detectedDates: string[];
  confirmedDatesText: string;
  status: 'ready' | 'parsing' | 'error' | 'applied';
  error?: string;
  documentId?: string;
  s3Key?: string;
  fileHash?: string;
  firstPageTextHash?: string;
  contentFingerprint?: string;
}

function readFileAsText(file: File) {
  const isDocx = /\.docx?$/i.test(file.name);
  const isPdf = /\.pdf$/i.test(file.name);

  if (isDocx) return extractDocxText(file);
  if (isPdf) return extractPdfText(file);
  if (isImageFile(file.name)) return extractImageText(file);
  return Promise.resolve<string | null>(null);
}

function parseConfirmedDates(value: string, month: number, year: number) {
  return extractMonthlyEvidenceDates(value, month, year);
}

function getStatusLabel(status: MonthlyEvidenceInput['id'] extends never ? never : ReturnType<typeof buildMonthlyEvidenceCoverage>[number]['status']) {
  if (status === 'covered') return 'Acoperita';
  if (status === 'missing_activity') return 'Dovada fara activitate';
  return 'Fara dovada';
}

function getStatusClass(status: ReturnType<typeof buildMonthlyEvidenceCoverage>[number]['status']) {
  if (status === 'covered') return 'border-green-300 bg-green-50 text-green-800';
  if (status === 'missing_activity') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-red-300 bg-red-50 text-red-800';
}

function getApplyErrorMessage(error: unknown) {
  const serialized = error instanceof Error ? error.message : String(error);
  if (/ConditionalCheckFailedException|nu mai exista|lista este invechita/i.test(serialized)) {
    return 'Unele activitati s-au modificat intre timp. Am reincarcat lista; verifica zilele ramase si aplica din nou.';
  }
  return serialized || 'Nu am putut aplica dovezile.';
}

function buildEvidenceDeliverable(args: {
  evidence: EvidenceDraft;
  expert: Expert;
  date: string;
  activityId: string;
  projectId: string;
  projectName?: string;
}) {
  return {
    id: `deliverable_${args.evidence.documentId}_${args.activityId}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
    activityId: args.activityId,
    fileName: args.evidence.file.name,
    originalFileName: args.evidence.file.name,
    fileType: args.evidence.fileType || 'application/octet-stream',
    fileSize: args.evidence.fileSize,
    filePath: args.evidence.s3Key,
    s3Key: args.evidence.s3Key,
    documentId: args.evidence.documentId,
    fileHash: args.evidence.fileHash,
    firstPageTextHash: args.evidence.firstPageTextHash,
    contentFingerprint: args.evidence.contentFingerprint,
    uploadedByExpertId: args.expert.id,
    uploadedByExpertName: args.expert.name,
    projectId: args.projectId,
    projectName: args.projectName,
    sourceActivityId: args.activityId,
    activityDate: args.date,
    saCode: 'SA3.4',
    category: 'justificativ',
    deliverableType: 'pachet_lunar_dovezi_com',
    uploaded: true,
    uploadedAt: new Date().toISOString(),
    declaredTitle: args.evidence.file.name.replace(/\.[^.]+$/, ''),
    docTitle: args.evidence.file.name.replace(/\.[^.]+$/, ''),
    docText: args.evidence.text || undefined,
    firstPageText: args.evidence.text?.slice(0, 5000),
    titleSource: 'manual',
    titleMatch: true,
    titleConfirmed: true,
    titleCheckStatus: 'matched',
    titleCheckMessage: 'Pachet lunar de dovezi COM mapat pe data activitatii.',
    aiStatus: 'manual_review',
    aiReason: 'Dovada mapata prin fluxul lunar COM.',
  } satisfies Deliverable;
}

export function MonthlyEvidencePanel({
  expert,
  activities,
  month,
  year,
  isApproved = false,
  onUpdateActivity,
  onRefreshActivities,
}: MonthlyEvidencePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<EvidenceDraft[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const evidenceInputs = useMemo<MonthlyEvidenceInput[]>(
    () => drafts
      .filter((draft) => draft.status !== 'error')
      .map((draft) => ({
        id: draft.id,
        fileName: draft.fileName,
        text: draft.text,
        confirmedDates: parseConfirmedDates(draft.confirmedDatesText, month, year),
      })),
    [drafts, month, year],
  );

  const coverage = useMemo(
    () => buildMonthlyEvidenceCoverage({ activities, evidence: evidenceInputs, month, year }),
    [activities, evidenceInputs, month, year],
  );
  const coveredCount = coverage.filter((row) => row.status === 'covered').length;
  const missingEvidenceCount = coverage.filter((row) => row.status === 'missing_evidence').length;
  const missingActivityCount = coverage.filter((row) => row.status === 'missing_activity').length;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage(null);

    const incoming = Array.from(files).map((file): EvidenceDraft => ({
      id: generateId(),
      file,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      detectedDates: extractMonthlyEvidenceDates(file.name, month, year),
      confirmedDatesText: extractMonthlyEvidenceDates(file.name, month, year).join(', '),
      status: 'parsing',
    }));

    setDrafts((prev) => [...prev, ...incoming]);

    await Promise.all(incoming.map(async (draft) => {
      try {
        const text = await readFileAsText(draft.file);
        const detectedDates = [...new Set([
          ...draft.detectedDates,
          ...extractMonthlyEvidenceDates(text || '', month, year),
        ])].sort();
        setDrafts((prev) => prev.map((item) => item.id === draft.id
          ? {
              ...item,
              text,
              detectedDates,
              confirmedDatesText: detectedDates.join(', '),
              status: 'ready',
            }
          : item));
      } catch (error) {
        setDrafts((prev) => prev.map((item) => item.id === draft.id
          ? {
              ...item,
              status: 'error',
              error: error instanceof Error ? error.message : 'Nu am putut citi fisierul.',
            }
          : item));
      }
    }));

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateDraftDates = (id: string, confirmedDatesText: string) => {
    setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, confirmedDatesText } : draft));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
  };

  const uploadEvidence = async (draft: EvidenceDraft) => {
    if (draft.s3Key && draft.documentId) return draft;

    const documentId = draft.documentId || `monthly_evidence_${expert.id}_${year}_${String(month + 1).padStart(2, '0')}_${draft.id}`.replace(/[^a-zA-Z0-9_]+/g, '_');
    const safeName = draft.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const projectId = expert.projectCode || '302141';
    const s3Key = buildDocumentS3Key({ projectId, documentId, originalFileName: safeName });
    const arrayBuffer = await draft.file.arrayBuffer();
    const [fileHash, firstPageTextHash] = await Promise.all([
      sha256Hex(arrayBuffer),
      hashFirstPageText(draft.text),
    ]);

    const result = await uploadAuthenticatedData({
      path: s3Key,
      data: draft.file,
      options: { contentType: draft.fileType || 'application/octet-stream' },
    }).result;

    const uploaded = {
      ...draft,
      documentId,
      s3Key: result.path,
      fileHash,
      firstPageTextHash,
      contentFingerprint: normalizeDocumentTextForFingerprint(draft.text).slice(0, 500),
    };
    setDrafts((prev) => prev.map((item) => item.id === draft.id ? uploaded : item));
    return uploaded;
  };

  const applyEvidenceToActivities = async () => {
    setIsApplying(true);
    setMessage(null);
    try {
      await onRefreshActivities();
      const readyDrafts = drafts.filter((draft) => draft.status === 'ready');
      const activitiesByDate = new Map<string, Activity[]>();
      activities.forEach((activity) => {
        activitiesByDate.set(activity.date, [...(activitiesByDate.get(activity.date) ?? []), activity]);
      });

      let attachedCount = 0;
      let skippedExistingCount = 0;
      let failedCount = 0;
      const failureMessages = new Set<string>();
      for (const draft of readyDrafts) {
        let draftApplied = false;
        let draftFailed = false;
        const dates = getEvidenceDates({
          id: draft.id,
          fileName: draft.fileName,
          text: draft.text,
          confirmedDates: parseConfirmedDates(draft.confirmedDatesText, month, year),
        }, month, year);
        if (dates.length === 0) continue;

        const uploaded = await uploadEvidence(draft);
        for (const date of dates) {
          const targetActivities = activitiesByDate.get(date) ?? [];
          for (const activity of targetActivities) {
            const existing = activity.deliverables ?? [];
            if (existing.some((deliverable) => deliverable.documentId === uploaded.documentId)) {
              skippedExistingCount += 1;
              draftApplied = true;
              continue;
            }
            const deliverable = buildEvidenceDeliverable({
              evidence: uploaded,
              expert,
              date,
              activityId: activity.id,
              projectId: expert.projectCode || '302141',
              projectName: expert.projectTitle,
            });
            try {
              await onUpdateActivity(activity.id, {
                deliverables: [...existing, deliverable],
              });
              attachedCount += 1;
              draftApplied = true;
            } catch (error) {
              failedCount += 1;
              draftFailed = true;
              failureMessages.add(getApplyErrorMessage(error));
            }
          }
        }

        if (draftApplied && !draftFailed) {
          setDrafts((prev) => prev.map((item) => item.id === draft.id ? { ...item, status: 'applied' } : item));
        }
      }

      await onRefreshActivities();
      if (failedCount > 0) {
        const successText = attachedCount > 0 ? ` Am atasat dovezile la ${attachedCount} activitati.` : '';
        const skippedText = skippedExistingCount > 0 ? ` ${skippedExistingCount} atasari existau deja.` : '';
        setMessage(`${[...failureMessages][0] ?? 'Nu am putut aplica toate dovezile.'}${successText}${skippedText}`);
      } else if (attachedCount > 0) {
        setMessage(`Am atasat dovezile la ${attachedCount} activitati.`);
      } else if (skippedExistingCount > 0) {
        setMessage('Dovezile erau deja atasate la activitatile gasite.');
      } else {
        setMessage('Nu am gasit activitati existente pentru datele confirmate.');
      }
    } catch (error) {
      setMessage(getApplyErrorMessage(error));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5 text-primary" />
              Dovezi lunare COM
            </CardTitle>
            <CardDescription>
              Incarca dovezi in ziua pontarii sau bulk la final de luna. Word-ul lunar cu date si poze ramane regula acceptata.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{getMonthName(month)} {year}</Badge>
            <Badge variant={missingEvidenceCount > 0 ? 'destructive' : 'secondary'}>
              {coveredCount}/{coverage.length || 0} zile acoperite
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Regula: fiecare zi COM pontata trebuie sa aiba cel putin o dovada verificabila. Dovada poate fi atasata direct la activitate sau inclusa intr-un Word lunar structurat pe date.
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".doc,.docx,.pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isApproved || isApplying}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Incarca pachet dovezi
          </Button>
          <Button
            type="button"
            disabled={isApproved || isApplying || drafts.every((draft) => draft.status !== 'ready')}
            onClick={applyEvidenceToActivities}
          >
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Aplica pe activitati
          </Button>
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
        </div>

        {drafts.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fisier</TableHead>
                  <TableHead className="w-[300px]">Date confirmate</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => (
                  <TableRow key={draft.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{draft.fileName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(draft.fileSize)}
                            {draft.detectedDates.length > 0 ? ` / detectat: ${draft.detectedDates.map(formatDateRo).join(', ')}` : ' / fara data detectata'}
                          </div>
                          {draft.error && <div className="text-xs text-destructive">{draft.error}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={draft.confirmedDatesText}
                        disabled={draft.status === 'parsing' || draft.status === 'applied'}
                        placeholder="ex: 2026-05-12, 13 mai"
                        onChange={(event) => updateDraftDates(draft.id, event.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={draft.status === 'error' ? 'destructive' : draft.status === 'applied' ? 'default' : 'outline'}>
                        {draft.status === 'parsing'
                          ? 'Se citeste'
                          : draft.status === 'applied'
                            ? 'Aplicat'
                            : draft.status === 'error'
                              ? 'Eroare'
                              : 'Pregatit'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDraft(draft.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Acoperite</div>
            <div className="mt-1 text-2xl font-semibold text-green-700">{coveredCount}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Pontate fara dovada</div>
            <div className="mt-1 text-2xl font-semibold text-red-700">{missingEvidenceCount}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Dovezi fara activitate</div>
            <div className="mt-1 text-2xl font-semibold text-amber-700">{missingActivityCount}</div>
          </div>
        </div>

        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Data</TableHead>
                <TableHead>Activitati</TableHead>
                <TableHead>Dovezi mapate</TableHead>
                <TableHead className="w-40">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverage.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    Nu exista activitati sau dovezi mapate pentru luna selectata.
                  </TableCell>
                </TableRow>
              ) : coverage.map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="font-medium">{formatDateRo(row.date)}</TableCell>
                  <TableCell>
                    {row.activities.length > 0 ? (
                      <div className="space-y-1 text-sm">
                        {row.activities.map((activity) => (
                          <div key={activity.id}>{activity.title || activity.activityType} ({activity.hours}h)</div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Nicio activitate</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.evidence.length > 0 ? (
                      <div className="space-y-1 text-sm">
                        {row.evidence.map((item) => <div key={item.id}>{item.fileName}</div>)}
                      </div>
                    ) : row.activities.some((activity) => (activity.deliverables ?? []).length > 0) ? (
                      <span className="text-sm text-muted-foreground">Livrabil atasat deja</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusClass(row.status)}>
                      {row.status !== 'covered' && <AlertTriangle className="mr-1 h-3 w-3" />}
                      {getStatusLabel(row.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
