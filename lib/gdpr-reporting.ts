import type { DeliverableSlot } from './deliverable-types';

export type GdprTemplateCode =
  | 'GDPR_GT_MON'
  | 'GDPR_DOC_GT'
  | 'GDPR_PUBLICARE'
  | 'GDPR_ONLINE_MEET'
  | 'GDPR_BUSINESS_HUB'
  | 'GDPR_ACH_LANSARE'
  | 'GDPR_ACH_EVAL'
  | 'GDPR_ACH_CONTRACT'
  | 'GDPR_FACT_PLATA'
  | 'GDPR_EVENT_CHECK'
  | 'GDPR_EVENT_PRE'
  | 'GDPR_EVENT_IMPL'
  | 'GDPR_STATUS_PEO'
  | 'GDPR_RAPORT_LUNAR';

export type GdprConclusionCode =
  | 'conform_fara_neconformitati'
  | 'conform_cu_recomandari'
  | 'conform_partial'
  | 'neconform_cu_remediere'
  | 'fara_prelucrari_directe';

export type GdprFieldType = 'text' | 'textarea' | 'number' | 'select' | 'multi' | 'boolean';

export type GdprMetaValue = string | number | boolean | string[] | undefined;
export type GdprMeta = Record<string, GdprMetaValue>;

