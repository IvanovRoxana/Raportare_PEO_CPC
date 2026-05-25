import type { ActivityDraftForValidation } from '../pontaj-rules.ts';
import { validateActivitiesBeforeCreate } from '../pontaj-rules.ts';
import type { Expert } from '../types.ts';

export function validateStandardActivityDraft(args: {
  expert: Partial<Expert>;
  existingActivities: ActivityDraftForValidation[];
  newActivities: ActivityDraftForValidation[];
  month: number;
  year: number;
}) {
  return validateActivitiesBeforeCreate(args);
}
