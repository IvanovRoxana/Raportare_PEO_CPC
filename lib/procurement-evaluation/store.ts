'use client';

import { getAwsDataClient, isAwsAvailable } from '@/lib/aws/client';
import type { ProcurementEvaluationSnapshot } from './types.ts';

function assertNoErrors(result: { errors?: unknown }, action: string) {
  if (result.errors) {
    throw new Error(`${action} failed: ${JSON.stringify(result.errors)}`);
  }
}

async function createMany(model: any, rows: Record<string, unknown>[], action: string) {
  if (!model) return 0;
  let saved = 0;
  for (const row of rows) {
    const result = await model.create(row);
    assertNoErrors(result, action);
    saved += 1;
  }
  return saved;
}

export async function saveProcurementEvaluationSnapshot(snapshot: ProcurementEvaluationSnapshot) {
  if (!isAwsAvailable()) {
    return { saved: false, counts: {}, message: 'Amplify nu este configurat în acest mediu.' };
  }

  const client = getAwsDataClient() as any;
  const models = client.models as Record<string, any>;
  const packageResult = await models.ProcurementOfferPackage?.create({
    id: snapshot.package.id,
    procurementProjectId: snapshot.package.procurementProjectId,
    supplierId: snapshot.package.supplierId,
    supplierName: snapshot.package.supplierName,
    originalRootName: snapshot.package.originalRootName,
    importedAt: snapshot.package.importedAt,
    documentCount: snapshot.documents.length,
    status: snapshot.package.status,
    notes: snapshot.package.notes,
  });
  if (packageResult) assertNoErrors(packageResult, 'AWS create ProcurementOfferPackage');

  const counts = {
    documents: await createMany(
      models.ProcurementOfferDocument,
      snapshot.documents.map((document) => {
        const classification = snapshot.classifications.find((item) => item.documentId === document.id);
        return {
          id: document.id,
          procurementProjectId: document.procurementProjectId,
          supplierId: document.supplierId,
          supplierName: document.supplierName,
          packageId: document.packageId,
          originalPath: document.originalPath,
          normalizedFilename: document.normalizedFilename,
          extension: document.extension,
          sizeBytes: document.sizeBytes,
          hash: document.hash,
          storagePath: document.storagePath,
          mimeType: document.mimeType,
          importedAt: document.importedAt,
          extractedText: document.extractedText,
          extractionStatus: document.extractionStatus,
          extractionWarnings: document.extractionWarnings,
          ocrUsed: document.ocrUsed,
          pageCount: document.pageCount,
          signaturePresent: document.signaturePresent,
          qualifiedSignatureStatus: document.qualifiedSignatureStatus,
          signatureValidationProvider: document.signatureValidationProvider,
          signatureValidatedAt: document.signatureValidatedAt,
          signatureValidationNotes: document.signatureValidationNotes,
          docType: classification?.docType ?? 'NECLASIFICAT',
          classificationConfidence: classification?.confidence,
          classificationSource: classification?.source,
          reviewRequired: classification?.reviewRequired ?? false,
          aiReason: classification?.aiReason,
          status: classification?.reviewRequired ? 'Review' : 'Conform',
        };
      }),
      'AWS create ProcurementOfferDocument',
    ),
    extractedFields: await createMany(
      models.ProcurementExtractedField,
      snapshot.extractedFields.map((field) => ({
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: snapshot.package.supplierId,
        documentId: field.documentId,
        field: field.field,
        label: field.label,
        valueJson: field.value,
        confidence: field.confidence,
        source: field.source,
        reviewRequired: field.reviewRequired,
      })),
      'AWS create ProcurementExtractedField',
    ),
    experts: await createMany(
      models.ProcurementEvaluationExpert,
      snapshot.experts.map((expert) => ({
        id: expert.id,
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: expert.supplierId,
        supplierName: expert.supplierName,
        expertName: expert.expertName,
        role: expert.role,
        cvDocumentId: expert.cvDocumentId,
        diplomaDocumentId: expert.diplomaDocumentId,
        trainerCertificateDocumentId: expert.trainerCertificateDocumentId,
        availabilityDocumentId: expert.availabilityDocumentId,
        notes: expert.notes,
      })),
      'AWS create ProcurementEvaluationExpert',
    ),
    mappings: await createMany(
      models.ProcurementExpertCourseMapping,
      snapshot.expertCourseMappings.map((mapping) => ({
        id: mapping.id,
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: mapping.supplierId,
        supplierName: mapping.supplierName,
        expertId: mapping.expertId,
        expertName: mapping.expertName,
        role: mapping.role,
        courseId: mapping.courseId,
        courseName: mapping.courseName,
        courseKeywords: mapping.courseKeywords,
        yearsClaimedF6: mapping.yearsClaimedF6,
        yearsClaimedCv: mapping.yearsClaimedCv,
        yearsProvenGeneral: mapping.yearsProvenGeneral,
        yearsOnlineClaimed: mapping.yearsOnlineClaimed,
        yearsOnlineProven: mapping.yearsOnlineProven,
        supportDocumentIds: mapping.supportDocumentIds,
        cvMatchesEvidence: mapping.cvMatchesEvidence,
        f6MatchesEvidence: mapping.f6MatchesEvidence,
        courseRelevance: mapping.courseRelevance,
        keywordMatchScore: mapping.keywordMatchScore,
        declaredVsProvenGap: mapping.declaredVsProvenGap,
        eligibilityDecision: mapping.eligibilityDecision,
        selectedForScoring: mapping.selectedForScoring,
        confidence: mapping.confidence,
        reviewerNotes: mapping.reviewerNotes,
      })),
      'AWS create ProcurementExpertCourseMapping',
    ),
    similarExperience: await createMany(
      models.ProcurementSimilarExperience,
      snapshot.similarExperience.map((item) => ({
        id: item.id,
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        beneficiary: item.beneficiary,
        contractNo: item.contractNo,
        object: item.object,
        valueRonExVat: item.valueRonExVat,
        startDate: item.startDate,
        endDate: item.endDate,
        onlineEvidence: item.onlineEvidence,
        supportDocumentIds: item.supportDocumentIds,
        status: item.status,
      })),
      'AWS create ProcurementSimilarExperience',
    ),
    financialOffers: await createMany(
      models.ProcurementFinancialOffer,
      snapshot.financialOffers.map((offer) => ({
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: offer.supplierId,
        supplierName: offer.supplierName,
        currency: offer.currency,
        totalPriceExVat: offer.totalPriceExVat,
        vat: offer.vat,
        totalPriceWithVat: offer.totalPriceWithVat,
        offerValidityDays: offer.offerValidityDays,
        priceFirm: offer.priceFirm,
        form12Present: offer.form12Present,
        annexPresent: offer.annexPresent,
        totalsMatch: offer.totalsMatch,
        status: offer.status,
      })),
      'AWS create ProcurementFinancialOffer',
    ),
    validations: await createMany(
      models.ProcurementValidationResult,
      snapshot.validationResults.map((validation) => ({
        id: validation.id,
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: snapshot.package.supplierId,
        ruleId: validation.ruleId,
        requirement: validation.requirement,
        severity: validation.severity,
        status: validation.status,
        observedValue: validation.observedValue,
        sourceDocumentIds: validation.sourceDocumentIds,
        reviewerNotes: validation.reviewerNotes,
      })),
      'AWS create ProcurementValidationResult',
    ),
    scoring: await createMany(
      models.ProcurementScoringResult,
      snapshot.scoringResults.map((score) => ({
        procurementProjectId: snapshot.package.procurementProjectId,
        supplierId: score.supplierId,
        supplierName: score.supplierName,
        blockingValidationPass: score.blockingValidationPass,
        ct1CoordinatorScore: score.ct1CoordinatorScore,
        ct2TrainersScore: score.ct2TrainersScore,
        ct3OnlineScore: score.ct3OnlineScore,
        priceExVat: score.priceExVat,
        priceScore: score.priceScore,
        totalScore: score.totalScore,
        rank: score.rank,
        status: score.status,
      })),
      'AWS create ProcurementScoringResult',
    ),
  };

  return { saved: true, counts, message: 'Snapshot evaluare salvat în Amplify.' };
}