export interface GdprFieldDefinition {
  key: string;
  label: string;
  type: GdprFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface GdprTemplate {
  code: GdprTemplateCode;
  label: string;
  activityTitle: string;
  saCode: string;
  defaultHours: number;
  deliverableTitle: string;
  deliverableType: string;
  requiresDeliverable: boolean;
  fields: GdprFieldDefinition[];
}

export interface GdprGenerationInput {
  templateCode: GdprTemplateCode;
  meta: GdprMeta;
  date?: string;
  expertName?: string;
  expertRole?: string;
  projectCode?: string;
  projectTitle?: string;
}

export interface GdprValidationResult {
  ok: boolean;
  missingFields: string[];
  warnings: string[];
}

const personalDataOptions = [
  'nume si prenume',
  'functie',
  'organizatie',
  'email',
  'telefon',
  'semnatura',
  'imagine foto/video',
  'voce / inregistrare audio',
  'date reprezentant legal',
  'date financiar-contabile',
  'date eligibilitate GT',
  'date acces / loguri',
];

const gdprBasisOptions = [
  'consimtamant',
  'executarea unui contract',
  'obligatie legala',
  'interes legitim',
  'interes public / implementare proiect',
  'masuri precontractuale',
  'obligatii financiar-contabile',
];

export const GDPR_CONCLUSION_OPTIONS: Array<{ code: GdprConclusionCode; label: string; text: string }> = [
  {
    code: 'conform_fara_neconformitati',
    label: 'Conform, fara neconformitati',
    text: 'nu au fost identificate neconformitati sau incidente privind protectia datelor cu caracter personal',
  },
  {
    code: 'conform_cu_recomandari',
    label: 'Conform, cu recomandari',
    text: 'activitatea analizata este conforma cu cerintele GDPR, fiind formulate recomandari pentru imbunatatirea documentarii, trasabilitatii si arhivarii datelor',
  },
  {
    code: 'conform_partial',
    label: 'Conform partial, necesita clarificari',
    text: 'au fost identificate aspecte punctuale care necesita clarificare sau completare, fara impact semnificativ asupra conformitatii generale',
  },
  {
    code: 'neconform_cu_remediere',
    label: 'Neconform, necesita masuri',
    text: 'au fost identificate neconformitati care necesita masuri corective si monitorizare ulterioara',
  },
  {
    code: 'fara_prelucrari_directe',
    label: 'Fara prelucrari directe CPC',
    text: 'nu au fost identificate prelucrari directe de date cu caracter personal de catre CPC, rolul fiind limitat la suport logistic sau operational',
  },
];

const commonFields: GdprFieldDefinition[] = [
  { key: 'obiectVerificare', label: 'Obiect verificare', type: 'textarea', required: true, placeholder: 'Ex: comunicate, registru GT, eveniment, procedura de achizitie...' },
  { key: 'documenteAnalizate', label: 'Documente analizate', type: 'multi', required: true, placeholder: 'Adauga documentele separate prin virgula' },
  { key: 'datePersonale', label: 'Date personale implicate', type: 'multi', required: true, options: personalDataOptions },
  { key: 'temeiGdpr', label: 'Temei GDPR', type: 'multi', required: true, options: gdprBasisOptions },
  { key: 'recomandari', label: 'Recomandari', type: 'textarea', placeholder: 'Optional pentru activitati conforme; obligatoriu pentru neconformitati.' },
];

export const GDPR_TEMPLATES: GdprTemplate[] = [
  {
    code: 'GDPR_GT_MON',
    label: 'Monitorizare GDPR Grup Tinta',
    activityTitle: 'Monitorizare GDPR activitati Grup Tinta',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport de verificare GDPR privind monitorizarea activitatilor grupului tinta',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'lunaAnalizata', label: 'Luna analizata', type: 'text', required: true },
      { key: 'operatiuniRealizate', label: 'Operatiuni realizate', type: 'multi', required: true, placeholder: 'validare, deduplicare, corelare, MySMIS' },
    ],
  },
  {
    code: 'GDPR_DOC_GT',
    label: 'Verificare documente inscriere GT',
    activityTitle: 'Verificare GDPR documente inscriere Grup Tinta',
    saCode: 'SA1.1',
    defaultHours: 3,
    deliverableTitle: 'Raport preliminar verificare documente inscriere GT',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'entitate', label: 'Entitate / dosar', type: 'text', required: true },
      { key: 'tipDosar', label: 'Tip dosar/documente', type: 'text', required: true },
      { key: 'dosarComplet', label: 'Dosar complet', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_PUBLICARE',
    label: 'Verificare GDPR publicare online',
    activityTitle: 'Verificare GDPR publicare online',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar privind verificarea respectarii GDPR in publicarea online',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'lunaAnalizata', label: 'Luna publicarii', type: 'text', required: true },
      { key: 'tipMateriale', label: 'Tip materiale', type: 'multi', required: true, placeholder: 'comunicate, anunturi, stiri, evenimente' },
      { key: 'canalPublicare', label: 'Canal publicare', type: 'multi', required: true, placeholder: 'website, LinkedIn, email, parteneri' },
      { key: 'includeImagini', label: 'Include imagini/foto-video', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_ONLINE_MEET',
    label: 'Verificare GDPR intalniri online',
    activityTitle: 'Verificare GDPR intalniri online',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar privind protectia datelor in intalniri online',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'perioadaAnalizata', label: 'Perioada analizata', type: 'text', required: true },
      { key: 'platforma', label: 'Platforma', type: 'multi', required: true, placeholder: 'Teams, Zoom' },
      { key: 'existaInregistrari', label: 'Au existat inregistrari', type: 'boolean' },
      { key: 'partajareEcran', label: 'A existat partajare ecran', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_BUSINESS_HUB',
    label: 'Verificare GDPR Business HUB',
    activityTitle: 'Verificare GDPR Business HUB',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport privind evenimentele desfasurate in Business HUB - protectia datelor',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'lunaAnalizata', label: 'Luna analizata', type: 'text', required: true },
      { key: 'numarEvenimente', label: 'Numar evenimente', type: 'number', required: true },
      { key: 'responsabilHub', label: 'Responsabil HUB', type: 'text', required: true },
      { key: 'rolHub', label: 'Rol HUB', type: 'select', required: true, options: ['suport logistic', 'suport tehnic', 'prelucrare directa date', 'mixt'] },
    ],
  },
  {
    code: 'GDPR_ACH_LANSARE',
    label: 'Achizitie - lansare procedura',
    activityTitle: 'Verificare GDPR lansare achizitie',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar verificare GDPR lansare procedura competitiva',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'denumireAchizitie', label: 'Denumire achizitie', type: 'text', required: true },
      { key: 'canalTransmitere', label: 'Canal transmitere/depunere', type: 'text', required: true },
    ],
  },
  {
    code: 'GDPR_ACH_EVAL',
    label: 'Achizitie - evaluare oferte',
    activityTitle: 'Verificare GDPR evaluare oferte',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar verificare GDPR evaluare oferte si rezultate licitatie',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'denumireAchizitie', label: 'Denumire achizitie', type: 'text', required: true },
      { key: 'furnizorOfertanti', label: 'Ofertanti / furnizori', type: 'multi', required: true },
      { key: 'membriComisie', label: 'Membri comisie', type: 'multi' },
    ],
  },
  {
    code: 'GDPR_ACH_CONTRACT',
    label: 'Achizitie - contractare',
    activityTitle: 'Verificare GDPR incheiere contract',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar verificare GDPR incheiere contract',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'denumireAchizitie', label: 'Denumire achizitie / contract', type: 'text', required: true },
      { key: 'furnizorOfertanti', label: 'Furnizor', type: 'text', required: true },
      { key: 'rolFurnizor', label: 'Rol furnizor', type: 'select', required: true, options: ['operator', 'imputernicit', 'tert', 'neaplicabil'] },
      { key: 'clauzeGdpr', label: 'Exista clauze GDPR', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_FACT_PLATA',
    label: 'Facturare / plata / receptie',
    activityTitle: 'Verificare GDPR facturare, plata si receptie',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar verificare GDPR facturare si plata',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'furnizorOfertanti', label: 'Furnizor / prestator', type: 'text', required: true },
      { key: 'documenteFinanciare', label: 'Documente financiar-contabile', type: 'multi', required: true, placeholder: 'factura, PV receptie, ordin plata' },
    ],
  },
  {
    code: 'GDPR_EVENT_CHECK',
    label: 'Eveniment - checklist GDPR',
    activityTitle: 'Checklist GDPR organizare eveniment',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Checklist GDPR pentru organizarea evenimentului',
    deliverableType: 'Lista de control GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'locatieEveniment', label: 'Locatie', type: 'text', required: true },
      { key: 'listaPrezenta', label: 'Lista de prezenta', type: 'boolean' },
      { key: 'fotoVideo', label: 'Foto/video', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_EVENT_PRE',
    label: 'Eveniment - nota pre-eveniment',
    activityTitle: 'Nota interna pre-eveniment GDPR',
    saCode: 'SA1.1',
    defaultHours: 3,
    deliverableTitle: 'Nota interna de verificare si completare checklist pre-eveniment',
    deliverableType: 'Nota instruire GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'locatieEveniment', label: 'Locatie', type: 'text', required: true },
      { key: 'checklistAsociat', label: 'Checklist asociat', type: 'text', required: true },
      { key: 'riscuriIdentificate', label: 'Riscuri identificate', type: 'textarea' },
    ],
  },
  {
    code: 'GDPR_EVENT_IMPL',
    label: 'Eveniment - monitorizare implementare',
    activityTitle: 'Monitorizare implementare eveniment din perspectiva GDPR',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport preliminar monitorizare implementare eveniment',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'locatieEveniment', label: 'Locatie', type: 'text', required: true },
      { key: 'masuriAplicate', label: 'Masuri aplicate', type: 'multi', required: true },
      { key: 'incidente', label: 'Au existat incidente', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_STATUS_PEO',
    label: 'Sedinta status PEO',
    activityTitle: 'Sedinta status PEO - aspecte GDPR',
    saCode: 'SA1.1',
    defaultHours: 2,
    deliverableTitle: 'Minuta / nota de participare status PEO',
    deliverableType: 'Proces verbal verificare',
    requiresDeliverable: false,
    fields: [
      { key: 'temaSedinta', label: 'Tema sedinta', type: 'text', required: true },
      { key: 'participanti', label: 'Participanti', type: 'multi' },
    ],
  },
  {
    code: 'GDPR_RAPORT_LUNAR',
    label: 'Elaborare raport lunar',
    activityTitle: 'Elaborare raport lunar GDPR - Anexa 10',
    saCode: 'SA1.1',
    defaultHours: 2,
    deliverableTitle: 'Raport de activitate lunar - Anexa 10',
    deliverableType: 'Raport de monitorizare',
    requiresDeliverable: false,
    fields: [
      { key: 'lunaAnalizata', label: 'Luna raportare', type: 'text', required: true },
      { key: 'totalOre', label: 'Total ore raportate', type: 'number' },
    ],
  },
];

