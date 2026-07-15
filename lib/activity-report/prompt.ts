import { mergeActivityReportRules } from './default-rules.ts';
import type {
  ActivityReportPromptInput,
  ActivityReportRequest,
  ActivityTotals,
  NormalizedActivity,
  ReportingRules,
  ValidatedActivityReportExample,
} from './types.ts';

const MAX_PROMPT_DESCRIPTION_CHARS = 500;
const MAX_PROMPT_LIST_ITEMS = 5;

export const ACTIVITY_REPORT_SYSTEM_PROMPT = `Ești un asistent specializat în redactarea Rapoartelor de Activitate PEO / Anexa 10 pentru proiecte cu finanțare europeană.
Scrii exclusiv în limba română, la persoana I singular.
Textul trebuie să fie tehnic-administrativ, clar, coerent, orientat pe activități, livrabile, rezultate, beneficiari și impact.
Nu menționezi surse, fișiere, documente încărcate, anexe, aplicații sau faptul că informațiile provin dintr-un input.
Nu folosești formulări de tipul „conform documentului”, „în fișierul atașat”, „din datele primite”.
Raportul trebuie să fie copy-paste-ready pentru Anexa 10.`;

export function buildActivityReportPrompt(data: ActivityReportPromptInput) {
  const groupedActivitiesSummary = formatGroupedActivities(data.groupedActivities);
  const totalsSummary = formatTotals(data.totals);
  const validatedExamples = formatValidatedExamples(data.validatedExamples);

  return `Generează un Raport de Activitate – Anexa 10 pentru:

Expert: ${data.expertName}
Rol expert: ${data.expertRole || 'neprecizat'}
Luna: ${data.month} ${data.year}
Cod proiect: ${data.projectCode || 'neprecizat'}

Activități normalizate și grupate pe subactivități:
${groupedActivitiesSummary}

Totaluri calculate:
${totalsSummary}

Reguli de redactare:
- Scrie la persoana I singular: „am elaborat”, „am analizat”, „am coordonat”, „am consolidat”, „am facilitat”.
- Nu menționa surse, documente, fișiere sau inputuri.
- Ton solicitat: ${data.rules.tone}.
- Organizează raportul în următoarea structură:
  1. Tabel activități
  2. Descriere detaliată pe subactivități și zile
  3. Probleme / întârzieri
  4. Validări și observații de completare
  5. Semnături

Secțiunea 1 – Tabel activități:
Include coloane textuale clare:
- Subactivitate / cod SA
- Perioada / zile acoperite
- Activitate prestată
- Rezultate / materiale elaborate / livrabile
- Nr. ore lucrate
- Livrabil comun: Da/Nu și colaboratori, dacă există

Pentru fiecare rând:
- grupează activitățile similare din aceeași SA;
- include totalul de ore aferent rândului;
- descrie activitatea în 3–6 propoziții;
- menționează livrabilele generic, dar suficient de specific pentru audit.

Secțiunea 2 – Descriere detaliată:
Organizează pe SA în ordine crescătoare.
În fiecare SA, organizează pe zile cronologic.
Pentru fiecare zi sau grup coerent de zile, include:
1. Context și obiectiv;
2. Pașii realizați;
3. Livrabile;
4. Rezultat;
5. Beneficiar;
6. Indicator / Impact;
7. Pontaj: ore, locație, colaborări.

Folosește explicit formulări de tipul:
Rezultat: ...
Beneficiar: ...
Indicator/Impact: ...

Secțiunea 3:
Dacă nu există probleme sau întârzieri, scrie:
„Nu este cazul.”

Secțiunea 4:
Include:
- Total ore în raport = ${data.totals.totalHours};
- Total ore introduse = ${data.totals.totalHours};
- Coerență: DA / NU;
- Observații privind câmpurile lipsă, dacă există.

Nivel de detaliere:
${data.rules.detailLevel}

Formulări preferate:
${data.rules.preferredPhrases.join(', ') || 'Nu sunt formulate preferințe suplimentare.'}

Formulări interzise:
${data.rules.forbiddenPhrases.join(', ') || 'Nu sunt formulate interdicții suplimentare.'}

Reguli de control:
- Menționare surse/documente permisă: ${data.rules.mentionSources ? 'DA' : 'NU'}.
- Persoana I singular obligatorie: ${data.rules.firstPersonSingular ? 'DA' : 'NU'}.
- Secțiune de validări obligatorie: ${data.rules.includeValidationSection ? 'DA' : 'NU'}.
- Rezultat/Beneficiar/Indicator-Impact obligatorii: ${data.rules.includeResultBeneficiaryImpact ? 'DA' : 'NU'}.

Exemple validate de stil, dacă există:
${validatedExamples}

Returnează exclusiv raportul final, fără explicații despre cum a fost generat.`;
}

