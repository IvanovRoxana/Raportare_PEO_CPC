'use client';

import { AlertTriangle, CheckCircle, FolderOpen, MessageSquare, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PM_REVIEW_CASE_PRIORITY_LABELS,
  PM_REVIEW_CASE_STATUS_LABELS,
  PM_REVIEW_CASE_SUBJECT_LABELS,
  isBlockingPmReviewCase,
  isPmReviewCaseActive,
  type PmReviewCaseListItem,
} from '@/lib/pm-review-cases';
import type { PmReviewCase } from '@/lib/types';

interface PmReviewCasesPanelProps {
  cases: PmReviewCaseListItem[];
  legacyCases?: PmReviewCaseListItem[];
  onOpenCase?: (reviewCase: PmReviewCaseListItem) => void;
  onNotifyCase?: (reviewCase: PmReviewCase) => Promise<void> | void;
  onResolveCase?: (reviewCase: PmReviewCase) => Promise<void> | void;
}

function priorityClass(priority: string) {
  if (priority === 'blocking') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === 'high') return 'border-orange-200 bg-orange-50 text-orange-700';
  if (priority === 'low') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function sourceLabel(source: PmReviewCaseListItem['source']) {
  return source === 'legacy_neconformitate' ? 'legacy' : 'registru PM';
}

function CaseRow({ reviewCase, onOpenCase, onNotifyCase, onResolveCase }: PmReviewCasesPanelProps & { reviewCase: PmReviewCaseListItem }) {
  const active = isPmReviewCaseActive(reviewCase);
  const blocking = isBlockingPmReviewCase(reviewCase);
  const canMutate = reviewCase.source === 'pm_review_case';
  return (
    <div className={`rounded-lg border p-3 ${blocking ? 'border-red-200 bg-red-50/60' : active ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{PM_REVIEW_CASE_SUBJECT_LABELS[reviewCase.subjectType] || reviewCase.subjectType}</Badge>
            <Badge variant="outline" className={priorityClass(reviewCase.priority)}>
              {PM_REVIEW_CASE_PRIORITY_LABELS[reviewCase.priority] || reviewCase.priority}
            </Badge>
            <Badge variant={active ? 'secondary' : 'outline'}>
              {PM_REVIEW_CASE_STATUS_LABELS[reviewCase.status] || reviewCase.status}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{sourceLabel(reviewCase.source)}</span>
          </div>
          <div>
            <p className="font-medium text-slate-900">{reviewCase.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{reviewCase.description}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {reviewCase.expertName ? <span>Expert: {reviewCase.expertName}</span> : null}
            {reviewCase.subjectLabel ? <span>Element: {reviewCase.subjectLabel}</span> : null}
            {reviewCase.createdAt ? <span>Creat: {new Date(reviewCase.createdAt).toLocaleString('ro-RO')}</span> : null}
          </div>
          {reviewCase.expertResponse ? (
            <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <span className="font-medium">Raspuns expert:</span> {reviewCase.expertResponse}
            </div>
          ) : null}
          {reviewCase.resolution ? (
            <div className="rounded-md border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-900">
              <span className="font-medium">Rezolutie:</span> {reviewCase.resolution}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenCase?.(reviewCase)}>
            <FolderOpen className="h-4 w-4" />
            Deschide
          </Button>
          {canMutate && active ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => onNotifyCase?.(reviewCase)}>
                <MessageSquare className="h-4 w-4" />
                Notifica expert
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onResolveCase?.(reviewCase)}>
                <CheckCircle className="h-4 w-4" />
                Rezolva
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PmReviewCasesPanel({ cases, legacyCases = [], onOpenCase, onNotifyCase, onResolveCase }: PmReviewCasesPanelProps) {
  const activeCases = cases.filter(isPmReviewCaseActive);
  const closedCases = cases.filter((reviewCase) => !isPmReviewCaseActive(reviewCase));
  const blockingCount = activeCases.filter(isBlockingPmReviewCase).length;

  return (
    <div className="space-y-4">
      <Card className="rounded-lg border-slate-200">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Cazuri PM
              </CardTitle>
              <CardDescription>
                Registru nou pentru clarificari si verificari PM, separat de neconformitatile legacy.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={blockingCount > 0 ? 'destructive' : 'outline'}>{blockingCount} blocante</Badge>
              <Badge variant="outline">{activeCases.length} active</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeCases.length > 0 ? (
            activeCases.map((reviewCase) => (
              <CaseRow
                key={reviewCase.id}
                reviewCase={reviewCase}
                cases={cases}
                legacyCases={legacyCases}
                onOpenCase={onOpenCase}
                onNotifyCase={onNotifyCase}
                onResolveCase={onResolveCase}
              />
            ))
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-muted-foreground">
              Nu exista cazuri PM active pentru luna selectata.
            </p>
          )}
          {closedCases.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rezolvate / inchise</p>
              {closedCases.map((reviewCase) => (
                <CaseRow
                  key={reviewCase.id}
                  reviewCase={reviewCase}
                  cases={cases}
                  legacyCases={legacyCases}
                  onOpenCase={onOpenCase}
                  onNotifyCase={onNotifyCase}
                  onResolveCase={onResolveCase}
                />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Neconformitati legacy mapate
          </CardTitle>
          <CardDescription>
            Datele vechi raman functionale si sunt afisate separat, fara migrare fortata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {legacyCases.length > 0 ? (
            legacyCases.map((reviewCase) => (
              <CaseRow
                key={reviewCase.id}
                reviewCase={reviewCase}
                cases={cases}
                legacyCases={legacyCases}
                onOpenCase={onOpenCase}
                onNotifyCase={onNotifyCase}
                onResolveCase={onResolveCase}
              />
            ))
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-muted-foreground">
              Nu exista neconformitati legacy mapate pentru verificarea curenta.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
