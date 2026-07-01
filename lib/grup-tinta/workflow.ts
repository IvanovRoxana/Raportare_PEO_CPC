import { GT_ENTITY_REQUIRED_DOCS, GT_PERSON_REQUIRED_DOCS } from './document-requirements.ts';
import type { GTDocument, GTEntity, GTPerson, GTStatus } from './types.ts';

const ENTITY_READY_STATUSES: GTStatus[] = ['eligibil_validat', 'inscris_mysmis', 'in_operatiune'];

function hasValidDocument(documents: GTDocument[], documentType: string) {
  return documents.some((document) => document.documentType === documentType && document.status === 'validat');
}

function missingRequiredDocuments(documents: GTDocument[], requiredDocuments: readonly string[]) {
  return requiredDocuments.filter((documentType) => !hasValidDocument(documents, documentType));
}

export function canValidateEntity(entity: GTEntity, documents: GTDocument[]): { ok: boolean; reason?: string; missingDocuments: string[] } {
  const missingDocuments = missingRequiredDocuments(documents, GT_ENTITY_REQUIRED_DOCS);
  if (!entity.organizationId) {
    return { ok: false, reason: 'Entitatea GT nu este legata de o organizatie din director.', missingDocuments };
  }
  if (missingDocuments.length > 0) {
    return { ok: false, reason: 'Dosarul entitatii nu are toate documentele obligatorii validate.', missingDocuments };
  }
  if (entity.status === 'respins' || entity.status === 'iesit_din_operatiune') {
    return { ok: false, reason: 'Statusul curent nu permite validarea fara redeschiderea dosarului.', missingDocuments };
  }
  return { ok: true, missingDocuments };
}

export function canValidatePerson(person: GTPerson, entity: GTEntity, documents: GTDocument[]): { ok: boolean; reason?: string; missingDocuments: string[] } {
  const missingDocuments = missingRequiredDocuments(documents, GT_PERSON_REQUIRED_DOCS);
  if (!person.gtEntityId || person.gtEntityId !== entity.id) {
    return { ok: false, reason: 'Persoana nu este legata de entitatea GT corecta.', missingDocuments };
  }
  if (!ENTITY_READY_STATUSES.includes(entity.status)) {
    return { ok: false, reason: 'Entitatea parinte nu este inca validata in GT.', missingDocuments };
  }
  if (!person.consimtamantGDPRAt) {
    return { ok: false, reason: 'Lipseste consimtamantul GDPR.', missingDocuments };
  }
  if (missingDocuments.length > 0) {
    return { ok: false, reason: 'Dosarul persoanei nu are toate documentele obligatorii validate.', missingDocuments };
  }
  return { ok: true, missingDocuments };
}

export function isEntityReadyForPersonValidation(status: GTStatus) {
  return ENTITY_READY_STATUSES.includes(status);
}
