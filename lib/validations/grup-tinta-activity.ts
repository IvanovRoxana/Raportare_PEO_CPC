import type { ActivityDraftForValidation } from '../pontaj-rules.ts';
import { validateActivitiesBeforeCreate } from '../pontaj-rules.ts';
import type { Expert, GrupTintaEntry } from '../types.ts';

export function validateGrupTintaActivityDraft(args: {
  expert: Partial<Expert>;
  existingActivities: ActivityDraftForValidation[];
  newActivities: ActivityDraftForValidation[];
  grupTinta: GrupTintaEntry[];
  month: number;
  year: number;
}) {
  const timesheetValidation = validateActivitiesBeforeCreate(args);
  if (!timesheetValidation.ok) return timesheetValidation;

  const invalidEntry = args.grupTinta.find((entry) =>
    (entry.organizations?.length ?? 0) === 0 || Number(entry.participantsCount) < 0
  );

  if (invalidEntry) {
    return {
      ok: false,
      message: 'Intrarea de grup tinta trebuie sa aiba organizatii si un numar valid de participanti.',
    };
  }

  return timesheetValidation;
}
