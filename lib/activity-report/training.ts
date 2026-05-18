import { ACTIVITY_REPORT_SYSTEM_PROMPT, buildTrainingUserPrompt } from './prompt.ts';
import type { ActivityReportRequest, ActivityReportTrainingExample } from './types.ts';

export function buildTrainingExample(
  input: ActivityReportRequest,
  validatedOutput: string,
  options?: { id?: string; createdAt?: string; tags?: string[]; notes?: string },
): ActivityReportTrainingExample {
  if (!validatedOutput.trim()) {
    throw new Error('Raportul validat este obligatoriu pentru exemplul de training.');
  }

  return {
    id: options?.id || createTrainingExampleId(),
    createdAt: options?.createdAt || new Date().toISOString(),
    expertName: input.expertName,
    expertRole: input.expertRole,
    month: input.month,
    year: input.year,
    projectCode: input.projectCode || '302141',
    input: {
      activities: input.activities,
      reportingRules: input.reportingRules,
    },
    validatedOutput,
    tags: options?.tags,
    notes: options?.notes,
  };
}

export function exportTrainingExamplesAsJsonl(examples: ActivityReportTrainingExample[]) {
  return examples.map((example) => JSON.stringify({
    messages: [
      { role: 'system', content: ACTIVITY_REPORT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildTrainingUserPrompt({
          expertName: example.expertName,
          expertRole: example.expertRole,
          month: example.month,
          year: example.year,
          projectCode: example.projectCode,
          activities: example.input.activities,
          reportingRules: example.input.reportingRules,
        }),
      },
      { role: 'assistant', content: example.validatedOutput },
    ],
  })).join('\n');
}

function createTrainingExampleId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `activity_report_${crypto.randomUUID()}`;
  }

  return `activity_report_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
