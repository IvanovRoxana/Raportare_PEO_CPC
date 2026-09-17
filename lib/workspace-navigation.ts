export const adminDataSections = [
  'experti', 'roluri', 'proiecte', 'subactivitati', 'categorii-experti',
  'perioade-raportare', 'semnaturi-pontaj', 'business-hub', 'import', 'documente', 'infrastructura',
] as const;
export const knowledgeSections = ['surse', 'catalog', 'reguli', 'audit'] as const;

export function resolveAdminLocation(tab?: string, section?: string) {
  if (tab === 'suport') return { tab: 'suport', section: 'experti' };
  const legacy: Record<string, string> = { utilizatori: 'experti', ai: 'infrastructura' };
  const candidate = tab === 'surse-date' ? section : legacy[tab || ''] || tab;
  return {
    tab: 'surse-date',
    section: adminDataSections.find((item) => item === candidate) || 'experti',
  };
}

export function resolveKnowledgeSection(tab?: string | null, section?: string | null) {
  const legacy: Record<string, string> = {
    'eligibility-categories': 'catalog', eligibilityCategories: 'catalog',
    'eligibility-governance': 'reguli', eligibilityCatalog: 'reguli', 'ai-rag': 'audit',
  };
  return legacy[tab || ''] || knowledgeSections.find((item) => item === section) || 'surse';
}

export function isKnowledgeTab(tab?: string | null) {
  return ['knowledge', 'eligibility-categories', 'eligibilityCategories', 'eligibility-governance', 'eligibilityCatalog', 'ai-rag'].includes(tab || '');
}
