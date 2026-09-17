import { evaluationHash } from './eligibility-evaluation.ts';
import type { Deliverable } from './types.ts';

export type EligibilityActivityBinding = {
  activityId: string; date: string; saCode?: string; catalogActivityId?: string;
  documents: Array<{ id: string; fileHash: string }>; manifestHash?: string;
};

/** Edits and additions cannot inherit an old verdict from a saved activity. */
export function eligibilityActivityManifest(documents: Deliverable[]) {
  return evaluationHash(documents.map((doc) => ({ id: doc.id, documentId: doc.documentId,
    fileHash: doc.fileHash, s3Key: doc.s3Key, title: doc.declaredTitle || doc.docTitle || doc.originalFileName || doc.fileName,
    deliverableType: doc.deliverableType,
  })).sort((a, b) => a.id.localeCompare(b.id)));
}