export function buildActivityReportPromptInput(
  request: ActivityReportRequest,
  normalizedActivities: NormalizedActivity[],
  groupedActivities: Record<string, NormalizedActivity[]>,
  totals: ActivityTotals,
): ActivityReportPromptInput {
  return {
    ...request,
    projectCode: request.projectCode || '302141',
    normalizedActivities,
    groupedActivities,
    totals,
    rules: mergeActivityReportRules(request.reportingRules),
  };
}

export function buildTrainingUserPrompt(input: {
  expertName: string;
  expertRole?: string;
  month: string;
  year: number;
  projectCode?: string;
  activities: unknown;
  reportingRules?: ReportingRules;
}) {
  const rules = mergeActivityReportRules(input.reportingRules);

  return `Generează Raport de Activitate – Anexa 10 pentru următoarele activități validate operațional.
Expert: ${input.expertName}
Rol expert: ${input.expertRole || 'neprecizat'}
Luna: ${input.month} ${input.year}
Cod proiect: ${input.projectCode || '302141'}
Reguli: ${JSON.stringify(rules)}
Activități: ${JSON.stringify(input.activities)}`;
}

function formatGroupedActivities(groups: Record<string, NormalizedActivity[]>) {
  return Object.entries(groups)
    .map(([saCode, activities]) => {
      const rows = activities.map((activity) => [
        `  - Data: ${activity.date}`,
        `Ore: ${activity.hours}`,
        `Tip: ${activity.activityType || 'tip neprecizat'}`,
        `Titlu: ${activity.title}`,
        `Descriere: ${truncatePromptText(activity.description, MAX_PROMPT_DESCRIPTION_CHARS)}`,
        activity.gdprTemplateCode ? `Cod GDPR: ${activity.gdprTemplateCode}` : null,
        activity.gdprConclusionCode ? `Concluzie GDPR: ${activity.gdprConclusionCode}` : null,
        `Locație: ${activity.location}`,
        `Colaboratori: ${formatPromptList(activity.collaborators)}`,
        `Livrabile: ${formatPromptList(activity.deliverables)}`,
        `Beneficiari: ${formatPromptList(activity.beneficiaries)}`,
        `Indicator/Impact: ${activity.indicatorImpact || 'neprecizat'}`,
      ].filter(Boolean).join('; '));

      return `${saCode}\n${rows.join('\n')}`;
    })
    .join('\n\n');
}

function truncatePromptText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function formatPromptList(values: string[]) {
  if (values.length === 0) return 'nu sunt precizate';
  const visibleValues = values.slice(0, MAX_PROMPT_LIST_ITEMS);
  const suffix = values.length > visibleValues.length ? `, +${values.length - visibleValues.length} suplimentare` : '';
  return `${visibleValues.join(', ')}${suffix}`;
}

function formatTotals(totals: ActivityTotals) {
  return [
    `Total ore lunar: ${totals.totalHours}`,
    `Total ore per SA: ${JSON.stringify(totals.totalsBySA)}`,
    `Total ore per zi: ${JSON.stringify(totals.totalsByDate)}`,
    `Validări/warnings: ${totals.warnings.length > 0 ? totals.warnings.join(' | ') : 'Nu există warnings.'}`,
  ].join('\n');
}

function formatValidatedExamples(examples?: ValidatedActivityReportExample[]) {
  if (!examples?.length) return 'Nu au fost furnizate exemple validate.';

  return examples
    .map((example, index) => [
      `Exemplul ${index + 1}: ${example.title}`,
      `SA: ${example.saCode || 'neprecizată'}`,
      `Rezumat input: ${example.inputSummary || 'neprecizat'}`,
      `Fragment/stil validat: ${example.outputExample}`,
    ].join('\n'))
    .join('\n\n');
}
