import assert from 'node:assert/strict';
import test from 'node:test';
import { Output } from 'ai';
import { eligibilityAssessmentAiSchema, eligibilityAssessmentResponseSchema } from '../lib/eligibility-assessment.ts';

test('eligibility response JSON Schema meets the provider strict object contract at every nesting level', async () => {
  const format = await Output.object({ schema: eligibilityAssessmentResponseSchema }).responseFormat;
  assert.ok(format?.type === 'json');
  let objects = 0;
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, any>;
    if (node.type === 'object') {
      objects++;
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(new Set(node.required), new Set(Object.keys(node.properties)));
    }
    Object.values(node).forEach(visit);
  }
  visit(format.schema);
  assert.ok(objects > 10, 'nested evidence, classification and criterion objects must be covered');
});

test('provider evidence is required while older saved assessments retain their defaults', () => {
  const legacy = eligibilityAssessmentAiSchema.shape.structuredAssessment;
  assert.equal(legacy.safeParse(undefined).success, true);
  assert.equal(eligibilityAssessmentResponseSchema.shape.structuredAssessment.safeParse(undefined).success, false);
  const finding = { status: 'unknown', explanation: 'Nu exista dovezi.' };
  assert.deepEqual(legacy.unwrap().shape.expertRoleAssessment.parse(finding).deliverableEvidence, []);
  assert.equal(eligibilityAssessmentResponseSchema.shape.structuredAssessment.shape.expertRoleAssessment.safeParse(finding).success, false);
  assert.equal(eligibilityAssessmentResponseSchema.shape.criterionFindings.safeParse(undefined).success, false);
  assert.deepEqual(eligibilityAssessmentResponseSchema.shape.criterionFindings.parse([]), []);
});
