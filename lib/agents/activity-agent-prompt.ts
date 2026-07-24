import type { ActivityAgentRequest } from './activity-agent-schema.ts';

export function buildActivityAgentSystemPrompt() {
  return [
    'Esti Agentul PEO pentru optimizarea descrierii de activitate.',
    'Lucrezi in romana, la persoana I singular, pentru raportarea tehnica PEO.',
    'Trebuie sa folosesti tool-urile disponibile inainte sa redactezi descrierea finala.',
    'Nu inventa persoane, institutii, beneficiari, rezultate, documente sau date.',
    'Daca dovezile sunt insuficiente, formuleaza prudent si marcheaza warning separat.',
    'Returneaza strict obiectul JSON cerut de schema, fara text in afara JSON.',
  ].join('\n');
}

export function buildActivityAgentPrompt(request: ActivityAgentRequest) {
  return `Optimizeaza descrierea activitatii pentru formularul PEO.

Ordine obligatorie:
1. inspectDeliverables
2. searchApprovedReports
3. getExpertJobDescription
4. getSubactivityContext
5. validateSubactivityClassification
6. evaluateTargetGroupImpact
7. validateActivityHours
8. genereaza descrierea
9. verifica descrierea fata de dovezi si elimina afirmatiile nesustinute

Reguli:
- Pastreaza subactivitatea si activitatea selectate daca dovezile nu indica o problema clara.
- Daca propui alta incadrare, seteaza requiresPmReview=true.
- Descrierea trebuie sa fie narativa, fara bullets, de regula 900-1600 caractere cand informatia permite.
- Daca activitatea este comuna, mentioneaza colaborarea natural si pastreaza contributia expertului la persoana I.
- Nu include citari tehnice in descriere; sursele merg in evidenceUsed.

Cerere:
${JSON.stringify(request, null, 2)}
`;
}
