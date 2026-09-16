'use client';

import { Badge } from '@/components/ui/badge';
import useSWR from 'swr';
import { eligibilityRequest } from '@/lib/eligibility-client';
import type { DeliverableEligibilityCheck } from '@/lib/types';

const COVERAGE_LABELS = {
  project: 'Proiect',
  subactivity: 'Subactivitate',
  job_description: 'Fișa postului',
} as const;

const SOURCE_LABELS: Record<string, string> = {
  cerere_finantare: 'Cerere de finanțare',
  manual_beneficiar: 'Manualul beneficiarului',
  descriere_activitati: 'Descrierea activităților',
  scop_sa: 'Scopul subactivității',
  fisa_post: 'Fișa postului',
  fisa_post_profil_expert: 'Fișa postului din profilul expertului',
};

const CONFIDENCE_LABELS = { high: 'ridicată', medium: 'medie', low: 'scăzută' } as const;
const FINDING_LABELS: Record<string, string> = {
  pass: 'Da', warning: 'Parțial', fail: 'Nu', unknown: 'Neclar', not_applicable: 'Nu se aplică',
};
const DECISION_LABELS: Record<string, string> = {
  confirm: 'Confirmare', reject: 'Respingere', request_clarification: 'Solicitare de clarificări',
  approve_exception: 'Excepție aprobată', reclassify: 'Reîncadrare și reevaluare',
};

export interface EligibilityAssessmentDetailsProps {
  check: DeliverableEligibilityCheck;
  className?: string;
}

