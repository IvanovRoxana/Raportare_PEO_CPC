import type { DeliverableSlot } from '../deliverable-types.ts';

export interface DeliverablesDraftValidationResult {
  ok: boolean;
  warnings: string[];
}

export function validateDeliverablesDraft(deliverables: DeliverableSlot[]): DeliverablesDraftValidationResult {
  const warnings: string[] = [];

  const invalidTitleDeliverable = deliverables.find((deliverable) => (
    deliverable.uploaded
    && !deliverable.isPhoto
    && (
      !deliverable.titleConfirmed
      || deliverable.titleCheckStatus === 'mismatch'
      || deliverable.titleCheckStatus === 'extraction_failed'
      || deliverable.titleMatch === false
    )
  ));

  if (invalidTitleDeliverable) {
    warnings.push(
      invalidTitleDeliverable.titleCheckMessage
      || 'Titlul livrabilului trebuie confirmat si trebuie sa se regaseasca in prima pagina.',
    );
  }

  return {
    ok: warnings.length === 0,
    warnings,
  };
}
