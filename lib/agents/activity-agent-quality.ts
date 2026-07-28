import type { ActivityAgentRequest } from './activity-agent-schema.ts';

export function uniqueMessages(messages: string[]) {
  return Array.from(new Set(messages.map((message) => message.trim()).filter(Boolean)));
}

export function trimText(value: unknown, maxChars = 900) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

export function splitSentences(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 360);
}

export function normalizePolicyText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function hasForbiddenDescriptionContent(value: string) {
  const forbiddenPatterns = [
    /\bformular(?:ul)?\b/,
    /\bactivitatea selectat[ae]\b/,
    /\bagent(?:ul)?\s+(?:ai|peo)\b/,
    /\bocr\b/,
    /\brag\b/,
    /\bcontext(?:ul)?\s+disponibil\b/,
    /\b(?:am\s+)?(?:citit|extras|procesat|parcurs)\s+(?:livrabilul|documentul|textul)\b/,
    /\blivrabil(?:ul|e|ele|ului)?\b/,
    /\bdocument(?:ul)?\s+atasat\b/,
    /\bsurse?(?:le)?\s+(?:folosite|utilizate|disponibile|consultate)\b/,
    /\bam urmarit sa pastrez\b/,
    /\b(?:necesita\s+)?verificare\s+pm\b/,
    /\bvalidare(?:a)?\s+(?:de catre\s+)?pm\b/,
    /\braportarea lunara\b/,
    /\bpregatit(?:a)?\s+formularea\b/,
  ];
  const normalized = normalizePolicyText(value);
  return forbiddenPatterns.some((pattern) => pattern.test(normalized));
}

export function countWords(value: string) {
  return (value.match(/\b[\w\u0103\u00e2\u00ee\u0219\u021b\u0102\u00c2\u00ce\u0218\u021a-]+\b/g) || []).length;
}

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function classifyDeliverableKind(request: ActivityAgentRequest) {
  const source = normalizePolicyText(request.deliverables.map((deliverable) => [
    deliverable.documentTitle,
    deliverable.deliverableType,
    deliverable.extractedText?.slice(0, 2500),
  ].filter(Boolean).join(' ')).join(' '));

  const matches: Array<{ kind: string; label: string; score: number; signals: string[] }> = [
    {
      kind: 'newsletter',
      label: 'Newsletter / informare membri',
      score: 0,
      signals: ['newsletter', 'informare membri', 'comunicare interna', 'editia', 'membri cpc'],
    },
    {
      kind: 'legislative-analysis',
      label: 'Analiza legislativa / acte normative',
      score: 0,
      signals: ['acte normative', 'proiecte de acte', 'legea nr', 'codul muncii', 'amendament', 'propuneri legislative'],
    },
    {
      kind: 'position-paper',
      label: 'Document de pozitie / propuneri',
      score: 0,
      signals: ['document de pozitie', 'propuneri de amendare', 'observatii', 'punct de vedere', 'pozitia concordia'],
    },
    {
      kind: 'event-minutes',
      label: 'Minuta / eveniment / consultare',
      score: 0,
      signals: ['minuta', 'masa rotunda', 'consultare', 'intalnire', 'agenda', 'participanti'],
    },
    {
      kind: 'presentation',
      label: 'Prezentare / material suport',
      score: 0,
      signals: ['prezentare', 'slide', 'material suport', 'webinar'],
    },
    {
      kind: 'tabular-report',
      label: 'Tabel / raport sintetic',
      score: 0,
      signals: ['tabel', 'centralizator', 'indicatori', 'status', 'coloana'],
    },
    {
      kind: 'report',
      label: 'Raport / analiza narativa',
      score: 0,
      signals: ['raport', 'analiza', 'sinteza', 'concluzii', 'recomandari'],
    },
  ].map((candidate) => ({
    ...candidate,
    score: candidate.signals.reduce((total, signal) => (
      source.includes(signal) ? total + 1 : total
    ), 0),
  }));

  const best = matches.sort((left, right) => right.score - left.score)[0];
  if (!best || best.score === 0) {
    return {
      kind: 'unknown',
      label: 'Tip livrabil neclasificat',
      confidence: 0.25,
      signals: [] as string[],
    };
  }

  return {
    kind: best.kind,
    label: best.label,
    confidence: clampScore(0.45 + Math.min(best.score, 4) * 0.12),
    signals: best.signals.filter((signal) => source.includes(signal)).slice(0, 4),
  };
}

export function evaluateFinalActivityDescription(description: string, request: ActivityAgentRequest) {
  const normalized = normalizePolicyText(description);
  const wordCount = countWords(description);
  const hasSelectedDates = Boolean(request.selectedDates?.length || request.date);
  const startsWithDate = /^in (data|zilele) de\b/.test(normalized);
  const hasFirstPerson = /\bam\s+(analizat|elaborat|formulat|corelat|fundamentat|realizat|structurat|sintetizat|redactat|revizuit|pregatit|identificat|consolidat)\b/.test(normalized);
  const hasConcreteObject = Boolean(
    (request.activityName && normalized.includes(normalizePolicyText(request.activityName).split(' ')[0] || ''))
    || (request.currentDescription && normalizePolicyText(request.currentDescription).split(/\s+/).some((term) => term.length >= 7 && normalized.includes(term)))
    || request.deliverables.some((deliverable) => (
      splitSentences(deliverable.extractedText).some((sentence) => (
        normalizePolicyText(sentence).split(/\s+/).some((term) => term.length >= 8 && normalized.includes(term))
      ))
    )),
  );
  const hasResultContribution = /\bactivitatea a contribuit\b|\ba contribuit la\b|\brezultatul\b/.test(normalized);
  const forbidden = hasForbiddenDescriptionContent(description);
  const warnings = [
    hasSelectedDates && !startsWithDate ? 'Descrierea nu incepe cu data/datele disponibile.' : '',
    !hasFirstPerson ? 'Descrierea nu este formulata suficient la persoana I singular.' : '',
    !hasConcreteObject ? 'Descrierea nu identifica suficient de concret obiectul activitatii.' : '',
    !hasResultContribution ? 'Descrierea nu incheie clar cu rezultatul si relevanta pentru proiect.' : '',
    wordCount < 120 ? `Descrierea este prea scurta pentru Anexa 10 (${wordCount} cuvinte).` : '',
    wordCount > 330 ? `Descrierea este prea lunga pentru Anexa 10 (${wordCount} cuvinte).` : '',
    forbidden ? 'Descrierea contine termeni tehnici sau audit care nu trebuie afisati expertului.' : '',
  ].filter(Boolean);

  const score = clampScore([
    !hasSelectedDates || startsWithDate ? 0.15 : 0,
    hasFirstPerson ? 0.18 : 0,
    hasConcreteObject ? 0.18 : 0,
    hasResultContribution ? 0.18 : 0,
    wordCount >= 120 && wordCount <= 330 ? 0.18 : wordCount >= 90 && wordCount <= 380 ? 0.1 : 0,
    !forbidden ? 0.13 : 0,
  ].reduce((total, item) => total + item, 0));

  return {
    score,
    wordCount,
    warnings,
    evidence: [
      `Cuvinte: ${wordCount}`,
      hasFirstPerson ? 'Persoana I: detectata' : 'Persoana I: slaba/absenta',
      hasResultContribution ? 'Rezultat proiect: detectat' : 'Rezultat proiect: slab/absent',
    ],
  };
}
