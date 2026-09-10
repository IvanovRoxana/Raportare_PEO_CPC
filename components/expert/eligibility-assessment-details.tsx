'use client';

import { Badge } from '@/components/ui/badge';
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

export interface EligibilityAssessmentDetailsProps {
  check: DeliverableEligibilityCheck;
  className?: string;
}

export function EligibilityAssessmentDetails({ check, className = '' }: EligibilityAssessmentDetailsProps) {
  const classification = check.classification;
  const coverage = check.referenceCoverage;
  const sourceEvidence = check.sourceEvidence || [];
  const summaries = check.documentSummaries || [];
  if (!classification && !coverage && !sourceEvidence.length && !summaries.length) return null;

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
          ) : classification.appliedBy === 'ai' ? (
            <p className="text-slate-600">Încadrare automată, care poate fi corectată de expert.</p>
          ) : null}
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