export function EligibilityAssessmentDetails({ check: cachedCheck, className = '' }: EligibilityAssessmentDetailsProps) {
  const { data: verified, error: verificationError } = useSWR(cachedCheck.runId ? `/api/eligibility/runs/${encodeURIComponent(cachedCheck.runId)}` : null, eligibilityRequest);
  const check: DeliverableEligibilityCheck = verified?.result || cachedCheck;
  const classification = check.classification;
  const coverage = check.referenceCoverage;
  const sourceEvidence = check.sourceEvidence || [];
  const summaries = check.documentSummaries || [];
  const consistencyChecks = check.consistencyChecks || [];
  const consistencyFinding = consistencyChecks.length
    ? {
        status: consistencyChecks.some((item) => item.status === 'fail') ? 'fail' : consistencyChecks.some((item) => item.status === 'warning' || item.status === 'unknown') ? 'warning' : 'pass',
        explanation: consistencyChecks.map((item) => item.explanation).join(' '),
      }
    : undefined;
  const structured = check.documentIdentity ? {
    'Expert și rol': check.expertRoleAssessment,
    'Tip real de document': check.documentIdentity.documentType ? { status: 'pass', explanation: `${check.documentIdentity.documentType}${check.documentIdentity.topic ? ` · ${check.documentIdentity.topic}` : ''}` } : { status: 'unknown', explanation: 'Tipul real al documentului nu a putut fi stabilit.' },
    'Serviciu demonstrat': check.serviceAssessment,
    'SA selectată': check.selectedSaMatch,
    'Legătura cu proiectul': check.projectRelevanceAssessment,
    'Rezultat și dovezi': check.evidenceAssessment,
    'Consistență și riscuri': consistencyFinding,
  } : null;
  if (!check.runId && !classification && !coverage && !sourceEvidence.length && !summaries.length && !structured) return null;

  const documentNames = [
    ...(check.documentsRead || []),
    ...(check.analyzedDeliverables || []),
    ...(check.semanticAudit?.documentsRead || []),
  ];
  const missingSources = coverage
    ? (Object.keys(COVERAGE_LABELS) as Array<keyof typeof COVERAGE_LABELS>).filter((key) => !coverage[key])
    : [];
  const disclosureClass = 'cursor-pointer rounded-sm font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';

  return (
    <div className={`space-y-3 text-xs ${className}`}>
      {check.runId ? <section className="rounded-md border bg-slate-50 p-3" aria-label="Evaluare persistata">
        <p className="font-semibold">{verified?.current ? 'Evaluare autoritară verificată' : verified ? 'Evaluare istorică / necesită reevaluare' : verificationError ? 'Evaluare neconfirmată' : 'Se verifică evaluarea salvată'}</p>
        <p className="mt-1 break-all">{check.runId} · {check.checkedAt}</p>
        <p>{check.status === 'neconcludent' ? 'Necesită clarificare' : check.status}</p>
        {check.ruleVersionId ? <p className="break-all">Reguli: {check.ruleVersionId}{check.rulesSource === 'published_ruleset' ? ' · versiune publicată' : ' · registru executabil indisponibil'}</p> : null}
        {check.usageAudit ? <p>Consum: {check.usageAudit.inputTokens + check.usageAudit.outputTokens} tokenuri · cost estimat ${check.usageAudit.costUsd.toFixed(4)}</p> : null}
        {verificationError ? <p className="text-amber-800">Rezultatul salvat nu a putut fi confirmat de server.</p> : null}
        {check.evaluationLimitations?.map((item) => <p key={item} className="mt-1 text-amber-800">{item}</p>)}
        {check.criterionFindings?.map((item) => <div key={item.criterionId} className="mt-2 border-t pt-2">
          <strong>{item.criterionId}</strong> · {FINDING_LABELS[item.status] || item.status}<p>{item.explanation}</p>
          {item.provenance ? <p className="break-all text-slate-500">Sursă: {item.provenance.documentId} · versiune {item.provenance.sourceVersion}</p> : null}
          {item.sourceQuotes?.map((quote, index) => <blockquote key={`source-${index}`} className="mt-1 border-l-2 pl-2">Sursă: {quote.quote}</blockquote>)}
          {item.documentQuotes?.map((quote, index) => <blockquote key={`document-${index}`} className="mt-1 border-l-2 pl-2">Livrabil: {quote.quote}</blockquote>)}
        </div>)}
      </section> : null}
      {verified?.decisions?.length ? <section aria-label="Istoricul deciziilor PM" className="rounded-md border p-3">
        <p className="font-semibold">Decizii PM</p>
        {(verified.decisions as Array<{ id: string; decision: string; reason: string; createdAt: string }>).slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((decision) => <div key={decision.id} className="mt-2 border-t pt-2">
            <p>{DECISION_LABELS[decision.decision] || decision.decision} · {decision.createdAt}</p><p>{decision.reason}</p>
          </div>)}
      </section> : null}
      {structured ? (
        <section aria-label="Matricea verificării" className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-2 font-semibold text-slate-800">Matricea verificării</div>
          <div className="space-y-1">
            {Object.entries(structured).map(([label, finding]) => finding ? (
              <div key={label} className="grid grid-cols-[minmax(0,150px)_auto_minmax(0,1fr)] gap-2 border-b border-slate-100 py-1 last:border-0">
                <span className="font-medium text-slate-700">{label}</span>
                <Badge variant="outline" className={finding.status === 'pass' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : finding.status === 'fail' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}>
                  {FINDING_LABELS[finding.status] || finding.status}
                </Badge>
                <span className="text-slate-600">{finding.explanation}</span>
              </div>
            ) : null)}
          </div>
          {check.recommendedSa ? <p className="mt-2 text-slate-700"><span className="font-medium">SA recomandată:</span> {check.recommendedSa.saCode} — {check.recommendedSa.activityName}. {check.recommendedSa.reason}</p> : null}
          {check.justification ? <p className="mt-2 whitespace-pre-wrap text-slate-700"><span className="font-medium">Motivare:</span> {check.justification}</p> : null}
          {check.observations?.length ? <p className="mt-2 text-amber-800"><span className="font-medium">Observații:</span> {check.observations.join(' ')}</p> : null}
        </section>
      ) : null}
      {classification ? (
        <section aria-label="Încadrarea activității" className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="font-semibold text-slate-900">
            {classification.activityName || 'Încadrare neconfirmată'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {classification.saCode ? <Badge variant="outline">{classification.saCode}</Badge> : null}
            <span className="text-slate-600">Încredere în încadrare: {CONFIDENCE_LABELS[classification.confidence] || 'neprecizată'}</span>
          </div>
          {classification.reason ? <p className="break-words text-slate-700">{classification.reason}</p> : null}
          {classification.requiresSaConfirmation ? (
            <p className="font-medium text-amber-800">Schimbarea subactivității necesită confirmarea expertului și o nouă verificare.</p>
          ) : classification.appliedBy === 'expert' ? (
            <p className="text-slate-600">Încadrare aleasă de expert.</p>
          ) : classification.appliedBy === 'pm' ? (
            <p className="text-slate-600">Încadrare stabilită de PM.</p>
          ) : classification.appliedBy === 'ai' ? (
            <p className="text-slate-600">Încadrare automată, disponibilă pentru verificarea PM.</p>
          ) : classification.confidence !== 'high' && classification.activityId ? (
            <p className="text-amber-800">Propunere de încadrare pentru verificarea PM.</p>
          ) : null}
          <p className="text-slate-600">Încadrarea identifică activitatea. Verdictul și scorul de eligibilitate sunt evaluate separat.</p>
        </section>
      ) : null}

      {coverage ? (
        <section aria-label="Acoperirea surselor oficiale" className="space-y-2">
          <div className="font-semibold text-slate-800">Surse de referință</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(COVERAGE_LABELS) as Array<[keyof typeof COVERAGE_LABELS, string]>).map(([key, label]) => (
              <Badge key={key} variant="outline" className={coverage[key] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}>
                {label}: {coverage[key] ? 'disponibilă' : 'lipsă'}
              </Badge>
            ))}
          </div>
          {missingSources.length ? (
            <p className="text-amber-800">Evaluarea nu poate confirma eligibilitatea fără sursele lipsă.</p>
          ) : <p className="text-slate-500">Au fost consultate fragmente relevante din fiecare categorie de surse.</p>}
        </section>
      ) : null}

      {sourceEvidence.length ? (
        <details className="rounded-md border border-slate-200 p-3">
          <summary className={disclosureClass}>Citate verificate din surse ({sourceEvidence.length})</summary>
          <div className="mt-3 space-y-3">
            {sourceEvidence.map((source, index) => (
              <figure key={`${source.chunkId}-${index}`} className="space-y-1">
                <figcaption className="font-medium text-slate-700">
                  {SOURCE_LABELS[source.sourceType] || COVERAGE_LABELS[source.coverage] || 'Sursă oficială'}
                </figcaption>
                <blockquote className="whitespace-pre-wrap break-words border-l-2 border-slate-200 pl-3 text-slate-600">{source.quote}</blockquote>
              </figure>
            ))}
          </div>
        </details>
      ) : coverage ? <p className="text-slate-600">Nu există citate verificate care să susțină concluzia.</p> : null}

      {summaries.length ? (
        <details className="rounded-md border border-slate-200 p-3">
          <summary className={disclosureClass}>Rezumatele documentelor analizate ({summaries.length})</summary>
          <div className="mt-3 space-y-4">
            {summaries.map((summary, index) => {
              const document = documentNames.find((item) => item.id === summary.id);
              const name = document?.documentTitle || document?.fileName || `Documentul ${index + 1}`;
              return (
                <section key={`${summary.id}-${index}`} aria-label={name} className="space-y-2">
                  <div className="break-words font-medium text-slate-800">{name}</div>
                  <p className="whitespace-pre-wrap break-words text-slate-700">{summary.summary}</p>
                  {(summary.evidence || []).map((quote, quoteIndex) => (
                    <blockquote key={quoteIndex} className="whitespace-pre-wrap break-words border-l-2 border-slate-200 pl-3 text-slate-500">{quote}</blockquote>
                  ))}
                </section>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
