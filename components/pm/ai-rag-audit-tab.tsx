'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, SearchIcon, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActivityAutofillAudits } from '@/hooks/use-backend-data';
import type { ActivityAutofillAudit } from '@/lib/types';

interface AiRagAuditTabProps {
  month: number;
  year: number;
  expertId?: string | null;
}

type RetrievalSource = {
  rank?: number;
  score?: number;
  sourceType?: string;
  expertName?: string;
  month?: number;
  year?: number;
  saCode?: string;
  activityName?: string;
  textPreview?: string;
};

function safeParseJson<T>(value?: string): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseRetrievalSources(audit: ActivityAutofillAudit) {
  const retrieval = safeParseJson<{ chunks?: RetrievalSource[] }>(audit.retrievalJson);
  return retrieval?.chunks ?? [];
}

function parseWarnings(audit: ActivityAutofillAudit) {
  const warnings = safeParseJson<string[]>(audit.warningsJson);
  return Array.isArray(warnings) ? warnings.filter(Boolean) : [];
}

function formatMonthYear(month?: number, year?: number) {
  if (month === undefined || year === undefined) return 'Nespecificat';
  return `${String(month + 1).padStart(2, '0')}/${year}`;
}

function confidenceClass(confidence?: string) {
  if (confidence === 'high') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (confidence === 'medium') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

export function AiRagAuditTab({ month, year, expertId }: AiRagAuditTabProps) {
  const { audits, isLoading, error } = useActivityAutofillAudits(month, year, expertId);
  const visibleAudits = useMemo(
    () => audits.filter((audit) => audit.month === month && audit.year === year),
    [audits, month, year]
  );

  if (isLoading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Se incarca auditul AI RAG...
      </div>
    );
  }

  if (error || visibleAudits.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-slate-400" />
        <div className="mt-3 text-sm font-medium text-slate-900">Nu exista audit AI RAG disponibil</div>
        <p className="mt-1 text-xs text-slate-500">
          Auditul apare aici dupa ce modelul ActivityAutofillAudit este disponibil si autocompletarea ruleaza.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-950">AI RAG / Autocompletari</h3>
        <p className="text-sm text-slate-500">
          Surse, scoruri si status aplicare pentru sugestiile generate in {formatMonthYear(month, year)}.
        </p>
      </div>

      <div className="grid gap-4">
        {visibleAudits.map((audit) => {
          const sources = parseRetrievalSources(audit);
          const warnings = parseWarnings(audit);
          const finalDiffers = Boolean(
            audit.applied
            && (
              (audit.finalSaCode && audit.finalSaCode !== audit.suggestedSaCode)
              || (audit.finalActivityName && audit.finalActivityName !== audit.suggestedActivityName)
              || (audit.finalDescriptionPreview && audit.suggestedDescriptionPreview && audit.finalDescriptionPreview !== audit.suggestedDescriptionPreview)
            )
          );

          return (
            <Card key={audit.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">
                      {audit.expertName || 'Expert nespecificat'} - {formatMonthYear(audit.month, audit.year)}
                    </CardTitle>
                    <div className="mt-1 text-xs text-slate-500">
                      {audit.expertRole || 'Rol nespecificat'} {audit.projectCode ? `- ${audit.projectCode}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={confidenceClass(audit.confidence)}>
                      {audit.confidence || 'no confidence'}
                    </Badge>
                    <Badge variant="outline" className={audit.applied ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-slate-50 text-slate-700'}>
                      {audit.applied ? 'aplicata' : 'neaplicata'}
                    </Badge>
                    {finalDiffers && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                        modificata
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">SA sugerat</div>
                    <div className="mt-1 font-medium text-slate-950">{audit.suggestedSaCode || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Activitate sugerata</div>
                    <div className="mt-1 font-medium text-slate-950">{audit.suggestedActivityName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Audit id</div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-700">{audit.modelAuditId || audit.id}</div>
                  </div>
                </div>

                {sources.length > 0 ? (
                  <div className="rounded-md border border-slate-200">
                    <div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                      <SearchIcon className="h-4 w-4" />
                      Documente similare
                    </div>
                    <div className="divide-y">
                      {sources.slice(0, 5).map((source, index) => (
                        <div key={`${source.rank}-${index}`} className="px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">#{source.rank ?? index + 1}</Badge>
                            {source.score !== undefined && <span>scor {source.score}</span>}
                            {source.sourceType && <span>{source.sourceType}</span>}
                            {source.saCode && <span>{source.saCode}</span>}
                            {source.activityName && <span className="font-medium">{source.activityName}</span>}
                          </div>
                          {source.textPreview && (
                            <p className="mt-1 line-clamp-2 text-slate-600">{source.textPreview}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Nu au fost salvate surse similare pentru aceasta sugestie.
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="mb-1 flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Avertismente
                    </div>
                    <ul className="list-disc space-y-1 pl-4">
                      {warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {audit.applied && (
                  <div className="flex items-center gap-2 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Sugestie aplicata {audit.appliedAt ? `la ${new Date(audit.appliedAt).toLocaleString('ro-RO')}` : ''}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
