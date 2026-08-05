import type { Anexa10ReportModel } from './build-report-model.ts';

export type Anexa10PreflightSeverity = 'critical' | 'warning' | 'info';

export type Anexa10PreflightFinding = {
  id: string;
  severity: Anexa10PreflightSeverity;
  area: 'header' | 'table' | 'narrative' | 'deliverables' | 'hours' | 'ai_review';
  title: string;
  detail: string;
  suggestion?: string;
};

export type Anexa10PreflightReport = {
  canExport: boolean;
  score: number;
  statusLabel: string;
  summary: string;
  findings: Anexa10PreflightFinding[];
  deterministicFindings: Anexa10PreflightFinding[];
  aiFindings: Anexa10PreflightFinding[];
  aiSummary?: string;
  auditId?: string;
  modelUsed?: string;
};

const FORBIDDEN_PHRASES = [
  'conform documentului',
  'în fișierul atașat',
  'in fisierul atasat',
  'din datele primite',
  'am participat pasiv',
  'raportul generat',
  'formularul generat',
  'formular completat automat',
  'agent ai',
  'ocr',
  'rag',
  'tool-uri',
];

const GENERIC_NARRATIVE_PATTERNS = [
  /\bActivitatea const[ăa]\b/i,
  /\bActivitatea presupune\b/i,
  /\bActivitatea urmărește\b/i,
  /\bSunt elaborate\b/i,
  /\bSunt integrate\b/i,
  /\bSunt formulate\b/i,
  /\bSunt propuse\b/i,
  /\bSunt urmărite\b/i,
];

export function buildDeterministicAnexa10Preflight(model: Anexa10ReportModel): Anexa10PreflightReport {
  const deterministicFindings: Anexa10PreflightFinding[] = [
    ...checkHeader(model),
    ...checkTable(model),
    ...checkNarrative(model),
    ...checkHours(model),
    ...model.problems.map((problem, index) => finding({
      id: `allocation-problem-${index + 1}`,
      severity: 'critical',
      area: 'hours',
      title: 'Problema de alocare ore',
      detail: problem.message,
      suggestion: 'Corecteaza alocarea work block-urilor inainte de export.',
    })),
    ...model.warnings.map((warning, index) => finding({
      id: `model-warning-${index + 1}`,
      severity: 'warning',
      area: 'deliverables',
      title: 'Avertizare model Anexa 10',
      detail: warning,
    })),
  ];

  return mergeAnexa10PreflightFindings(deterministicFindings, []);
}

export function mergeAnexa10PreflightFindings(
  deterministicFindings: Anexa10PreflightFinding[],
  aiFindings: Anexa10PreflightFinding[],
  aiMeta: Pick<Anexa10PreflightReport, 'aiSummary' | 'auditId' | 'modelUsed'> = {},
): Anexa10PreflightReport {
  const findings = [...deterministicFindings, ...aiFindings];
  const criticalCount = findings.filter((item) => item.severity === 'critical').length;
  const warningCount = findings.filter((item) => item.severity === 'warning').length;
  const score = Math.max(0, 100 - criticalCount * 25 - warningCount * 8);
  const canExport = criticalCount === 0;
  const statusLabel = criticalCount > 0
    ? 'Blocat de preflight'
    : warningCount > 0
      ? 'Export posibil cu avertizari'
      : 'Preflight trecut';
  const summary = criticalCount > 0
    ? `Preflight-ul a gasit ${criticalCount} problema/probleme critice si ${warningCount} avertizare/avertizari.`
    : warningCount > 0
      ? `Preflight-ul permite exportul, dar recomanda verificarea a ${warningCount} avertizare/avertizari.`
      : 'Preflight-ul nu a gasit probleme critice sau avertizari.';

  return {
    canExport,
    score,
    statusLabel,
    summary,
    findings,
    deterministicFindings,
    aiFindings,
    ...aiMeta,
  };
}

function checkHeader(model: Anexa10ReportModel) {
  const findings: Anexa10PreflightFinding[] = [];
  if (!model.header.contract?.trim()) {
    findings.push(finding({
      id: 'missing-contract',
      severity: 'critical',
      area: 'header',
      title: 'Lipseste contractul',
      detail: 'Campul „Nr. si tipul contractului” este gol.',
      suggestion: 'Completeaza contractul in profilul expertului din Admin.',
    }));
  }
  if (!model.header.category?.trim()) {
    findings.push(finding({
      id: 'missing-expert-category',
      severity: 'critical',
      area: 'header',
      title: 'Lipseste categoria expert Anexa 10',
      detail: 'Campul „Categorie expert” este gol.',
      suggestion: 'Completeaza „Categorie expert Anexa 10” in profilul expertului din Admin.',
    }));
  }
  return findings;
}

