'use client';

import { SectionWorkspace } from '@/components/layout/section-workspace';
import { AiContextHealthPanel } from '@/components/admin/ai-context-health-panel';
import { ActivityCatalogGovernancePanel } from './activity-catalog-governance-panel';
import { EligibilityGovernancePanel } from './eligibility-governance-panel';
import { AiRagAuditTab } from './ai-rag-audit-tab';
import type { PmWorkspaceProps } from './workspace/pm-workspace';

export function KnowledgeWorkspace({ initialSection = 'surse', ...props }: PmWorkspaceProps & { initialSection?: string }) {
  return <div className="space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
      <span className="text-sm font-medium">Perioada pentru audit și catalog</span>
      <select aria-label="Luna auditului AI" className="rounded-md border bg-white p-2 text-sm" value={props.selectedMonth} onChange={(event) => props.onMonthChange(Number(event.target.value))}>
        {props.months.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
      </select>
      <select aria-label="Anul auditului AI" className="rounded-md border bg-white p-2 text-sm" value={props.selectedYear} onChange={(event) => props.onYearChange(Number(event.target.value))}>
        {props.yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </div>
    <SectionWorkspace title="AI + RAG / Knowledge" tab="knowledge" initialSection={initialSection}
      description="Sursele de referință, fișele de post, catalogul, regulile și instrucțiunile folosite la verificarea eligibilității, într-un singur loc."
      sections={[
        { id: 'surse', title: 'Surse și referințe', description: 'Fișe de post, descrieri SA, documente și exemple aprobate', content: <AiContextHealthPanel /> },
        { id: 'catalog', title: 'Catalog activități', description: 'Categorii, livrabile așteptate și încadrare', content: <ActivityCatalogGovernancePanel fallbackCatalog={props.fallbackCatalog} mode="pm" activities={props.activities} documents={props.documents} onAudit={props.onEligibilityGovernanceAudit} /> },
        { id: 'reguli', title: 'Reguli, model și instrucțiuni', description: 'Scoring, versiuni, diagnostic agent și prompturi per expert', content: <EligibilityGovernancePanel documents={props.documents} experts={props.experts} actorName={props.actorName} onExpertsChanged={props.onExpertsChanged} onAudit={props.onEligibilityGovernanceAudit} /> },
        { id: 'audit', title: 'Audit AI / RAG', description: 'Surse recuperate, scoruri și sugestii aplicate', content: <AiRagAuditTab month={props.selectedMonth} year={props.selectedYear} /> },
      ]} />
  </div>;
}
