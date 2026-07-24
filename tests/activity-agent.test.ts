import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityAgentRequestSchema,
  activityAgentResponseSchema,
  type ActivityAgentRequest,
} from '../lib/agents/activity-agent-schema.ts';
import {
  evaluateTargetGroupImpactValue,
  inspectDeliverablesValue,
  validateActivityHoursValue,
  validateSubactivityClassificationValue,
} from '../lib/agents/activity-agent-tools.ts';

const baseRequest: ActivityAgentRequest = {
  expertId: 'expert-1',
  expertName: 'Expert Test',
  expertRole: 'Responsabil raportare',
  projectCode: '302141',
  category: 'AP',
  month: 6,
  year: 2026,
  hours: 6,
  selectedDates: ['2026-07-24'],
  selectedActivityId: 'sa32-monitorizare',
  saCode: 'SA3.2',
  activityName: 'Monitorizare legislativa regionala si informare membri',
  currentDescription: '',
  deliverables: [
    {
      id: 'deliv-1',
      documentTitle: 'Raport de monitorizare legislativa regionala',
      deliverableType: 'raport',
      extractedText: 'Analiza si monitorizare legislativa regionala pentru informarea membrilor CPC si organizatiilor patronale.',
      eligibilitySummary: 'Livrabil eligibil pentru informare membri.',
    },
  ],
  catalogCandidates: [
    {
      id: 'sa32-monitorizare',
      category: 'AP',
      saCode: 'SA3.2',
      activityName: 'Monitorizare legislativa regionala si informare membri',
      description: 'Monitorizare surse legislative regionale si informare membri.',
      beneficiaries: 'Membrii CPC din regiunile vizate',
      expectedResults: 'Membrii informati si pregatiti sa raspunda cadrului legislativ regional.',
      deliverables: 'Raport de monitorizare legislativa',
      indicators: 'Numar note de informare regionale transmise',
    },
    {
      id: 'sa21-eveniment',
      category: 'AP',
      saCode: 'SA2.1',
      activityName: 'Organizare eveniment',
      description: 'Organizare intalniri si evenimente.',
    },
  ],
};

test('activity agent response schema accepts the structured output contract', () => {
  const parsed = activityAgentResponseSchema.parse({
    description: 'Expertul a analizat livrabilul atasat si a formulat informatii relevante pentru raportarea activitatii.',
    proposedSaCode: 'SA3.2',
    proposedActivityName: 'Monitorizare legislativa regionala si informare membri',
    deliverableSummary: 'Raport de monitorizare legislativa regionala',
    resultSummary: 'Membrii au primit informatie structurata.',
    beneficiaries: ['Membrii CPC'],
    targetGroupImpact: {
      type: 'direct',
      justification: 'Beneficiarii sunt mentionati in catalog si in livrabil.',
    },
    evidenceUsed: [{
      sourceType: 'livrabil_curent',
      title: 'Raport de monitorizare legislativa regionala',
      chunkId: 'deliv-1',
      score: 0.91,
      relevantExcerpt: 'informarea membrilor CPC',
    }],
    warnings: [],
    confidence: 'high',
    requiresPmReview: false,
    checks: {
      jobDescriptionAligned: true,
      subactivityAligned: true,
      deliverableSupported: true,
      hoursPlausible: true,
      targetGroupImpactSupported: true,
    },
    auditId: 'audit-1',
  });

  assert.equal(parsed.confidence, 'high');
  assert.equal(parsed.targetGroupImpact.type, 'direct');
});

test('activity agent request schema allows missing deliverables but keeps defaults', () => {
  const parsed = activityAgentRequestSchema.parse({
    expertName: 'Expert Test',
  });

  assert.deepEqual(parsed.deliverables, []);
  assert.deepEqual(parsed.catalogCandidates, []);
  assert.equal(parsed.projectCode, '302141');
});

test('inspectDeliverables extracts actions and warns on empty extracted text', () => {
  const result = inspectDeliverablesValue([
    ...baseRequest.deliverables,
    { documentTitle: 'Nota fara text extras', extractedText: '' },
  ]);

  assert.ok(result.detectedActions.includes('monitorizare'));
  assert.ok(result.detectedTopics.includes('raport'));
  assert.ok(result.warnings.some((warning) => warning.includes('text extras')));
});

test('validateActivityHours flags implausible pontaj hours deterministically', () => {
  const result = validateActivityHoursValue({
    hours: 9,
    selectedDates: ['2026-07-24'],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('intregi si intre 1 si 8')));
});

test('evaluateTargetGroupImpact marks direct impact when beneficiaries are supported', () => {
  const deliverableInspection = inspectDeliverablesValue(baseRequest.deliverables);
  const result = evaluateTargetGroupImpactValue({
    request: baseRequest,
    deliverableInspection,
    subactivityText: 'Scopul SA este informarea membrilor si sprijinirea structurilor de dialog social.',
  });

  assert.equal(result.impactType, 'direct');
  assert.ok(result.beneficiaries.some((beneficiary) => beneficiary.includes('Membrii CPC')));
});

test('evaluateTargetGroupImpact warns when impact is unclear', () => {
  const request: ActivityAgentRequest = {
    ...baseRequest,
    currentDescription: '',
    catalogCandidates: [{ id: 'x', activityName: 'Activitate generica', saCode: 'SA1.1' }],
    deliverables: [{ documentTitle: 'Document intern', extractedText: 'Sincronizare interna fara beneficiari precizati.' }],
  };
  const result = evaluateTargetGroupImpactValue({
    request,
    deliverableInspection: inspectDeliverablesValue(request.deliverables),
  });

  assert.equal(result.impactType, 'unclear');
  assert.ok(result.warnings.length > 0);
});

test('validateSubactivityClassification proposes another SA when selection is inconsistent', () => {
  const result = validateSubactivityClassificationValue({
    request: {
      ...baseRequest,
      selectedActivityId: 'missing-selection',
      saCode: 'SA1.1',
      activityName: 'Activitate gresita',
    },
    subactivityText: 'Monitorizare legislativa regionala si informare membri.',
  });

  assert.equal(result.proposedSaCode, 'SA3.2');
  assert.ok(result.warnings.length > 0);
});
