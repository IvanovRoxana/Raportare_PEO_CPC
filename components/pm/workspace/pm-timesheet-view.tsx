'use client';

import { useState } from 'react';
import { Check, Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExpertAvatar } from '@/components/expert/expert-avatar';
import { getMonthName } from '@/lib/app-utils';
import { buildPmTimesheetViewModel } from '@/lib/pm-timesheet-view';
import type { Activity, DocumentMetadata, Expert } from '@/lib/types';
import type { PmWorkspaceProps } from './pm-workspace';

type TimesheetViewProps = PmWorkspaceProps & {
  onOpenEligibilityRules: (document: DocumentMetadata) => void;
};

function pct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function MiniAvatar({ expert }: { expert: Expert }) {
  return <ExpertAvatar expert={expert} className="h-7 w-7 bg-[#1f73d8] text-[10px] text-white" />;
}

export function TimesheetView(props: TimesheetViewProps) {
  const [selectedExpertId, setSelectedExpertId] = useState(props.experts[0]?.id || '');
  const timesheet = buildPmTimesheetViewModel({
    experts: props.experts,
    dashboardRows: props.dashboardRows,
    activities: props.activities,
    activeBlockedDocuments: props.pmUnlockRequests,
    autoResolvedDocuments: props.resolvedPmUnlockRequests,
    selectedExpertId,
    selectedMonth: props.selectedMonth,
    selectedYear: props.selectedYear,
  });
  const selectedExpert = timesheet.selectedExpert;
  const selectedRow = timesheet.selectedRow;
  const selectedActivities = timesheet.selectedActivities;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Calendar ore - {getMonthName(props.selectedMonth)} {props.selectedYear}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {timesheet.expertChips.map(({ expert, totalHours, utilizationPercent, isActive }) => (
            <button key={expert.id} type="button" onClick={() => setSelectedExpertId(expert.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${isActive ? 'border-[#1f3f75] bg-blue-50' : 'bg-white hover:bg-slate-50'}`}>
              <MiniAvatar expert={expert} />
              <span><span className="block font-semibold">{expert.name.split(' ')[0]}</span><span className="text-slate-500">{totalHours}h - {pct(utilizationPercent)}%</span></span>
            </button>
          ))}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="flex items-center gap-3">{selectedExpert ? <MiniAvatar expert={selectedExpert} /> : null}<h3 className="font-semibold">{selectedExpert?.name || 'Expert'}</h3><span className="text-xs text-slate-500">{selectedExpert?.role}</span></div>
          </div>
          <div className="grid grid-cols-7 border-b bg-slate-50 text-xs font-semibold text-slate-500">
            {['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'].map((day) => <div key={day} className="border-r p-2 last:border-r-0">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: timesheet.leadingEmptyDays }).map((_, index) => <div key={`empty-${index}`} className="min-h-[5.5rem] border-b border-r bg-slate-50/50" />)}
            {timesheet.calendarDays.map((calendarDay) => {
              const dayActivities = calendarDay.activities;
              return (
                <div key={calendarDay.date} className="min-h-[5.5rem] border-b border-r p-2 text-xs">
                  <div className="flex justify-between"><span className="font-medium">{calendarDay.day}</span><span className={calendarDay.totalHours > 0 ? 'font-semibold text-blue-700' : 'text-slate-300'}>{calendarDay.totalHours || '-'}/{calendarDay.expectedHours}h</span></div>
                  {dayActivities.slice(0, 2).map((activity) => {
                    const blocked = timesheet.blockedActivityIds.has(activity.id);
                    return (
                      <div
                        key={activity.id}
                        className={`mt-1 truncate rounded px-1.5 py-1 text-[10px] ${
                          blocked
                            ? 'border border-amber-300 bg-amber-50 text-amber-900'
                            : 'bg-blue-50 text-blue-800'
                        }`}
                        title={blocked ? 'Activitate afectată de livrabil neeligibil cu deblocare PM solicitată' : undefined}
                      >
                        {activity.title || activity.activityType}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between p-4">
            <div><span className="text-2xl font-bold text-[#1f3f75]">{selectedRow?.totalHours || 0}h</span><span className="ml-2 text-sm text-slate-500">/ {selectedRow?.monthlyNorm || 0}h normă</span></div>
            <Button
              className="bg-[#1f3f75]"
              disabled={!selectedExpert || props.exportingPontajExpertId === selectedExpert.id}
              onClick={() => selectedExpert ? props.onDownloadExpertPontaj(selectedExpert) : undefined}
            >
              <Download className="h-4 w-4" />
              {selectedExpert && props.exportingPontajExpertId === selectedExpert.id ? 'Se generează...' : 'Descarcă pontaj PEO'}
            </Button>
          </div>
        </section>
        <PmUnlockTimesheetPanel
          activeDocuments={timesheet.selectedActiveBlockedDocuments}
          resolvedDocuments={timesheet.selectedAutoResolvedDocuments}
          activities={selectedActivities}
          props={props}
        />
      </div>
    </div>
  );
}

function PmUnlockTimesheetPanel({
  activeDocuments,
  resolvedDocuments,
  activities,
  props,
}: {
  activeDocuments: DocumentMetadata[];
  resolvedDocuments: DocumentMetadata[];
  activities: Activity[];
  props: TimesheetViewProps;
}) {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const openDocument = (document: DocumentMetadata, issueType = 'pm_unlock_requests') => {
    props.onOpenDossierById(document.uploadedByExpertId, {
      activityId: document.sourceActivityId,
      documentId: document.id,
      issueType,
    });
  };

  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-amber-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Livrabile blocate</h3>
            <p className="text-xs text-amber-700">Afectează pontajul până la decizia PM.</p>
          </div>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">{activeDocuments.length}</Badge>
        </div>
        <div className="divide-y">
          {activeDocuments.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Nu există blocaje active pentru expertul selectat.</div>
          ) : activeDocuments.map((document) => {
            const activity = document.sourceActivityId ? activityById.get(document.sourceActivityId) : undefined;
            return (
              <div key={document.id} className="space-y-3 p-4">
                <div>
                  <div className="font-semibold text-[#1f3f75]">{document.declaredTitle || document.originalFileName}</div>
                  <div className="mt-1 text-xs text-slate-500">{activity?.title || activity?.activityType || document.eligibilityCheck?.checkedActivityName || 'Activitate neidentificată'}</div>
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{document.eligibilityCheck?.summary || 'Livrabil neeligibil cu deblocare PM solicitată.'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openDocument(document)}><FileText className="h-4 w-4" />Deschide livrabil</Button>
                  <Button size="sm" variant="outline" onClick={() => openDocument(document, 'eligibility_manual_review')}>Verifică manual</Button>
                  <Button size="sm" onClick={() => props.onApprovePmUnlock(document)}><Check className="h-4 w-4" />Deblochează PM</Button>
                  <Button size="sm" variant="outline" onClick={() => props.onOpenEligibilityRules(document)}>Actualizează reguli</Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-emerald-800">Rezolvate prin corectare expert</h3>
            <p className="text-xs text-slate-500">Tracking păstrat, fără impact de blocaj PM.</p>
          </div>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{resolvedDocuments.length}</Badge>
        </div>
        <div className="divide-y">
          {resolvedDocuments.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">Nu există corectări auto-rezolvate pentru expertul selectat.</div>
          ) : resolvedDocuments.map((document) => (
            <div key={document.id} className="space-y-3 p-4">
              <div>
                <div className="font-semibold text-[#1f3f75]">{document.declaredTitle || document.originalFileName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Inițial: {document.eligibilityCheck?.pmUnlockOriginalStatus || 'neeligibil'} · Acum: {document.eligibilityCheck?.status || 'eligibil'}
                </div>
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{document.eligibilityCheck?.summary || 'Livrabilul a devenit eligibil după corectarea expertului.'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openDocument(document)}><FileText className="h-4 w-4" />Deschide livrabil</Button>
                <Button size="sm" variant="outline" onClick={() => openDocument(document, 'eligibility_ai_review')}>Vezi verificarea AI</Button>
                <Button size="sm" variant="outline" onClick={() => props.onOpenEligibilityRules(document)}>Actualizează reguli</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
