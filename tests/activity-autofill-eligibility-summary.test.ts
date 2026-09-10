import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityAutofillRequestSchema,
  buildActivityAutofillDeliverablesPayload,
  buildActivityAutofillPrompt,
  findUnsupportedActivityAutofillNumbers,
  getActivityAutofillDeliverableEvidenceText,
  normalizeActivityAutofillRequest,
  type ActivityAutofillDeliverable,
  type ActivityAutofillDeliverableDraft,
} from '../lib/activity-autofill.ts';
import { activityAgentRequestSchema } from '../lib/agents/activity-agent-schema.ts';
import { buildActivityAgentPrompt } from '../lib/agents/activity-agent-prompt.ts';
import { buildActivityFactSheetValue, inspectDeliverablesValue } from '../lib/agents/activity-agent-tools.ts';
import { buildActivityAutofillRagQuery } from '../lib/rag/retrieval.ts';

const rawText = 'Raportul documenteaza analiza procedurilor de consultare a membrilor.';
const summary = 'Documentul compara procedurile de consultare si formuleaza recomandari pentru dialog social.';
const evidence = ['Au fost comparate 17 proceduri de consultare.'];

function draft(patch: Partial<ActivityAutofillDeliverableDraft> = {}): ActivityAutofillDeliverableDraft {
  return {
    id: 'doc-1', fileHash: 'hash-current', docText: rawText,
    eligibilityCheck: {
      assessmentVersion: 'llm-eligibility-v2', executionStatus: 'completed',
      status: 'eligibil_cu_observatii', summary: 'Foloseste numai concluziile sustinute de document.',
      documentSummaries: [{ id: 'doc-1', fileHash: 'hash-current', summary, evidence, extractedTextLength: 14000 }],
    },
    ...patch,
  };
}

function request(deliverables: ActivityAutofillDeliverable[]) {
  return {
    deliverables,
    catalogCandidates: [{ id: 'cat-1', saCode: 'SA3.4', activityName: 'Analiza documentara' }],
    selectedActivityId: 'cat-1', saCode: 'SA3.4', activityName: 'Analiza documentara',
    currentDescription: 'Am comparat procedurile. Pastreaza accentul pe analiza documentara si nu pretinde organizarea unei intalniri.',
  };
}

test('completed matching analysis preserves verified document summary through request validation and normalization', () => {
  const payload = buildActivityAutofillDeliverablesPayload([draft()]);
  const parsed = activityAutofillRequestSchema.parse(request(payload));
  const normalized = normalizeActivityAutofillRequest(parsed);
  assert.equal(normalized.deliverables[0].analysisSummary, summary);
  assert.deepEqual(normalized.deliverables[0].analysisEvidence, evidence);
  assert.equal(normalized.deliverables[0].analysisVersion, 'llm-eligibility-v2');
  assert.equal(normalized.deliverables[0].analysisFileHash, 'hash-current');
  assert.equal(normalized.deliverables[0].extractedText, rawText);
  assert.equal(normalized.deliverables[0].eligibilityStatus, 'eligibil_cu_observatii');
});

test('changed file hash and different document id prevent reuse while retaining raw evidence', () => {
  for (const changed of [draft({ fileHash: 'different-file' }), draft({ id: 'another-doc' }), draft({ fileHash: undefined })]) {
    const [payload] = buildActivityAutofillDeliverablesPayload([changed]);
    assert.equal(payload.analysisSummary, undefined);
    assert.equal(payload.extractedText, rawText);
  }
});

test('pending failed legacy and incompatible analysis versions are ignored', () => {
  const check = draft().eligibilityCheck!;
  for (const ignored of [
    { ...check, executionStatus: 'pending' as const },
    { ...check, executionStatus: 'failed' as const },
    { ...check, executionStatus: undefined },
    { ...check, assessmentVersion: 'legacy-v1' },
  ]) {
    const [payload] = buildActivityAutofillDeliverablesPayload([draft({ eligibilityCheck: ignored })]);
    assert.equal(payload.analysisSummary, undefined);
    assert.equal(payload.extractedText, rawText);
  }
});

test('summaries without source evidence or actual extracted text are ignored', () => {
  const check = draft().eligibilityCheck!;
  for (const documentSummary of [
    { ...check.documentSummaries![0], evidence: [] },
    { ...check.documentSummaries![0], evidence: ['   '] },
    { ...check.documentSummaries![0], summary: ' ' },
    { ...check.documentSummaries![0], extractedTextLength: 0 },
    { ...check.documentSummaries![0], fileHash: undefined },
  ]) {
    const [payload] = buildActivityAutofillDeliverablesPayload([draft({ eligibilityCheck: { ...check, documentSummaries: [documentSummary] } })]);
    assert.equal(payload.analysisSummary, undefined);
  }
});

test('verified excerpts can support drafting without downloading the same unchanged document again', () => {
  const [payload] = buildActivityAutofillDeliverablesPayload([draft({ docText: null, firstPageText: null })]);
  assert.equal(payload.analysisSummary, summary);
  assert.equal(payload.extractedText, evidence[0]);
  assert.equal(payload.textScope, 'Fragmente din document verificate in analiza eligibilitatii');
  assert.deepEqual(buildActivityAutofillDeliverablesPayload([draft({ docText: null, firstPageText: null, fileHash: 'changed' })]), []);
});

