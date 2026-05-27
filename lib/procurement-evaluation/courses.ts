import type { CourseProfile } from './types.ts';

export const LEARNING_HUB_COURSE_PROFILES: CourseProfile[] = [
  {
    courseId: 'C01',
    courseName: 'Consolidarea capacității organizaționale: guvernanță, management, reprezentativitate și servicii pentru membri',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['guvernanță organizațională', 'management organizațional', 'reprezentativitate', 'servicii pentru membri', 'membership', 'strategie organizațională'],
    strongEvidenceTerms: ['organizații patronale', 'asociații profesionale', 'dezvoltare organizațională', 'servicii pentru membri'],
    relevanceCriteria: ['Dovezile indică experiență în guvernanță, management sau servicii pentru membri.'],
    thresholds: { high: 0.28, medium: 0.12, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C02',
    courseName: 'Competențe verzi și economie circulară',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['competențe verzi', 'economie circulară', 'sustenabilitate', 'tranziție verde', 'eficiență resurse'],
    strongEvidenceTerms: ['ESG', 'decarbonizare', 'management de mediu', 'raportare sustenabilitate'],
    relevanceCriteria: ['Dovezile indică formare sau consultanță în economie circulară, ESG sau tranziție verde.'],
    thresholds: { high: 0.3, medium: 0.14, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C03',
    courseName: 'Advocacy și comunicare strategică',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['advocacy', 'comunicare strategică', 'campanie publică', 'public affairs', 'mesaje cheie'],
    strongEvidenceTerms: ['strategie de advocacy', 'relații guvernamentale', 'comunicare instituțională'],
    relevanceCriteria: ['Dovezile indică experiență în advocacy, comunicare strategică sau public affairs.'],
    thresholds: { high: 0.3, medium: 0.14, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C04',
    courseName: 'Dialog social național și european',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['dialog social', 'parteneri sociali', 'tripartit', 'bipartit', 'comitet european'],
    strongEvidenceTerms: ['CES', 'confederații patronale', 'organizații sindicale', 'dialog social european'],
    relevanceCriteria: ['Dovezile indică participare sau formare în dialog social național/european.'],
    thresholds: { high: 0.28, medium: 0.12, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C05',
    courseName: 'Negociere colectivă și gestionarea relațiilor de muncă',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['negociere colectivă', 'contract colectiv', 'relații de muncă', 'conflict de muncă', 'dreptul muncii'],
    strongEvidenceTerms: ['CCM', 'relații industriale', 'mediere conflict muncă', 'consultare angajați'],
    relevanceCriteria: ['Dovezile indică experiență în negociere colectivă sau relații de muncă.'],
    thresholds: { high: 0.28, medium: 0.12, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C06',
    courseName: 'Transformare digitală și inteligență artificială - competențe transversale',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['transformare digitală', 'inteligență artificială', 'AI', 'automatizare', 'competențe digitale'],
    strongEvidenceTerms: ['digitalizare procese', 'instrumente AI', 'data literacy', 'securitate cibernetică'],
    relevanceCriteria: ['Dovezile indică formare sau implementare în digitalizare, AI sau competențe digitale.'],
    thresholds: { high: 0.3, medium: 0.14, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C07',
    courseName: 'Management de proiect - principii și metodologii',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['management de proiect', 'metodologie proiect', 'planificare proiect', 'monitorizare proiect', 'agile'],
    strongEvidenceTerms: ['PMI', 'PRINCE2', 'scrum', 'project lifecycle', 'management riscuri'],
    relevanceCriteria: ['Dovezile indică experiență de formare/coordonare în management de proiect.'],
    thresholds: { high: 0.28, medium: 0.12, minimumEvidenceKeywordHits: 2 },
  },
  {
    courseId: 'C08',
    courseName: 'Managementul relațiilor cu stakeholderii',
    deliveryFormat: 'online sau hibrid',
    coreKeywords: ['stakeholderi', 'management stakeholderi', 'cartografiere stakeholderi', 'consultare publică', 'relații instituționale'],
    strongEvidenceTerms: ['stakeholder engagement', 'mapare actori', 'strategie de implicare', 'facilitare consultări'],
    relevanceCriteria: ['Dovezile indică experiență în identificarea, implicarea și managementul stakeholderilor.'],
    thresholds: { high: 0.28, medium: 0.12, minimumEvidenceKeywordHits: 2 },
  },
];

export function getCourseProfile(courseId: string) {
  return LEARNING_HUB_COURSE_PROFILES.find((course) => course.courseId === courseId);
}
