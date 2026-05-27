import { CLASSIFICATION_RULES } from './classification.ts';
import { LEARNING_HUB_COURSE_PROFILES } from './courses.ts';
import type { ProcurementEvaluationSnapshot } from './types.ts';

export const PROCUREMENT_EVALUATION_EXPORT_SHEETS = [
  'README',
  'Schema_Campuri',
  'Cursuri_Relevanta',
  'Matrice_Validare',
  'Reguli_Clasificare',
  'Reguli_Executabile',
  'Registru_Documente',
  'Experti',
  'Mapare_Expert_Curs',
  'Experienta_Similara',
  'Financiar',
  'Scoring',
  'Nomenclatoare',
] as const;

export function buildProcurementEvaluationWorkbookRows(snapshot: ProcurementEvaluationSnapshot) {
  return {
    README: [
      ['Foaie', 'Rol', 'Cum se foloseste'],
      ['README', 'Ghid rapid', 'Cititi aceasta foaie prima data.'],
      ['Registru_Documente', 'Registru operational', 'Toate fisierele primite si clasificate.'],
      ['Mapare_Expert_Curs', 'Control expert-curs', 'Ani declarati si dovediti sunt pastrati separat.'],
      ['Scoring', 'Punctaj final', 'Se calculeaza doar pentru oferte conforme.'],
    ],
    Schema_Campuri: [
      ['Doc Type', 'Category', 'Mandatory', 'Purpose', 'Field', 'Label', 'Data Type', 'Required', 'Source', 'Notes'],
      ['FORMULAR_6', 'Capacitate tehnica', 'Da', 'Lista expertilor', 'years_claimed_f6', 'Ani declarati Formular 6', 'number', 'Da', 'formular', 'Nu se foloseste direct la scoring fara dovezi.'],
      ['CV', 'Expert', 'Da', 'Experienta declarata', 'years_claimed_cv', 'Ani declarati CV', 'number', 'Da', 'CV', 'Trebuie sustinut prin dovezi.'],
      ['DOVEZI', 'Expert', 'Da', 'Experienta dovedita', 'years_proven_general', 'Ani dovediti', 'number', 'Da', 'recomandari/adeverinte/contracte/PV', 'Singura valoare folosita la eligibilitate si scoring.'],
    ],
    Cursuri_Relevanta: LEARNING_HUB_COURSE_PROFILES.flatMap((course) => [
      [course.courseId, course.courseName, course.deliveryFormat, 'core_keyword', course.coreKeywords.join('; '), 'Potrivire nucleu'],
      [course.courseId, course.courseName, course.deliveryFormat, 'strong_evidence_terms', course.strongEvidenceTerms.join('; '), 'Dovezi puternice'],
    ]),
    Matrice_Validare: [
      ['Rule ID', 'Requirement', 'Source Docs', 'Check Type', 'Logic', 'Severity', 'Execution Mode', 'Status', 'Observed Value', 'Reviewer Notes'],
      ...snapshot.validationResults.map((result) => [result.ruleId, result.requirement, result.sourceDocumentIds.join('; '), 'automat', result.requirement, result.severity, 'Automat + review', result.status, result.observedValue ?? '', result.reviewerNotes ?? '']),
    ],
    Reguli_Clasificare: [
      ['Rule ID', 'Signal', 'Action', 'Priority'],
      ...CLASSIFICATION_RULES.map((rule, index) => [`R${String(index + 1).padStart(3, '0')}`, rule.patterns.join('; '), `Mapeaza ${rule.docType}`, rule.confidence >= 0.9 ? 'Ridicat' : 'Mediu']),
    ],
    Reguli_Executabile: [
      ['Rule Code', 'Rule Name', 'Entity', 'Trigger', 'Logic', 'Inputs', 'Output'],
      ['ER01', 'Normalizare expert-curs', 'expert_course_mapping', 'Formular 6 + documente suport', 'Creeaza cate o inregistrare per expert x curs.', 'F6, CV, dovezi', 'mapare completa'],
      ['ER02', 'Ani dovediti', 'expert_course_mapping', 'Dovezi expert', 'Uneste intervale suprapuse si calculeaza ani general/online.', 'intervale', 'ani dovediti'],
      ['ER03', 'Gap declarat vs dovedit', 'expert_course_mapping', 'Dupa ER02', 'Compara F6/CV cu dovezi si marcheaza review.', 'ani declarati/dovediti', 'gap flag'],
      ['ER04', 'Scor lexical curs', 'expert_course_mapping', 'Dupa extragere text', 'Compara dovezi+CV cu profil curs.', 'keywords', 'relevanta'],
    ],
    Registru_Documente: [
      ['Document ID', 'Procurement ID', 'Supplier ID', 'Supplier Name', 'Package ID', 'Original Path', 'Normalized Filename', 'Extension', 'Page Count', 'Doc Type', 'Confidence', 'Review Required', 'Hash', 'Storage Path', 'Text Status', 'OCR Used', 'Signature Present', 'Qualified Signature Status', 'Import Date'],
      ...snapshot.documents.map((document) => {
        const classification = snapshot.classifications.find((item) => item.documentId === document.id);
        return [document.id, document.procurementProjectId, document.supplierId, document.supplierName, document.packageId, document.originalPath, document.normalizedFilename, document.extension, document.pageCount ?? '', classification?.docType ?? '', classification?.confidence ?? '', classification?.reviewRequired ? 'Da' : 'Nu', document.hash ?? '', document.storagePath ?? '', document.extractionStatus ?? '', document.ocrUsed ? 'Da' : 'Nu', document.signaturePresent ? 'Da' : 'Nu', document.qualifiedSignatureStatus ?? '', document.importedAt];
      }),
    ],
    Experti: [
      ['Supplier ID', 'Supplier Name', 'Expert ID', 'Expert Name', 'Role', 'CV', 'Diploma', 'Certificare formator', 'Declaratie disponibilitate', 'Notes'],
      ...snapshot.experts.map((expert) => [expert.supplierId, expert.supplierName, expert.id, expert.expertName, expert.role, expert.cvDocumentId ?? '', expert.diplomaDocumentId ?? '', expert.trainerCertificateDocumentId ?? '', expert.availabilityDocumentId ?? '', expert.notes ?? '']),
    ],
    Mapare_Expert_Curs: [
      ['Supplier ID', 'Supplier Name', 'Expert Name', 'Role', 'Course Name', 'Course Spec Keywords', 'Experience Claim F6', 'Experience Claim CV', 'Relevant Years Proven', 'Online Years Proven', 'Support Docs', 'CV vs Evidence', 'F6 vs Evidence', 'Course Relevance', 'Gap', 'Eligibility', 'Selected', 'Confidence', 'Reviewer Notes'],
      ...snapshot.expertCourseMappings.map((mapping) => [mapping.supplierId, mapping.supplierName, mapping.expertName, mapping.role, mapping.courseName, mapping.courseKeywords.join('; '), mapping.yearsClaimedF6 ?? '', mapping.yearsClaimedCv ?? '', mapping.yearsProvenGeneral, mapping.yearsOnlineProven, mapping.supportDocumentIds.join('; '), mapping.cvMatchesEvidence, mapping.f6MatchesEvidence, mapping.courseRelevance, mapping.declaredVsProvenGap, mapping.eligibilityDecision, mapping.selectedForScoring ? 'Da' : 'Nu', mapping.confidence, mapping.reviewerNotes ?? '']),
    ],
    Experienta_Similara: [
      ['Supplier ID', 'Supplier Name', 'Reference ID', 'Beneficiary', 'Contract No', 'Object', 'Value RON ex VAT', 'Start Date', 'End Date', 'Online Evidence', 'Support Docs', 'Status'],
      ...snapshot.similarExperience.map((item) => [item.supplierId, item.supplierName, item.id, item.beneficiary ?? '', item.contractNo ?? '', item.object ?? '', item.valueRonExVat ?? '', item.startDate ?? '', item.endDate ?? '', item.onlineEvidence ? 'Da' : 'Nu', item.supportDocumentIds.join('; '), item.status]),
    ],
    Financiar: [
      ['Supplier ID', 'Supplier Name', 'Currency', 'Total Price Ex VAT', 'VAT', 'Total Price With VAT', 'Offer Validity Days', 'Price Firm', 'Form 12 Present', 'Annex Present', 'Totals Match', 'Status'],
      ...snapshot.financialOffers.map((offer) => [offer.supplierId, offer.supplierName, offer.currency, offer.totalPriceExVat ?? '', offer.vat ?? '', offer.totalPriceWithVat ?? '', offer.offerValidityDays ?? '', offer.priceFirm ? 'Da' : 'Nu', offer.form12Present ? 'Da' : 'Nu', offer.annexPresent ? 'Da' : 'Nu', offer.totalsMatch ? 'Da' : 'Nu', offer.status]),
    ],
    Scoring: [
      ['Supplier ID', 'Supplier Name', 'Blocking Validation Pass', 'CT1 Coordinator Score', 'CT2 Trainers Score', 'CT3 Online Score', 'Price Ex VAT', 'Price Score', 'Total Score', 'Rank', 'Status'],
      ...snapshot.scoringResults.map((score) => [score.supplierId, score.supplierName, score.blockingValidationPass ? 'Da' : 'Nu', score.ct1CoordinatorScore, score.ct2TrainersScore, score.ct3OnlineScore, score.priceExVat ?? '', score.priceScore, score.totalScore, score.rank ?? '', score.status]),
    ],
    Nomenclatoare: [
      ['Type', 'Value'],
      ['Validation Severity', 'Blocant'],
      ['Validation Severity', 'Major'],
      ['Validation Severity', 'Informativ'],
      ['Validation Status', 'Conform'],
      ['Validation Status', 'Neconform'],
      ['Validation Status', 'Review'],
      ['Manual Review', 'Da'],
    ],
  };
}

export async function exportProcurementEvaluationWorkbook(snapshot: ProcurementEvaluationSnapshot) {
  const XLSX = await import('xlsx');
  const rowsBySheet = buildProcurementEvaluationWorkbookRows(snapshot);
  const workbook = XLSX.utils.book_new();
  PROCUREMENT_EVALUATION_EXPORT_SHEETS.forEach((sheetName) => {
    const worksheet = XLSX.utils.aoa_to_sheet(rowsBySheet[sheetName]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });
  XLSX.writeFile(workbook, `centralizare-evaluare-${snapshot.package.supplierName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`);
}