function checkTable(model: Anexa10ReportModel) {
  const findings: Anexa10PreflightFinding[] = [];
  const missingResponsibilitiesRows = model.tableRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.responsibilities?.trim() || row.responsibilities.trim() === '-');
  if (missingResponsibilitiesRows.length > 0) {
    findings.push(finding({
      id: 'missing-responsibilities',
      severity: 'critical',
      area: 'table',
      title: 'Lipsesc responsabilitatile',
      detail: `Coloana „Responsabilitati...” este goala pentru ${missingResponsibilitiesRows.length} rand(uri).`,
      suggestion: 'Configureaza responsabilitatile in Admin > Categorii experti PEO.',
    }));
  }

  const longRows = model.tableRows.filter((row) => row.performedActivity.length > 1800);
  if (longRows.length > 0) {
    findings.push(finding({
      id: 'long-performed-activity',
      severity: 'warning',
      area: 'table',
      title: 'Text prea lung in „Activitate prestata”',
      detail: `${longRows.length} rand(uri) au peste 1800 caractere in celula de activitate.`,
      suggestion: 'Scurteaza summary-ul work block-ului sau consolideaza activitatile similare.',
    }));
  }

  const fallbackResults = model.tableRows.filter((row) => (
    row.resultsAndDeliverables.some((item) => /rezultat raportabil de confirmat/i.test(item))
  ));
  if (fallbackResults.length > 0) {
    findings.push(finding({
      id: 'fallback-deliverable-result',
      severity: 'warning',
      area: 'deliverables',
      title: 'Livrabil/rezultat neconfirmat',
      detail: `${fallbackResults.length} rand(uri) folosesc text fallback „rezultat raportabil de confirmat”.`,
      suggestion: 'Asociaza livrabile sau completeaza rezultatul raportabil.',
    }));
  }

  return findings;
}

function checkNarrative(model: Anexa10ReportModel) {
  const findings: Anexa10PreflightFinding[] = [];
  const narrative = model.saSections.flatMap((section) => section.items.map((item) => item.body)).join('\n');
  const forbiddenHits = FORBIDDEN_PHRASES.filter((phrase) => narrative.toLocaleLowerCase('ro').includes(phrase));
  if (forbiddenHits.length > 0) {
    findings.push(finding({
      id: 'forbidden-phrases',
      severity: 'critical',
      area: 'narrative',
      title: 'Formulari interzise in narativ',
      detail: `Au fost gasite formulari interzise: ${forbiddenHits.join(', ')}.`,
      suggestion: 'Elimina referirile la surse, fisiere, proces tehnic sau draft generat.',
    }));
  }

  const genericCount = model.saSections.reduce((count, section) => (
    count + section.items.filter((item) => GENERIC_NARRATIVE_PATTERNS.some((pattern) => pattern.test(item.body))).length
  ), 0);
  if (genericCount > 0) {
    findings.push(finding({
      id: 'generic-third-person-narrative',
      severity: 'warning',
      area: 'narrative',
      title: 'Narativ insuficient la persoana I',
      detail: `${genericCount} bloc(uri) contin formulari generice de tip „Activitatea...” sau „Sunt...”.`,
      suggestion: 'Rescrie narativul la persoana I singular: „am realizat”, „am elaborat”, „am transmis”.',
    }));
  }

  const repeatedBlocks = model.saSections.reduce((count, section) => (
    count + section.items.filter((item) => hasRepeatedSentence(item.body)).length
  ), 0);
  if (repeatedBlocks > 0) {
    findings.push(finding({
      id: 'repeated-narrative-sentences',
      severity: 'warning',
      area: 'narrative',
      title: 'Propozitii repetate in narativ',
      detail: `${repeatedBlocks} bloc(uri) narative par sa contina propozitii duplicate.`,
      suggestion: 'Regenereaza work block-ul sau curata summary-ul inainte de export.',
    }));
  }

  const duplicatedHeadingBlocks = model.saSections.reduce((count, section) => (
    count + section.items.filter((item) => hasSimilarHeadingAndBody(item.heading, item.body)).length
  ), 0);
  if (duplicatedHeadingBlocks > 0) {
    findings.push(finding({
      id: 'duplicated-heading-body-narrative',
      severity: 'warning',
      area: 'narrative',
      title: 'Heading narativ duplicat in corp',
      detail: `${duplicatedHeadingBlocks} bloc(uri) au heading foarte similar cu textul narativ.`,
      suggestion: 'Foloseste un heading scurt cu titlul work block-ului, zilele si orele, iar detaliile pastreaza-le doar in corpul narativ.',
    }));
  }

  return findings;
}

function checkHours(model: Anexa10ReportModel) {
  const tableTotal = round(model.tableRows.reduce((sum, row) => sum + row.hours, 0));
  if (tableTotal !== round(model.totalHours)) {
    return [finding({
      id: 'hours-total-mismatch',
      severity: 'critical',
      area: 'hours',
      title: 'Total ore inconsistent',
      detail: `Total tabel ${tableTotal} ore, total model ${model.totalHours} ore.`,
      suggestion: 'Verifica alocarea orelor in work block-uri.',
    })];
  }
  return [];
}

function hasRepeatedSentence(value: string) {
  const seen = new Set<string>();
  const sentences = value.split(/(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚ])/u);
  for (const sentence of sentences) {
    const key = sentence
      .toLocaleLowerCase('ro')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || key.length < 40) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasSimilarHeadingAndBody(heading: string, body: string) {
  const normalizedHeading = normalizeForComparison(heading);
  const normalizedBody = normalizeForComparison(body);
  if (!normalizedHeading || !normalizedBody) return false;
  if (normalizedHeading === normalizedBody) return true;
  if (normalizedBody.length < 80) return normalizedHeading.includes(normalizedBody);
  const shorter = normalizedHeading.length < normalizedBody.length ? normalizedHeading : normalizedBody;
  const longer = normalizedHeading.length < normalizedBody.length ? normalizedBody : normalizedHeading;
  return shorter.length >= 80 && longer.includes(shorter);
}

function normalizeForComparison(value: string) {
  return value
    .toLocaleLowerCase('ro')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\bore lucrate\)/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finding(input: Anexa10PreflightFinding): Anexa10PreflightFinding {
  return input;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
