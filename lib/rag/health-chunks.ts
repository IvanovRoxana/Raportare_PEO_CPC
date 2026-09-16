import { appliesToEligibilityScope, type EligibilityScope } from '../eligibility-scope.ts';
export type HealthChunk = EligibilityScope & { id: string; documentId?: string; sourceType?: string; status?: string; indexGenerationId?: string; metadataJson?: string };

export function selectHealthChunks(chunks: HealthChunk[], filters: EligibilityScope) {
  const active = chunks.filter((item) => item.status === 'active' && appliesToEligibilityScope(item, filters));
  const byExpert = active.filter((item) => filters.expertId && (item.expertId === filters.expertId || (!item.expertId && item.sourceType === 'fisa_post')));
  const byCategory = active.filter((item) => filters.category && item.category === filters.category);
  const byProject = active.filter((item) => filters.projectCode && item.projectCode === filters.projectCode);
  const sources = (items: HealthChunk[], types: string[]) => items.filter((item) => types.includes(item.sourceType || ''));
  const history = ['raportare_aprobata_oir', 'raport_activitate_aprobat', 'livrabil_aprobat'];
  return {
    expertFisaPostChunks: sources(byExpert, ['fisa_post']),
    approvedReportsByExpert: sources(byExpert, history),
    categoryFisaPostChunks: sources(byCategory, ['fisa_post']),
    categoryReferenceChunks: sources(byCategory, ['cerere_finantare', 'manual_beneficiar', 'descriere_activitati']),
    categoryApprovedReports: sources(byCategory, history),
    projectSourceChunks: sources(byProject, ['cerere_finantare', 'manual_beneficiar']),
    subactivitySourceChunks: sources(byProject.filter((item) => filters.saCode && item.saCode === filters.saCode), ['scop_sa', 'descriere_activitati']),
  };
}