test('normalization drops summary provenance when the request file hash has changed', () => {
  const [payload] = buildActivityAutofillDeliverablesPayload([draft()]);
  const normalized = normalizeActivityAutofillRequest(request([{ ...payload, fileHash: 'changed-after-building' }]));
  assert.equal(normalized.deliverables[0].analysisSummary, undefined);
  assert.equal(normalized.deliverables[0].analysisEvidence, undefined);
  assert.equal(getActivityAutofillDeliverableEvidenceText(normalized.deliverables[0]), rawText);
});

test('prompt reuses analysis evidence while preserving expert instructions and eligibility limitations', () => {
  const input = request(buildActivityAutofillDeliverablesPayload([draft()]));
  const { prompt } = buildActivityAutofillPrompt(input);
  assert.ok(prompt.includes(input.currentDescription));
  assert.ok(prompt.includes(summary));
  assert.ok(prompt.includes(evidence[0]));
  assert.match(prompt, /fara a reface evaluarea eligibilitatii/);
  assert.match(prompt, /Nu inventa zile sau ore/);
  assert.match(prompt, /eligibilityStatus "neeligibil": nu prezenta livrabilul ca rezultat valid/);
  assert.match(prompt, /Pastreaza avertismentele si limitarile/);
});

test('evidence text helper adds verified summaries for retrieval and keeps unanalysed raw text unchanged', () => {
  const [payload] = buildActivityAutofillDeliverablesPayload([draft()]);
  const queryEvidence = getActivityAutofillDeliverableEvidenceText(payload);
  assert.ok(queryEvidence.includes(summary));
  assert.ok(queryEvidence.includes(evidence[0]));
  assert.ok(queryEvidence.includes(rawText));
  assert.equal(getActivityAutofillDeliverableEvidenceText({ extractedText: rawText }), rawText);
});

test('numeric facts must be supported by source excerpts rather than generated summary alone', () => {
  const check = draft().eligibilityCheck!;
  const [payload] = buildActivityAutofillDeliverablesPayload([draft({ eligibilityCheck: {
    ...check,
    documentSummaries: [{ ...check.documentSummaries![0], summary: `${summary} Rezumatul afirma 99 proceduri.` }],
  } })]);
  const input = request([payload]);
  assert.deepEqual(findUnsupportedActivityAutofillNumbers('Am comparat 17 proceduri.', input), []);
  assert.deepEqual(findUnsupportedActivityAutofillNumbers('Am comparat 99 proceduri.', input), ['99']);
});

test('primary agent schema and prompt retain verified analysis and the original expert instructions', () => {
  const input = request(buildActivityAutofillDeliverablesPayload([draft({ documentTitle: 'Raport analiza' })]));
  const parsed = activityAgentRequestSchema.parse({ ...input, expertName: 'Expert Test' });
  assert.equal(parsed.deliverables[0].analysisSummary, summary);
  assert.deepEqual(parsed.deliverables[0].analysisEvidence, evidence);
  assert.equal(parsed.deliverables[0].eligibilityStatus, 'eligibil_cu_observatii');
  const prompt = buildActivityAgentPrompt(parsed);
  assert.ok(prompt.includes(summary));
  assert.ok(prompt.includes(input.currentDescription));
  assert.match(prompt, /Nu reface evaluarea eligibilitatii/);
  assert.match(prompt, /Nu inventa zile, ore/);
  const stale = activityAgentRequestSchema.parse({ ...input, expertName: 'Expert Test', deliverables: [{ ...input.deliverables[0], fileHash: 'changed' }] });
  assert.equal(stale.deliverables[0].analysisSummary, undefined);
  assert.equal(stale.deliverables[0].extractedText, rawText);
});

test('RAG query includes verified document summaries and ignores stale summary provenance', () => {
  const input = request(buildActivityAutofillDeliverablesPayload([draft()]));
  assert.ok(buildActivityAutofillRagQuery(input).includes(summary));
  const stale = { ...input, deliverables: [{ ...input.deliverables[0], fileHash: 'changed' }] };
  assert.equal(buildActivityAutofillRagQuery(stale).includes(summary), false);
  assert.ok(buildActivityAutofillRagQuery(stale).includes(rawText));
});

test('primary agent fact sheet uses verified source excerpts without promoting the generated summary to a fact', () => {
  const input = request(buildActivityAutofillDeliverablesPayload([draft({ documentTitle: 'Raport analiza' })]));
  const parsed = activityAgentRequestSchema.parse({ ...input, expertName: 'Expert Test' });
  const factSheet = buildActivityFactSheetValue({ request: parsed, deliverableInspection: inspectDeliverablesValue(parsed.deliverables) });
  assert.ok(factSheet.factualEvidence.some((item) => item.includes(evidence[0])));
  assert.equal(factSheet.factualEvidence.some((item) => item.includes(summary)), false);
  const stale = { ...parsed, deliverables: [{ ...parsed.deliverables[0], fileHash: 'changed' }] };
  const staleFactSheet = buildActivityFactSheetValue({ request: stale, deliverableInspection: inspectDeliverablesValue(stale.deliverables) });
  assert.equal(staleFactSheet.factualEvidence.some((item) => item.includes(evidence[0])), false);
});
