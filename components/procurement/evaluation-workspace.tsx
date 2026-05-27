'use client';

import { useEffect, useMemo, useState } from 'react';
import { uploadData } from 'aws-amplify/storage';
import { AlertTriangle, Bot, ClipboardCheck, Download, FileText, Loader2, MessageSquare, Upload } from 'lucide-react';
import { DataTable, StatCard } from '@/components/layout/dashboard-primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { configureAmplify, isAwsAvailable } from '@/lib/aws/client';
import type { ProcurementProject } from '@/lib/procurement';
import {
  calculateScoring,
  classifyDocuments,
  createLearningHubEvaluationSeed,
  createOfferPackageFromFiles,
  deriveExpertsFromDocuments,
  deriveFinancialOfferFromDocuments,
  exportProcurementEvaluationWorkbook,
  extractTextWithOcrFallback,
  hasBlockingValidationPass,
  rankScoringResults,
  saveProcurementEvaluationSnapshot,
  validateClassifiedDocuments,
  validateDocumentSignatures,
  validateExpertCoverage,
  validateQualifiedSignatureFile,
  validateFinancialOffer,
  type OfferPackageDocumentInput,
  type ProcurementEvaluationSnapshot,
} from '@/lib/procurement-evaluation';

function mapEvaluationStatus(status: string) {
  if (status === 'Conform') return 'conform';
  if (status === 'Neconform') return 'neconform';
  if (status === 'Review') return 'cu_observatii';
  return 'informativ';
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function safeStorageName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function uploadProcurementDocument(file: File, projectId: string, packageId: string) {
  if (!isAwsAvailable()) return undefined;
  configureAmplify();
  const path = `procurement-evaluation/${projectId}/${packageId}/${Date.now()}-${safeStorageName(file.name)}`;
  const result = await uploadData({
    path,
    data: file,
    options: { contentType: file.type || 'application/octet-stream' },
  }).result;
  return result.path;
}

export function ProcurementEvaluationWorkspace({ project }: { project: ProcurementProject }) {
  const [supplierName, setSupplierName] = useState('Ofertant demonstrativ Learning Hub');
  const [snapshot, setSnapshot] = useState<ProcurementEvaluationSnapshot>(() => createLearningHubEvaluationSeed(project.id));
  const [isImporting, setIsImporting] = useState(false);
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [manualNote, setManualNote] = useState('');
  const [aiReviewSummary, setAiReviewSummary] = useState<string | null>(null);
  const [persistMessage, setPersistMessage] = useState<string | null>(null);

  useEffect(() => {
    const seed = createLearningHubEvaluationSeed(project.id);
    setSnapshot(seed);
    setSupplierName(seed.package.supplierName);
    setAiReviewSummary(null);
  }, [project.id]);

  const summary = useMemo(() => {
    const blockingIssues = snapshot.validationResults.filter((result) => result.severity === 'Blocant' && result.status !== 'Conform').length;
    const reviewDocuments = snapshot.classifications.filter((classification) => classification.reviewRequired).length;
    const selectedScore = snapshot.scoringResults[0];
    return {
      documents: snapshot.documents.length,
      reviewDocuments,
      blockingIssues,
      totalScore: selectedScore?.totalScore ?? 0,
    };
  }, [snapshot]);

  const rebuildValidationsAndScoring = (next: ProcurementEvaluationSnapshot): ProcurementEvaluationSnapshot => {
    const financialOffer = next.financialOffers[0];
    const validationResults = [
      ...validateClassifiedDocuments(next.classifications),
      ...validateDocumentSignatures(next.documents),
      ...validateExpertCoverage(next.expertCourseMappings),
      ...validateFinancialOffer(financialOffer),
    ];
    const blockingValidationPass = hasBlockingValidationPass(validationResults);
    const coordinatorYearsProven = Math.max(
      0,
      ...next.expertCourseMappings.filter((mapping) => mapping.role === 'COORDONATOR').map((mapping) => mapping.yearsProvenGeneral),
    );
    const baseScore = calculateScoring({
      supplierId: next.package.supplierId,
      supplierName: next.package.supplierName,
      blockingValidationPass,
      coordinatorYearsProven,
      coordinatorDocumentsConform: next.expertCourseMappings.some((mapping) => mapping.role === 'COORDONATOR' && mapping.eligibilityDecision === 'Conform'),
      mappings: next.expertCourseMappings,
      financialOffer,
      minimumAdmissiblePrice: financialOffer?.totalPriceExVat,
    });

    return {
      ...next,
      validationResults,
      scoringResults: rankScoringResults([baseScore]),
    };
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setIsImporting(true);
    try {
      const imported = await createOfferPackageFromFiles({
        procurementProjectId: project.id,
        supplierId: `supplier-${supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ofertant'}`,
        supplierName,
        files: Array.from(fileList),
      });
      const enrichedDocuments: OfferPackageDocumentInput[] = [];
      for (const [index, document] of imported.documents.entries()) {
        const file = Array.from(fileList)[index];
        const [extraction, signatureValidation, storagePath] = await Promise.all([
          extractTextWithOcrFallback(file),
          validateQualifiedSignatureFile(file),
          uploadProcurementDocument(file, project.id, imported.package.id).catch(() => undefined),
        ]);
        enrichedDocuments.push({
          ...document,
          storagePath,
          mimeType: file.type || 'application/octet-stream',
          extractedText: extraction.text,
          extractionStatus: extraction.status,
          extractionWarnings: extraction.warnings,
          ocrUsed: extraction.ocrUsed,
          signaturePresent: signatureValidation.signaturePresent,
          qualifiedSignatureStatus: signatureValidation.qualifiedSignatureStatus,
          signatureValidationProvider: signatureValidation.provider,
          signatureValidatedAt: signatureValidation.validatedAt,
          signatureValidationNotes: signatureValidation.notes,
        });
      }

      const classifications = classifyDocuments(enrichedDocuments);
      const form12Present = classifications.some((classification) => classification.docType === 'FORMULAR_12');
      const annexPresent = classifications.some((classification) => classification.docType === 'FORMULAR_12_ANEXA' || classification.docType === 'ANEXA_FINANCIARA');
      const extractedExperts = deriveExpertsFromDocuments(enrichedDocuments, classifications);
      const extractedFinancialOffer = deriveFinancialOfferFromDocuments(enrichedDocuments, classifications);

      setSnapshot((current) =>
        rebuildValidationsAndScoring({
          ...current,
          package: { ...imported.package, status: 'Review', notes: manualNote },
          documents: enrichedDocuments,
          classifications,
          experts: extractedExperts.experts,
          expertCourseMappings: extractedExperts.mappings,
          financialOffers: [
            {
              ...(extractedFinancialOffer ?? current.financialOffers[0]),
              supplierId: imported.package.supplierId,
              supplierName,
              form12Present,
              annexPresent,
              totalsMatch: form12Present && annexPresent ? (extractedFinancialOffer?.totalsMatch ?? false) : false,
              status: form12Present && annexPresent ? 'Review' : 'Neconform',
            },
          ],
        }),
      );
    } finally {
      setIsImporting(false);
    }
  };

  const persistSnapshot = async () => {
    setIsSaving(true);
    setPersistMessage(null);
    try {
      const result = await saveProcurementEvaluationSnapshot({
        ...snapshot,
        package: { ...snapshot.package, notes: manualNote || snapshot.package.notes },
      });
      setPersistMessage(result.message);
    } catch (error) {
      setPersistMessage(error instanceof Error ? error.message : 'Nu s-a putut salva snapshot-ul în Amplify.');
    } finally {
      setIsSaving(false);
    }
  };

  const requestAiReview = async () => {
    setIsAiReviewing(true);
    try {
      const response = await fetch('/api/ai/procurement/review-validation-gaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procurementCode: project.code,
          supplierName,
          validations: snapshot.validationResults,
          mappings: snapshot.expertCourseMappings,
        }),
      });
      const data = await response.json();
      setAiReviewSummary(data.summary ?? data.reviewSummary ?? 'Review AI finalizat. Verifică observațiile generate.');
    } catch {
      setAiReviewSummary('Review AI indisponibil. Păstrează analiza deterministă și marchează manual observațiile.');
    } finally {
      setIsAiReviewing(false);
    }
  };

  return (
    <section id="evaluare-oferte" className="scroll-mt-24 space-y-5">
      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Evaluare oferte Learning Hub</h2>
            <p className="mt-1 text-sm text-muted-foreground">Import, clasificare, validare, mapare expert-curs, scoring și export centralizat.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} className="min-w-72" aria-label="Nume ofertant" />
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-xs hover:bg-slate-50">
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import dosar
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                className="hidden"
                onChange={(event) => handleFilesSelected(event.target.files)}
                {...{ webkitdirectory: '', directory: '' }}
              />
            </label>
            <Button variant="outline" onClick={() => exportProcurementEvaluationWorkbook(snapshot)}>
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
            <Button onClick={persistSnapshot} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Salvează Amplify
            </Button>
          </div>
        </div>
        {persistMessage ? <p className="mt-3 text-sm text-muted-foreground">{persistMessage}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileText} label="Documente importate" value={summary.documents} description="Cu hash și cale originală" tone="blue" />
        <StatCard icon={AlertTriangle} label="Necesită review" value={summary.reviewDocuments} description="Clasificare sau dovezi ambigue" tone="warning" />
        <StatCard icon={ClipboardCheck} label="Probleme blocante" value={summary.blockingIssues} description="Oprește scoringul final" tone={summary.blockingIssues ? 'danger' : 'success'} />
        <StatCard icon={MessageSquare} label="Scor curent" value={summary.totalScore.toFixed(2)} description="Aplicat doar dacă oferta e conformă" tone="slate" />
      </div>

      <Tabs defaultValue="documente" className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <TabsList className="flex h-auto w-full flex-wrap justify-start rounded-xl">
          <TabsTrigger value="documente">Documente</TabsTrigger>
          <TabsTrigger value="experti">Experți</TabsTrigger>
          <TabsTrigger value="mapare">Mapare expert-curs</TabsTrigger>
          <TabsTrigger value="validari">Validări</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="documente" className="mt-4">
          <DataTable
            columns={['Fișier', 'Tip', 'Text/OCR', 'Semnătură', 'Încredere', 'Review', 'Hash']}
            rows={snapshot.documents.map((document) => {
              const classification = snapshot.classifications.find((item) => item.documentId === document.id);
              return [
                <div key="file" className="max-w-[28rem]">
                  <p className="font-medium text-slate-900">{document.originalPath}</p>
                  <p className="text-xs text-muted-foreground">{document.extension.toUpperCase()} · {document.sizeBytes ?? 0} bytes</p>
                </div>,
                classification?.docType ?? 'NECLASIFICAT',
                document.ocrUsed ? 'OCR' : document.extractionStatus ?? '-',
                <StatusBadge key="signature" status={document.qualifiedSignatureStatus === 'valid' ? 'conform' : document.signaturePresent ? 'cu_observatii' : 'lipsa'}>
                  {document.qualifiedSignatureStatus ?? 'Neverificat'}
                </StatusBadge>,
                classification ? formatPercent(classification.confidence) : '-',
                <StatusBadge key="review" status={classification?.reviewRequired ? 'cu_observatii' : 'conform'}>
                  {classification?.reviewRequired ? 'Review' : 'OK'}
                </StatusBadge>,
                <span key="hash" className="font-mono text-xs">{document.hash?.slice(0, 12) ?? '-'}</span>,
              ];
            })}
            footer={<p className="text-sm text-muted-foreground">Folder upload păstrează path-ul relativ când browserul îl furnizează.</p>}
          />
        </TabsContent>

        <TabsContent value="experti" className="mt-4">
          <DataTable
            columns={['Expert', 'Rol', 'CV', 'Diplomă', 'Certificare', 'Disponibilitate']}
            rows={snapshot.experts.map((expert) => [
              expert.expertName,
              expert.role,
              expert.cvDocumentId ? 'Da' : 'Review',
              expert.diplomaDocumentId ? 'Da' : 'Review',
              expert.trainerCertificateDocumentId ? 'Da' : 'Review',
              expert.availabilityDocumentId ? 'Da' : 'Review',
            ])}
          />
        </TabsContent>

        <TabsContent value="mapare" className="mt-4">
          <DataTable
            columns={['Expert', 'Curs', 'Ani F6', 'Ani CV', 'Ani dovediți', 'Online dovedit', 'Relevanță', 'Eligibilitate']}
            rows={snapshot.expertCourseMappings.map((mapping) => [
              mapping.expertName,
              <span key="course" className="block max-w-[22rem]">{mapping.courseName}</span>,
              mapping.yearsClaimedF6 ?? '-',
              mapping.yearsClaimedCv ?? '-',
              mapping.yearsProvenGeneral,
              mapping.yearsOnlineProven,
              mapping.courseRelevance,
              <StatusBadge key="eligibility" status={mapEvaluationStatus(mapping.eligibilityDecision)}>
                {mapping.eligibilityDecision}
              </StatusBadge>,
            ])}
          />
        </TabsContent>

        <TabsContent value="validari" className="mt-4">
          <DataTable
            columns={['Regulă', 'Cerință', 'Severitate', 'Status', 'Valoare observată']}
            rows={snapshot.validationResults.map((result) => [
              result.ruleId,
              result.requirement,
              result.severity,
              <StatusBadge key="status" status={mapEvaluationStatus(result.status)}>
                {result.status}
              </StatusBadge>,
              result.observedValue ?? '-',
            ])}
          />
        </TabsContent>

        <TabsContent value="scoring" className="mt-4">
          <DataTable
            columns={['Ofertant', 'Blocant OK', 'CT1', 'CT2', 'CT3', 'Preț', 'P', 'Total', 'Rang']}
            rows={snapshot.scoringResults.map((score) => [
              score.supplierName,
              score.blockingValidationPass ? 'Da' : 'Nu',
              score.ct1CoordinatorScore,
              score.ct2TrainersScore,
              score.ct3OnlineScore,
              score.priceExVat?.toLocaleString('ro-RO') ?? '-',
              score.priceScore,
              score.totalScore,
              score.rank ?? '-',
            ])}
          />
        </TabsContent>

        <TabsContent value="review" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <Textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} placeholder="Note evaluator, observații și decizii manuale..." className="min-h-32" />
            <Button onClick={requestAiReview} disabled={isAiReviewing}>
              {isAiReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Review AI
            </Button>
          </div>
          {aiReviewSummary ? (
            <div className="rounded-xl border border-amber-200 bg-[#fff7e6] p-4 text-sm leading-6 text-slate-800">{aiReviewSummary}</div>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