const templateMap = new Map(GDPR_TEMPLATES.map((template) => [template.code, template]));

export function isGdprTemplateCode(value?: string | null): value is GdprTemplateCode {
  return Boolean(value && templateMap.has(value as GdprTemplateCode));
}

export function getGdprTemplate(code?: string | null): GdprTemplate | null {
  return isGdprTemplateCode(code) ? templateMap.get(code) ?? null : null;
}

export function getGdprConclusionText(code?: string | null) {
  return GDPR_CONCLUSION_OPTIONS.find((item) => item.code === code)?.text || GDPR_CONCLUSION_OPTIONS[0].text;
}

export function parseGdprMetaJson(value?: string | null): GdprMeta {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function serializeGdprMeta(meta: GdprMeta) {
  return JSON.stringify(meta);
}

export function getGdprRequiredFields(code: GdprTemplateCode, meta: GdprMeta = {}): string[] {
  const template = getGdprTemplate(code);
  if (!template) return [];

  const required = new Set<string>();
  commonFields.forEach((field) => {
    if (field.required) required.add(field.key);
  });
  required.add('concluzie');
  template.fields.forEach((field) => {
    if (field.required) required.add(field.key);
  });

  if (code === 'GDPR_PUBLICARE' && meta.includeImagini === true) {
    required.add('informareParticipanti');
    required.add('temeiFotoVideo');
  }

  if (code === 'GDPR_ONLINE_MEET' && meta.existaInregistrari === true) {
    required.add('accesInregistrari');
    required.add('retentieInregistrari');
  }

  if ((code === 'GDPR_EVENT_CHECK' || code === 'GDPR_EVENT_IMPL') && meta.fotoVideo === true) {
    required.add('informareParticipanti');
    required.add('temeiFotoVideo');
    required.add('dreptOpozitie');
  }

  if (meta.incidente === true || meta.concluzie === 'neconform_cu_remediere') {
    required.add('descriereIncident');
    required.add('masuriRemediere');
    required.add('recomandari');
  }

  return Array.from(required);
}

export function getGdprFieldDefinitions(code?: string | null, meta: GdprMeta = {}): GdprFieldDefinition[] {
  const template = getGdprTemplate(code);
  if (!template) return [];

  const dynamicFields: GdprFieldDefinition[] = [];
  if (code === 'GDPR_PUBLICARE' && meta.includeImagini === true) {
    dynamicFields.push(
      { key: 'informareParticipanti', label: 'Informare pentru imagine/foto-video', type: 'textarea', required: true },
      { key: 'temeiFotoVideo', label: 'Temei foto-video', type: 'select', required: true, options: ['consimtamant', 'interes legitim', 'context profesional'] },
    );
  }
  if (code === 'GDPR_ONLINE_MEET' && meta.existaInregistrari === true) {
    dynamicFields.push(
      { key: 'accesInregistrari', label: 'Acces la inregistrari', type: 'text', required: true },
      { key: 'retentieInregistrari', label: 'Retentie inregistrari', type: 'text', required: true },
    );
  }
  if ((code === 'GDPR_EVENT_CHECK' || code === 'GDPR_EVENT_IMPL') && meta.fotoVideo === true) {
    dynamicFields.push(
      { key: 'informareParticipanti', label: 'Informare participanti', type: 'textarea', required: true },
      { key: 'temeiFotoVideo', label: 'Temei foto-video', type: 'select', required: true, options: ['consimtamant', 'interes legitim', 'context profesional'] },
      { key: 'dreptOpozitie', label: 'Drept opozitie comunicat', type: 'boolean', required: true },
    );
  }
  if (meta.incidente === true || meta.concluzie === 'neconform_cu_remediere') {
    dynamicFields.push(
      { key: 'descriereIncident', label: 'Descriere incident/neconformitate', type: 'textarea', required: true },
      { key: 'masuriRemediere', label: 'Masuri de remediere', type: 'textarea', required: true },
    );
  }

  return [...template.fields, ...commonFields, ...dynamicFields];
}

export function validateGdprActivityDraft(input: {
  templateCode?: string | null;
  meta?: GdprMeta;
  conclusionCode?: string | null;
  description?: string;
  hasDeliverable?: boolean;
}): GdprValidationResult {
  const warnings: string[] = [];
  const missingFields: string[] = [];
  if (!isGdprTemplateCode(input.templateCode)) {
    return { ok: false, missingFields: ['gdprTemplateCode'], warnings };
  }

  const template = getGdprTemplate(input.templateCode)!;
  const meta = { ...(input.meta ?? {}) };
  if (input.conclusionCode && isEmptyMetaValue(meta.concluzie)) {
    meta.concluzie = input.conclusionCode;
  }
  const fields = getGdprRequiredFields(template.code, meta);

  fields.forEach((field) => {
    if (isEmptyMetaValue(meta[field])) {
      missingFields.push(field);
    }
  });

  if (template.requiresDeliverable && input.hasDeliverable === false) {
    missingFields.push('livrabil');
  }

  if ((meta.incidente === true || meta.concluzie === 'neconform_cu_remediere') && isEmptyMetaValue(meta.recomandari)) {
    missingFields.push('recomandari');
  }

  if (!input.description?.trim()) {
    warnings.push('Descrierea poate fi generata automat din template-ul GDPR.');
  }

  return { ok: missingFields.length === 0, missingFields: Array.from(new Set(missingFields)), warnings };
}

export function buildGdprActivityDescription(input: GdprGenerationInput) {
  const template = getGdprTemplate(input.templateCode);
  if (!template) return '';

  const meta = input.meta;
  const date = input.date || 'data selectata';
  const projectCode = input.projectCode || '302141';
  const projectTitle = input.projectTitle || 'Consolidarea capacitatii Concordia pentru dialog social';
  const conclusion = getGdprConclusionText(String(meta.concluzie || 'conform_fara_neconformitati'));
  const documents = listText(meta.documenteAnalizate, 'documentele indicate');
  const personalData = listText(meta.datePersonale, 'datele personale relevante');
  const basis = listText(meta.temeiGdpr, 'temeiurile GDPR aplicabile');
  const object = text(meta.obiectVerificare, template.label.toLowerCase());

  const opening = `In data de ${date}, in cadrul subactivitatii ${template.saCode}, in calitate de expert cu protectia datelor cu caracter personal, am desfasurat activitatea "${template.activityTitle}", avand ca obiect ${object}.`;
  const analysis = `Am analizat ${documents}, tipurile de date prelucrate (${personalData}) si temeiurile aplicabile (${basis}), verificand principiile GDPR privind legalitatea, transparenta, minimizarea datelor, limitarea scopului, exactitatea, securitatea, confidentialitatea si responsabilitatea.`;
  const specific = buildSpecificDescription(template.code, meta);
  const closing = `In urma verificarii, ${conclusion}. Activitatea s-a finalizat cu livrabilul "${template.deliverableTitle}" si contribuie la conformitatea proiectului ${projectCode} - ${projectTitle}.`;

  return [opening, analysis, specific, closing].filter(Boolean).join('\n\n');
}

export function buildGdprDeliverableText(input: GdprGenerationInput) {
  const template = getGdprTemplate(input.templateCode);
  if (!template) return '';

  const description = buildGdprActivityDescription(input);
  const conclusion = getGdprConclusionText(String(input.meta.concluzie || 'conform_fara_neconformitati'));

  return [
    template.deliverableTitle.toUpperCase(),
    '',
    `Expert: ${input.expertName || 'Expert GDPR'}`,
    `Rol: ${input.expertRole || 'Expert cu protectia datelor cu caracter personal'}`,
    `Data: ${input.date || ''}`,
    `Cod proiect: ${input.projectCode || '302141'}`,
    '',
    '1. Context si obiectiv',
    description,
    '',
    '2. Elemente verificate',
    `Documente analizate: ${listText(input.meta.documenteAnalizate, 'nu sunt precizate')}.`,
    `Date personale implicate: ${listText(input.meta.datePersonale, 'nu sunt precizate')}.`,
    `Temeiuri GDPR: ${listText(input.meta.temeiGdpr, 'nu sunt precizate')}.`,
    '',
    '3. Concluzie',
    `Concluzie: ${conclusion}.`,
    `Recomandari: ${text(input.meta.recomandari, 'Nu au fost necesare masuri suplimentare de remediere.')}`,
    '',
    '4. Validare',
    'Document generat ca draft de aplicatia de raportare si necesita verificarea expertului inainte de transmiterea finala.',
  ].join('\n');
}

export async function buildGdprDeliverableDocx(input: GdprGenerationInput): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const textContent = buildGdprDeliverableText(input);
  const children = textContent.split('\n').map((line, index) => {
    if (index === 0) {
      return new Paragraph({ text: line, heading: HeadingLevel.HEADING_1 });
    }
    if (/^\d+\.\s/.test(line)) {
      return new Paragraph({ text: line, heading: HeadingLevel.HEADING_2 });
    }
    return new Paragraph({ children: [new TextRun(line)] });
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export function buildGdprDeliverableFileName(input: GdprGenerationInput) {
  const template = getGdprTemplate(input.templateCode);
  const datePart = input.date || new Date().toISOString().slice(0, 10);
  const title = (template?.deliverableTitle || 'Livrabil GDPR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90);
  return `${datePart}_${title}.docx`;
}

export function createGeneratedGdprDeliverableSlot(input: GdprGenerationInput & { fileData?: string; fileSize?: number }): DeliverableSlot {
  const template = getGdprTemplate(input.templateCode);
  const fileName = buildGdprDeliverableFileName(input);

  return {
    id: `gdpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    slotType: 'livrabil',
    type: template?.deliverableType || 'Raport verificare GDPR',
    name: fileName,
    filename: fileName,
    rawFilename: fileName.replace(/\.docx$/i, ''),
    fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: input.fileSize || 0,
    fileData: input.fileData,
    uploadedAt: new Date().toISOString(),
    uploaded: true,
    isPhoto: false,
    docTitle: template?.deliverableTitle || null,
    docText: buildGdprDeliverableText(input),
    declaredTitle: template?.deliverableTitle || 'Livrabil GDPR',
    suggestedTitle: template?.deliverableTitle || null,
    titleSuggestionConfidence: 'high',
    titleSuggestionAlternatives: [],
    titleSuggestionReason: 'Titlu generat din template-ul GDPR selectat.',
    firstPageText: buildGdprDeliverableText(input).slice(0, 4000),
    titleSource: 'auto_detected',
    titleMatch: true,
    titleConfirmed: true,
    titleCheckStatus: 'matched',
    titleCheckMessage: 'Titlul a fost generat din template-ul GDPR.',
    stadiu: input.meta.incidente === true || input.meta.concluzie === 'neconform_cu_remediere' ? 'draft' : 'final',
    aiCheck: {
      eligible: input.meta.incidente === true || input.meta.concluzie === 'neconform_cu_remediere' ? null : true,
      reason: input.meta.incidente === true || input.meta.concluzie === 'neconform_cu_remediere'
        ? 'Draft generat pentru caz cu risc/neconformitate; necesita verificare manuala.'
        : 'Livrabil generat din template GDPR predefinit.',
      issues: input.meta.incidente === true || input.meta.concluzie === 'neconform_cu_remediere' ? ['Necesita validare expert/PM'] : [],
    },
    eligibilityCheck: null,
    common: false,
    isPendingConfirm: false,
    documentId: `doc_gdpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    isCommonDeliverable: false,
    sharedWithExpertIds: [],
  };
}

function buildSpecificDescription(code: GdprTemplateCode, meta: GdprMeta) {
  if (code === 'GDPR_PUBLICARE') {
    return `Verificarea a vizat publicarea online pentru ${listText(meta.tipMateriale, 'materialele mentionate')} pe ${listText(meta.canalPublicare, 'canalele indicate')}, aferente lunii ${text(meta.lunaAnalizata, 'analizate')}. ${meta.includeImagini ? 'Au fost verificate suplimentar informarea persoanelor vizate si temeiul pentru utilizarea imaginilor.' : ''}`;
  }
  if (code === 'GDPR_ONLINE_MEET') {
    return `Verificarea a vizat intalnirile online din perioada ${text(meta.perioadaAnalizata, 'analizata')}, derulate prin ${listText(meta.platforma, 'platformele indicate')}. ${meta.existaInregistrari ? `Pentru inregistrari au fost analizate accesul (${text(meta.accesInregistrari, 'neprecizat')}) si retentia (${text(meta.retentieInregistrari, 'neprecizata')}).` : 'Nu au fost semnalate inregistrari care sa necesite analiza suplimentara de retentie.'}`;
  }
  if (code === 'GDPR_BUSINESS_HUB') {
    return `Analiza a inclus ${text(meta.numarEvenimente, 'un numar de evenimente')} evenimente Business HUB din luna ${text(meta.lunaAnalizata, 'analizata')}, responsabil ${text(meta.responsabilHub, 'neprecizat')}, cu rol HUB ${text(meta.rolHub, 'neprecizat')}.`;
  }
  if (code.startsWith('GDPR_ACH')) {
    return `Verificarea a vizat procedura "${text(meta.denumireAchizitie, 'achizitia indicata')}", documentele procedurale si datele ofertantilor/furnizorilor ${listText(meta.furnizorOfertanti, 'mentionati')}.`;
  }
  if (code === 'GDPR_FACT_PLATA') {
    return `Verificarea a vizat furnizorul/prestatorul ${text(meta.furnizorOfertanti, 'mentionat')} si documentele financiar-contabile: ${listText(meta.documenteFinanciare, 'documentele indicate')}.`;
  }
  if (code.startsWith('GDPR_EVENT')) {
    return `Verificarea a vizat evenimentul "${text(meta.numeEveniment, 'mentionat')}", desfasurat la ${text(meta.locatieEveniment, 'locatia indicata')}. Au fost analizate masurile privind listele de prezenta, informarea participantilor, foto-video, accesul la date si arhivarea documentelor.`;
  }
  if (code === 'GDPR_GT_MON') {
    return `Activitatea a inclus ${listText(meta.operatiuniRealizate, 'operatiuni de monitorizare')}, pentru luna ${text(meta.lunaAnalizata, 'analizata')}, cu accent pe corelarea, exactitatea si securitatea datelor GT.`;
  }
  if (code === 'GDPR_DOC_GT') {
    return `Verificarea a vizat ${text(meta.tipDosar, 'documentele de inscriere')} pentru ${text(meta.entitate, 'entitatea indicata')}, inclusiv informarea persoanelor vizate, temeiul legal si completitudinea dosarului.`;
  }
  return '';
}

function isEmptyMetaValue(value: GdprMetaValue) {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  return value === undefined || value === null;
}

function text(value: GdprMetaValue, fallback: string) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
  if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function listText(value: GdprMetaValue, fallback: string) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean).join(', ') || fallback;
  if (value === undefined || value === null) return fallback;
  return String(value);
}
