import type { DocumentClassification, OfferPackageDocumentInput, StandardDocumentType } from './types.ts';
import { normalizeEvaluationText } from './utils.ts';

type ClassificationRule = {
  docType: StandardDocumentType;
  confidence: number;
  signals: string[];
  patterns: string[];
};

export const CLASSIFICATION_RULES: ClassificationRule[] = [
  { docType: 'OPIS', confidence: 0.96, signals: ['opis'], patterns: ['opis', 'index documente'] },
  { docType: 'FORMULAR_1A', confidence: 0.95, signals: ['formular 1a'], patterns: ['formular 1a', 'informatii generale ofertant', 'informatii generale'] },
  { docType: 'FORMULAR_1B', confidence: 0.94, signals: ['formular 1b'], patterns: ['formular 1b', 'imputernicire'] },
  { docType: 'FORMULAR_1', confidence: 0.93, signals: ['formular 1'], patterns: ['formular 1 scrisoare', 'scrisoare de inaintare'] },
  { docType: 'FORMULAR_2', confidence: 0.91, signals: ['formular 2'], patterns: ['formular 2', 'calitatea de participant'] },
  { docType: 'FORMULAR_3', confidence: 0.94, signals: ['formular 3'], patterns: ['formular 3', 'eligibilitate', 'motive de excludere'] },
  { docType: 'FORMULAR_4', confidence: 0.94, signals: ['formular 4'], patterns: ['formular 4', 'conflict de interese'] },
  { docType: 'FORMULAR_5', confidence: 0.92, signals: ['formular 5'], patterns: ['formular 5', 'experienta similara'] },
  { docType: 'FORMULAR_6', confidence: 0.95, signals: ['formular 6'], patterns: ['formular 6', 'lista expertilor', 'lista experti'] },
  { docType: 'FORMULAR_7', confidence: 0.92, signals: ['formular 7'], patterns: ['formular 7', 'declaratie de disponibilitate'] },
  { docType: 'FORMULAR_8', confidence: 0.9, signals: ['formular 8'], patterns: ['formular 8', 'capacitate tehnica'] },
  { docType: 'FORMULAR_9', confidence: 0.9, signals: ['formular 9'], patterns: ['formular 9'] },
  { docType: 'FORMULAR_10', confidence: 0.9, signals: ['formular 10'], patterns: ['formular 10'] },
  { docType: 'FORMULAR_11', confidence: 0.94, signals: ['formular 11'], patterns: ['formular 11', 'beneficiarul real', 'beneficiar real'] },
  { docType: 'FORMULAR_12_ANEXA', confidence: 0.95, signals: ['anexa formular 12'], patterns: ['centralizator oferta financiara', 'formular 12 anexa', 'anexa financiara'] },
  { docType: 'FORMULAR_12', confidence: 0.94, signals: ['formular 12'], patterns: ['formular 12', 'formular de oferta financiara'] },
  { docType: 'FORMULAR_13', confidence: 0.9, signals: ['formular 13'], patterns: ['formular 13'] },
  { docType: 'OFERTA_TEHNICA', confidence: 0.88, signals: ['oferta tehnica'], patterns: ['oferta tehnica', 'propunere tehnica'] },
  { docType: 'OFERTA_FINANCIARA', confidence: 0.88, signals: ['oferta financiara'], patterns: ['oferta financiara', 'propunere financiara'] },
  { docType: 'CV', confidence: 0.85, signals: ['cv'], patterns: ['curriculum vitae', 'cv '] },
  { docType: 'DIPLOMA', confidence: 0.84, signals: ['diploma'], patterns: ['diploma', 'licenta', 'master'] },
  { docType: 'CERTIFICAT_FORMATOR', confidence: 0.88, signals: ['certificat formator'], patterns: ['certificat formator', 'certificare formator', 'cod cor 242401'] },
  { docType: 'RECOMANDARE', confidence: 0.82, signals: ['recomandare'], patterns: ['recomandare', 'scrisoare recomandare'] },
  { docType: 'ADEVERINTA', confidence: 0.82, signals: ['adeverinta'], patterns: ['adeverinta', 'atestare experienta'] },
  { docType: 'CONTRACT_SIMILAR', confidence: 0.82, signals: ['contract similar'], patterns: ['contract similar', 'contract prestari servicii'] },
  { docType: 'PROCES_VERBAL_RECEPTIE', confidence: 0.86, signals: ['proces verbal'], patterns: ['proces verbal receptie', 'buna executie', 'pv receptie'] },
  { docType: 'CALENDAR_IMPLEMENTARE', confidence: 0.82, signals: ['calendar'], patterns: ['calendar implementare', 'grafic implementare'] },
  { docType: 'DOCUMENT_PLATFORMA_ELEARNING', confidence: 0.82, signals: ['platforma e-learning'], patterns: ['platforma e learning', 'elearning', 'lms'] },
  { docType: 'CERTIFICAT_CONSTATATOR', confidence: 0.86, signals: ['certificat constatator'], patterns: ['certificat constatator', 'onrc'] },
];

export function classifyDocument(document: Pick<OfferPackageDocumentInput, 'id' | 'originalPath' | 'normalizedFilename' | 'extractedText'>): DocumentClassification {
  const haystack = normalizeEvaluationText([document.originalPath, document.normalizedFilename, document.extractedText?.slice(0, 3000)].filter(Boolean).join(' '));
  const matches = CLASSIFICATION_RULES
    .map((rule) => ({
      rule,
      hits: rule.patterns.filter((pattern) => haystack.includes(normalizeEvaluationText(pattern))),
    }))
    .filter((match) => match.hits.length > 0)
    .sort((a, b) => b.rule.confidence + b.hits.length * 0.03 - (a.rule.confidence + a.hits.length * 0.03));

  const best = matches[0];
  if (!best) {
    return {
      documentId: document.id,
      docType: 'NECLASIFICAT',
      confidence: 0.2,
      source: 'deterministic',
      signals: [],
      reviewRequired: true,
    };
  }

  const confidence = Math.min(0.99, best.rule.confidence + (best.hits.length - 1) * 0.03);
  return {
    documentId: document.id,
    docType: best.rule.docType,
    confidence,
    source: 'deterministic',
    signals: [...best.rule.signals, ...best.hits],
    reviewRequired: confidence < 0.8 || best.rule.docType === 'NECLASIFICAT',
  };
}

export function classifyDocuments(documents: OfferPackageDocumentInput[]) {
  return documents.map(classifyDocument);
}
