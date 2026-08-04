import type { DeliverableSlot } from './deliverable-types';
import type { ActivityCatalog } from './types';

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
  | 'GDPR_EVENT_POST'
  | 'GDPR_PV_VALIDARE'
  | 'GDPR_STATUS_PEO'
  | 'GDPR_RAPORT_LUNAR'
  | 'GDPR_CO'
  | 'GDPR_ALTE_VERIFICARI';

export type GdprConclusionCode =
  | 'conform_fara_neconformitati'
  | 'conform_cu_recomandari'
  | 'conform_partial'
  | 'neconform_cu_remediere'
  | 'fara_prelucrari_directe';

export type GdprFieldType = 'text' | 'textarea' | 'number' | 'select' | 'multi' | 'boolean' | 'checkbox_with_other' | 'url';

export type GdprDeliverableRequirement =
  | 'nu_este_necesar'
  | 'optional'
  | 'conditional'
  | 'mandatory'
  | 'auto_generated';

export type GdprMinimumEvidenceType =
  | 'link_publicare'
  | 'referinta_document'
  | 'upload_document'
  | 'bifa_checklist'
  | 'referinta_factura_pv'
  | 'referinta_dosar_gt'
  | 'calendar_meeting'
  | 'inregistrare_bd'
  | 'livrabil_generat'
  | 'pontaj';

export interface GdprSelectionValue {
  selected: string[];
  altele?: string;
}

export interface GdprBusinessHubEvent {
  federation: string;
  event: string;
  date: string;
  room: string;
  interval: string;
  signature?: string;
}

export interface GdprOption {
  key: string;
  label: string;
  requiresFreeText?: boolean;
}

export type GdprMetaValue = string | number | boolean | string[] | GdprSelectionValue | GdprBusinessHubEvent[] | undefined;
export type GdprMeta = Record<string, GdprMetaValue>;

export interface GdprFieldDefinition {
  key: string;
  label: string;
  type: GdprFieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<string | GdprOption>;
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
  deliverableRequirement: GdprDeliverableRequirement;
  minimumEvidenceTypes: GdprMinimumEvidenceType[];
  objectVerificationTemplate: string;
  allowFreeTextObject?: boolean;
  defaultLegalBasis?: string[];
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

export const GDPR_MATERIAL_TYPES: GdprOption[] = [
  { key: 'comunicate_media', label: 'Comunicate media' },
  { key: 'anunturi', label: 'Anunturi' },
  { key: 'documente_pozitie', label: 'Documente de pozitie' },
  { key: 'stiri', label: 'Stiri' },
  { key: 'evenimente', label: 'Evenimente' },
  { key: 'invitatii', label: 'Invitatii' },
  { key: 'formulare', label: 'Formulare' },
  { key: 'materiale_foto_video', label: 'Materiale foto-video' },
  { key: 'social_media', label: 'Materiale social media' },
  { key: 'altele', label: 'Altele', requiresFreeText: true },
];

export const GDPR_DOCUMENT_TYPES: GdprOption[] = [
  { key: 'pagina_web', label: 'Pagina web / link publicare' },
  { key: 'comunicat_media', label: 'Comunicat media' },
  { key: 'anunt_public', label: 'Anunt public' },
  { key: 'document_pozitie', label: 'Document de pozitie' },
  { key: 'formular_inscriere', label: 'Formular inscriere' },
  { key: 'lista_participanti', label: 'Lista participanti' },
  { key: 'proces_verbal', label: 'Proces-verbal' },
  { key: 'factura', label: 'Factura' },
  { key: 'contract', label: 'Contract' },
  { key: 'caiet_sarcini', label: 'Caiet de sarcini' },
  { key: 'oferta', label: 'Oferta' },
  { key: 'nota_interna', label: 'Nota interna' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'altele', label: 'Altele', requiresFreeText: true },
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

export const GDPR_DELIVERABLE_REQUIREMENT_OPTIONS: Array<{ key: GdprDeliverableRequirement; label: string }> = [
  { key: 'nu_este_necesar', label: 'Nu este necesar livrabil suplimentar' },
  { key: 'optional', label: 'Livrabil optional' },
  { key: 'conditional', label: 'Livrabil conditionat' },
  { key: 'mandatory', label: 'Livrabil obligatoriu' },
  { key: 'auto_generated', label: 'Livrabil generat automat' },
];

export const GDPR_MINIMUM_EVIDENCE_OPTIONS: Array<{ key: GdprMinimumEvidenceType; label: string }> = [
  { key: 'link_publicare', label: 'Link publicare' },
  { key: 'referinta_document', label: 'Referinta document intern' },
  { key: 'upload_document', label: 'Document incarcat' },
  { key: 'bifa_checklist', label: 'Checklist completat' },
  { key: 'referinta_factura_pv', label: 'Referinta factura / proces-verbal' },
  { key: 'referinta_dosar_gt', label: 'Referinta dosar grup tinta' },
  { key: 'calendar_meeting', label: 'Invitatie / intalnire calendar' },
  { key: 'inregistrare_bd', label: 'Inregistrare in baza de date' },
  { key: 'livrabil_generat', label: 'Livrabil generat' },
  { key: 'pontaj', label: 'Pontaj' },
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
  { key: 'documenteAnalizate', label: 'Documente analizate', type: 'checkbox_with_other', required: true, options: GDPR_DOCUMENT_TYPES },
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
    defaultHours: 8,
    deliverableTitle: 'Raport de verificare GDPR privind monitorizarea activitatilor grupului tinta',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    deliverableRequirement: 'mandatory',
    minimumEvidenceTypes: ['livrabil_generat', 'referinta_document'],
    objectVerificationTemplate: 'Verificarea conformitatii GDPR pentru registrele, fisierele si operatiunile aferente grupului tinta din luna [luna].',
    defaultLegalBasis: ['interes public / implementare proiect', 'obligatie legala'],
    fields: [
      { key: 'lunaAnalizata', label: 'Luna analizata', type: 'text', required: true },
      { key: 'referintaDocument', label: 'Referinta registru/ficier GT', type: 'text', required: true },
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
    deliverableRequirement: 'conditional',
    minimumEvidenceTypes: ['referinta_dosar_gt'],
    objectVerificationTemplate: 'Verificarea documentelor de inscriere in grupul tinta pentru [entitate], aferente dosarului [tipDosar].',
    defaultLegalBasis: ['interes public / implementare proiect', 'obligatie legala'],
    fields: [
      { key: 'entitate', label: 'Entitate / dosar', type: 'text', required: true },
      { key: 'tipDosar', label: 'Tip dosar/documente', type: 'text', required: true },
      { key: 'referintaDosarGt', label: 'Referinta dosar GT', type: 'text', required: true },
      { key: 'produceValidareDosar', label: 'Produce validare/respingere dosar', type: 'boolean' },
      { key: 'dosarComplet', label: 'Dosar complet', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_PUBLICARE',
    label: 'Verificare GDPR publicare online',
    activityTitle: 'Verificare GDPR publicare online',
    saCode: 'SA1.1',
    defaultHours: 6,
    deliverableTitle: 'Raport preliminar privind verificarea respectarii GDPR in publicarea online',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: false,
    deliverableRequirement: 'nu_este_necesar',
    minimumEvidenceTypes: ['link_publicare'],
    objectVerificationTemplate: 'Verificarea respectarii cerintelor GDPR in cadrul procesului de publicare online a [tip_materiale] aferente lunii [luna].',
    allowFreeTextObject: true,
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'lunaAnalizata', label: 'Luna publicarii', type: 'text', required: true },
      { key: 'tipMateriale', label: 'Tip materiale', type: 'checkbox_with_other', required: true, options: GDPR_MATERIAL_TYPES },
      { key: 'canalPublicare', label: 'Canal publicare', type: 'multi', required: true, placeholder: 'website, LinkedIn, email, parteneri' },
      { key: 'linkPublicare', label: 'Link publicare / material', type: 'url', required: true },
      { key: 'includeImagini', label: 'Include imagini/foto-video', type: 'boolean' },
      { key: 'doresteRaportSeparat', label: 'Doresc generarea unui raport separat', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_ONLINE_MEET',
    label: 'Verificare GDPR intalniri online',
    activityTitle: 'Verificare GDPR intalniri online',
    saCode: 'SA1.1',
    defaultHours: 6,
    deliverableTitle: 'Raport preliminar privind protectia datelor in intalniri online',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: false,
    deliverableRequirement: 'optional',
    minimumEvidenceTypes: ['calendar_meeting'],
    objectVerificationTemplate: 'Verificarea respectarii cerintelor GDPR pentru intalnirile online desfasurate in perioada [perioada].',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'perioadaAnalizata', label: 'Perioada analizata', type: 'text', required: true },
      { key: 'platforma', label: 'Platforma', type: 'multi', required: true, placeholder: 'Teams, Zoom' },
      { key: 'calendarMeetingRef', label: 'Link calendar / minuta / lista intalniri', type: 'text', required: true },
      { key: 'existaInregistrari', label: 'Au existat inregistrari', type: 'boolean' },
      { key: 'partajareEcran', label: 'A existat partajare ecran', type: 'boolean' },
      { key: 'doresteRaportSeparat', label: 'Doresc generarea unui raport separat', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_BUSINESS_HUB',
    label: 'Verificare GDPR Business HUB',
    activityTitle: 'Verificare GDPR Business HUB',
    saCode: 'SA1.1',
    defaultHours: 6,
    deliverableTitle: 'Raport privind evenimentele desfasurate in Business HUB - protectia datelor',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: false,
    deliverableRequirement: 'optional',
    minimumEvidenceTypes: ['inregistrare_bd'],
    objectVerificationTemplate: 'Verificarea respectarii cerintelor GDPR pentru evenimentele desfasurate in Business HUB in luna [luna].',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'lunaAnalizata', label: 'Luna analizata', type: 'text', required: true },
      { key: 'numarEvenimente', label: 'Numar evenimente', type: 'number', required: true },
      { key: 'inregistrareBd', label: 'Referinta inregistrare BD evenimente HUB', type: 'text', required: true },
      { key: 'responsabilHub', label: 'Responsabil HUB', type: 'text', required: true },
      { key: 'rolHub', label: 'Rol HUB', type: 'select', required: true, options: ['suport logistic', 'suport tehnic', 'prelucrare directa date', 'imputernicit', 'neclar'] },
      { key: 'doresteRaportSeparat', label: 'Doresc generarea unui raport separat', type: 'boolean' },
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
    requiresDeliverable: false,
    deliverableRequirement: 'optional',
    minimumEvidenceTypes: ['referinta_document'],
    objectVerificationTemplate: 'Verificarea conformitatii GDPR in etapa de lansare a procedurii de achizitie [denumireAchizitie].',
    defaultLegalBasis: ['masuri precontractuale', 'interes public / implementare proiect'],
    fields: [
      { key: 'denumireAchizitie', label: 'Denumire achizitie', type: 'text', required: true },
      { key: 'referintaDocument', label: 'Referinta procedura / documentatie', type: 'text', required: true },
      { key: 'canalTransmitere', label: 'Canal transmitere/depunere', type: 'text', required: true },
      { key: 'dateOfertanti', label: 'Include date ofertanti', type: 'boolean' },
      { key: 'doresteRaportSeparat', label: 'Doresc generarea unui raport separat', type: 'boolean' },
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
    deliverableRequirement: 'conditional',
    minimumEvidenceTypes: ['referinta_document'],
    objectVerificationTemplate: 'Verificarea conformitatii GDPR in etapa de evaluare a ofertelor pentru achizitia [denumireAchizitie].',
    defaultLegalBasis: ['masuri precontractuale', 'interes public / implementare proiect'],
    fields: [
      { key: 'denumireAchizitie', label: 'Denumire achizitie', type: 'text', required: true },
      { key: 'referintaDocument', label: 'Referinta PV evaluare / documentatie', type: 'text', required: true },
      { key: 'furnizorOfertanti', label: 'Ofertanti / furnizori', type: 'multi', required: true },
      { key: 'membriComisie', label: 'Membri comisie', type: 'multi' },
      { key: 'includeDateOfertanti', label: 'Include date personale ale ofertantilor/reprezentantilor', type: 'boolean' },
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
    deliverableRequirement: 'conditional',
    minimumEvidenceTypes: ['referinta_document'],
    objectVerificationTemplate: 'Verificarea conformitatii GDPR in etapa de contractare pentru furnizorul [furnizorOfertanti].',
    defaultLegalBasis: ['executarea unui contract', 'obligatie legala'],
    fields: [
      { key: 'denumireAchizitie', label: 'Denumire achizitie / contract', type: 'text', required: true },
      { key: 'referintaDocument', label: 'Referinta contract / clauze GDPR', type: 'text', required: true },
      { key: 'furnizorOfertanti', label: 'Furnizor', type: 'text', required: true },
      { key: 'rolFurnizor', label: 'Rol furnizor', type: 'select', required: true, options: ['operator', 'imputernicit', 'tert', 'neaplicabil'] },
      { key: 'clauzeGdpr', label: 'Exista clauze GDPR', type: 'boolean' },
      { key: 'furnizorPrelucreazaDate', label: 'Furnizorul prelucreaza date personale', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_FACT_PLATA',
    label: 'Facturare / plata / receptie',
    activityTitle: 'Verificare GDPR facturare, plata si receptie',
    saCode: 'SA1.1',
    defaultHours: 2,
    deliverableTitle: 'Raport preliminar verificare GDPR facturare si plata',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: false,
    deliverableRequirement: 'nu_este_necesar',
    minimumEvidenceTypes: ['referinta_factura_pv'],
    objectVerificationTemplate: 'Verificarea conformitatii GDPR pentru documentele de facturare, plata si receptie aferente furnizorului [furnizorOfertanti].',
    defaultLegalBasis: ['executarea unui contract', 'obligatie legala', 'obligatii financiar-contabile'],
    fields: [
      { key: 'furnizorOfertanti', label: 'Furnizor / prestator', type: 'text', required: true },
      { key: 'referintaFacturaPv', label: 'Referinta factura / PV / contract', type: 'text', required: true },
      { key: 'documenteFinanciare', label: 'Documente financiar-contabile', type: 'checkbox_with_other', required: true, options: GDPR_DOCUMENT_TYPES },
      { key: 'doresteRaportSeparat', label: 'Doresc generarea unui raport separat', type: 'boolean' },
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
    deliverableRequirement: 'mandatory',
    minimumEvidenceTypes: ['bifa_checklist'],
    objectVerificationTemplate: 'Verificarea masurilor GDPR pentru organizarea evenimentului [numeEveniment].',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'locatieEveniment', label: 'Locatie', type: 'text', required: true },
      { key: 'listaPrezenta', label: 'Lista de prezenta', type: 'boolean' },
      { key: 'fotoVideo', label: 'Foto/video', type: 'boolean' },
      { key: 'checklistCompletat', label: 'Checklist completat', type: 'boolean', required: true },
      { key: 'informareParticipanti', label: 'Informare participanti realizata', type: 'boolean', required: true },
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
    requiresDeliverable: false,
    deliverableRequirement: 'optional',
    minimumEvidenceTypes: ['bifa_checklist'],
    objectVerificationTemplate: 'Verificarea pre-eveniment a checklistului GDPR asociat evenimentului [numeEveniment].',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'locatieEveniment', label: 'Locatie', type: 'text', required: true },
      { key: 'checklistAsociat', label: 'Checklist asociat', type: 'text', required: true },
      { key: 'checklistCompletat', label: 'Checklist completat', type: 'boolean', required: true },
      { key: 'riscuriIdentificate', label: 'Riscuri identificate', type: 'textarea' },
      { key: 'doresteRaportSeparat', label: 'Doresc generarea unei note separate', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_EVENT_IMPL',
    label: 'Eveniment - monitorizare implementare',
    activityTitle: 'Monitorizare implementare eveniment din perspectiva GDPR',
    saCode: 'SA1.1',
    defaultHours: 8,
    deliverableTitle: 'Raport preliminar monitorizare implementare eveniment',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    deliverableRequirement: 'conditional',
    minimumEvidenceTypes: ['bifa_checklist'],
    objectVerificationTemplate: 'Monitorizarea implementarii masurilor GDPR in cadrul evenimentului [numeEveniment].',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'locatieEveniment', label: 'Locatie', type: 'text', required: true },
      { key: 'masuriAplicate', label: 'Masuri aplicate', type: 'multi', required: true },
      { key: 'checklistCompletat', label: 'Checklist completat', type: 'boolean', required: true },
      { key: 'evenimentMajor', label: 'Eveniment major', type: 'boolean' },
      { key: 'incidente', label: 'Au existat incidente', type: 'boolean' },
    ],
  },
  {
    code: 'GDPR_EVENT_POST',
    label: 'Eveniment - raport post-eveniment',
    activityTitle: 'Raport post-eveniment privind conformitatea GDPR',
    saCode: 'SA1.1',
    defaultHours: 4,
    deliverableTitle: 'Raport post-eveniment privind conformitatea GDPR',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: true,
    deliverableRequirement: 'conditional',
    minimumEvidenceTypes: ['link_publicare'],
    objectVerificationTemplate: 'Verificarea post-eveniment a materialelor publicate, arhivarii si transmiterii documentelor pentru evenimentul [numeEveniment].',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'numeEveniment', label: 'Nume eveniment', type: 'text', required: true },
      { key: 'materialePublicate', label: 'Materiale publicate', type: 'checkbox_with_other', required: true, options: GDPR_MATERIAL_TYPES },
      { key: 'linkPublicare', label: 'Link publicare / arhiva', type: 'url' },
      { key: 'transmitereMateriale', label: 'Au fost transmise materiale participantilor', type: 'boolean' },
      { key: 'fotoVideo', label: 'Au fost publicate foto/video', type: 'boolean' },
      { key: 'arhivareDocumente', label: 'Arhivare documente', type: 'text', required: true },
    ],
  },
  {
    code: 'GDPR_PV_VALIDARE',
    label: 'Proces-verbal validare dosare',
    activityTitle: 'Proces-verbal validare dosare',
    saCode: 'SA1.1',
    defaultHours: 2,
    deliverableTitle: 'Proces-verbal validare dosare',
    deliverableType: 'Proces verbal verificare',
    requiresDeliverable: true,
    deliverableRequirement: 'mandatory',
    minimumEvidenceTypes: ['livrabil_generat'],
    objectVerificationTemplate: 'Documentarea validarii dosarului [tipDosar] pentru entitatea [entitate].',
    defaultLegalBasis: ['interes public / implementare proiect', 'obligatie legala'],
    fields: [
      { key: 'entitate', label: 'Entitate / dosar', type: 'text', required: true },
      { key: 'tipDosar', label: 'Tip dosar', type: 'text', required: true },
      { key: 'membriComisie', label: 'Comisie / semnatari', type: 'multi', required: true },
      { key: 'rezultatValidare', label: 'Rezultat validare', type: 'select', required: true, options: ['validat', 'respins', 'necesita clarificari'] },
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
    deliverableRequirement: 'nu_este_necesar',
    minimumEvidenceTypes: ['calendar_meeting'],
    objectVerificationTemplate: 'Participarea la sedinta de status PEO privind aspectele GDPR din proiect.',
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'calendarMeetingRef', label: 'Invitatie calendar / minuta / referinta', type: 'text', required: true },
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
    requiresDeliverable: true,
    deliverableRequirement: 'mandatory',
    minimumEvidenceTypes: ['livrabil_generat'],
    objectVerificationTemplate: 'Elaborarea raportului lunar GDPR - Anexa 10 pentru luna [luna].',
    defaultLegalBasis: [],
    fields: [
      { key: 'lunaAnalizata', label: 'Luna raportare', type: 'text', required: true },
      { key: 'totalOre', label: 'Total ore raportate', type: 'number' },
    ],
  },
  {
    code: 'GDPR_CO',
    label: 'Concediu / zi nelucrata',
    activityTitle: 'Concediu / zi nelucrata',
    saCode: 'SA1.1',
    defaultHours: 8,
    deliverableTitle: 'Nu este necesar livrabil',
    deliverableType: 'Pontaj',
    requiresDeliverable: false,
    deliverableRequirement: 'nu_este_necesar',
    minimumEvidenceTypes: ['pontaj'],
    objectVerificationTemplate: 'Inregistrare pontaj pentru concediu / zi nelucrata.',
    defaultLegalBasis: [],
    fields: [
      { key: 'tipAbsenta', label: 'Tip absenta', type: 'select', required: true, options: ['CO', 'CM', 'zi nelucrata'] },
    ],
  },
  {
    code: 'GDPR_ALTE_VERIFICARI',
    label: 'Alte verificari GDPR',
    activityTitle: 'Alte verificari GDPR punctuale',
    saCode: 'SA1.1',
    defaultHours: 2,
    deliverableTitle: 'Raport preliminar verificare GDPR punctuala',
    deliverableType: 'Raport verificare GDPR',
    requiresDeliverable: false,
    deliverableRequirement: 'optional',
    minimumEvidenceTypes: ['referinta_document'],
    objectVerificationTemplate: 'Verificare GDPR punctuala privind [obiectVerificare].',
    allowFreeTextObject: true,
    defaultLegalBasis: ['interes legitim', 'interes public / implementare proiect'],
    fields: [
      { key: 'referintaDocument', label: 'Referinta document / nota / upload', type: 'text', required: true },
    ],
  },
];

const templateMap = new Map(GDPR_TEMPLATES.map((template) => [template.code, template]));

function normalizeGdprCatalogActivityName(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const gdprTemplateCodeByCatalogActivityName = new Map<string, GdprTemplateCode>([
  ['Monitorizare GDPR Grup Tinta', 'GDPR_GT_MON'],
  ['Verificare documente inscriere GT', 'GDPR_DOC_GT'],
  ['Verificare GDPR publicare online', 'GDPR_PUBLICARE'],
  ['Verificare GDPR intalniri online', 'GDPR_ONLINE_MEET'],
  ['Verificare GDPR Business HUB', 'GDPR_BUSINESS_HUB'],
  ['Verificare GDPR lansare achizitie', 'GDPR_ACH_LANSARE'],
  ['Verificare GDPR evaluare oferte', 'GDPR_ACH_EVAL'],
  ['Verificare GDPR incheiere contract', 'GDPR_ACH_CONTRACT'],
  ['Verificare GDPR facturare plata receptie', 'GDPR_FACT_PLATA'],
  ['Checklist GDPR organizare eveniment', 'GDPR_EVENT_CHECK'],
  ['Nota interna pre-eveniment GDPR', 'GDPR_EVENT_PRE'],
  ['Monitorizare implementare eveniment GDPR', 'GDPR_EVENT_IMPL'],
  ['Sedinta status PEO GDPR', 'GDPR_STATUS_PEO'],
  ['Elaborare raport lunar GDPR', 'GDPR_RAPORT_LUNAR'],
].map(([name, code]) => [normalizeGdprCatalogActivityName(name), code as GdprTemplateCode]));

export function isGdprTemplateCode(value?: string | null): value is GdprTemplateCode {
  return Boolean(value && templateMap.has(value as GdprTemplateCode));
}

export function getGdprTemplate(code?: string | null): GdprTemplate | null {
  return isGdprTemplateCode(code) ? templateMap.get(code) ?? null : null;
}

export function resolveGdprTemplateCodeForCatalogActivity(
  activity: Pick<ActivityCatalog, 'activityName' | 'gdprTemplateCode'>,
): GdprTemplateCode {
  if (isGdprTemplateCode(activity.gdprTemplateCode)) {
    return activity.gdprTemplateCode;
  }

  const normalizedName = normalizeGdprCatalogActivityName(activity.activityName);
  const configuredCode = gdprTemplateCodeByCatalogActivityName.get(normalizedName);
  if (configuredCode) return configuredCode;

  const matchingTemplate = GDPR_TEMPLATES.find((template) =>
    normalizeGdprCatalogActivityName(template.activityTitle) === normalizedName
    || normalizeGdprCatalogActivityName(template.label) === normalizedName
  );
  return matchingTemplate?.code ?? 'GDPR_ALTE_VERIFICARI';
}

export function getGdprConclusionText(code?: string | null) {
  return GDPR_CONCLUSION_OPTIONS.find((item) => item.code === code)?.text || GDPR_CONCLUSION_OPTIONS[0].text;
}

export function getGdprOptionValue(option: string | GdprOption) {
  return typeof option === 'string' ? option : option.key;
}

export function getGdprOptionLabel(option: string | GdprOption) {
  return typeof option === 'string' ? option : option.label;
}

export function getGdprDeliverableRequirementLabel(requirement?: GdprDeliverableRequirement) {
  return GDPR_DELIVERABLE_REQUIREMENT_OPTIONS.find((item) => item.key === requirement)?.label || 'Regula livrabil neprecizata';
}

export function getGdprMinimumEvidenceLabels(types: GdprMinimumEvidenceType[] = []) {
  return types.map((type) => GDPR_MINIMUM_EVIDENCE_OPTIONS.find((item) => item.key === type)?.label || type);
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

export function buildDefaultGdprMeta(code?: string | null, existing: GdprMeta = {}, reportMonth?: string): GdprMeta {
  const template = getGdprTemplate(code);
  if (!template) return existing;
  const meta: GdprMeta = {
    ...existing,
    concluzie: existing.concluzie || 'conform_fara_neconformitati',
  };
  if (template.defaultLegalBasis?.length && isEmptyMetaValue(meta.temeiGdpr)) {
    meta.temeiGdpr = template.defaultLegalBasis;
  }
  if (reportMonth && isEmptyMetaValue(meta.lunaAnalizata)) {
    meta.lunaAnalizata = reportMonth;
  }
  if (template.code === 'GDPR_PUBLICARE' && isEmptyMetaValue(meta.tipMateriale)) {
    meta.tipMateriale = { selected: ['comunicate_media', 'anunturi', 'documente_pozitie', 'stiri', 'evenimente'] };
  }
  if (template.code === 'GDPR_PUBLICARE' && isEmptyMetaValue(meta.documenteAnalizate)) {
    meta.documenteAnalizate = { selected: ['pagina_web', 'comunicat_media', 'anunt_public', 'document_pozitie'] };
  }
  if (isEmptyMetaValue(meta.obiectVerificare)) {
    meta.obiectVerificare = buildGdprObjectVerification(template.code, meta);
  }
  return applyConditionalLegalBasis(template.code, meta);
}

export function buildBusinessHubGdprMeta(
  existing: GdprMeta = {},
  options: {
    monthLabel?: string;
    reportMonth?: string;
    events?: GdprBusinessHubEvent[];
    sourceFileName?: string;
  } = {},
): GdprMeta {
  const monthLabel = options.monthLabel || stringValue(existing.lunaAnalizata) || options.reportMonth || '';
  const events = options.events ?? getBusinessHubEvents(existing);
  const sourceFileName = options.sourceFileName || stringValue(existing.inregistrareBd);
  const meta = buildDefaultGdprMeta('GDPR_BUSINESS_HUB', {
    ...existing,
    lunaAnalizata: monthLabel,
    numarEvenimente: events.length || Number(existing.numarEvenimente) || undefined,
    inregistrareBd: sourceFileName,
    responsabilHub: stringValue(existing.responsabilHub) || 'Coordonator Business HUB',
    rolHub: stringValue(existing.rolHub) || 'suport logistic',
    documenteAnalizate: isEmptyMetaValue(existing.documenteAnalizate)
      ? { selected: ['proces_verbal', 'altele'], altele: 'Proces-verbal evenimente Business HUB' }
      : existing.documenteAnalizate,
    datePersonale: isEmptyMetaValue(existing.datePersonale)
      ? ['nume si prenume', 'functie', 'organizatie', 'semnatura']
      : existing.datePersonale,
    temeiGdpr: isEmptyMetaValue(existing.temeiGdpr)
      ? ['interes legitim', 'interes public / implementare proiect']
      : existing.temeiGdpr,
    concluzie: existing.concluzie || 'fara_prelucrari_directe',
    businessHubEvents: events,
  }, monthLabel || options.reportMonth);

  return {
    ...meta,
    obiectVerificare: buildGdprObjectVerification('GDPR_BUSINESS_HUB', meta),
  };
}

export function buildGdprObjectVerification(code: GdprTemplateCode, meta: GdprMeta = {}) {
  const template = getGdprTemplate(code);
  if (!template) return '';
  let value = template.objectVerificationTemplate;
  const replacements: Record<string, string> = {
    luna: text(meta.lunaAnalizata, text(meta.lunaPublicarii, 'lunii de raportare')),
    tip_materiale: listText(meta.tipMateriale, 'materialelor selectate'),
    perioada: text(meta.perioadaAnalizata, 'perioada analizata'),
    entitate: text(meta.entitate, 'entitatea selectata'),
    tipDosar: text(meta.tipDosar, 'dosarul selectat'),
    denumireAchizitie: text(meta.denumireAchizitie, 'achizitia selectata'),
    furnizorOfertanti: text(meta.furnizorOfertanti, 'furnizorul selectat'),
    numeEveniment: text(meta.numeEveniment, 'evenimentul selectat'),
    obiectVerificare: text(meta.obiectVerificare, 'obiectul verificarii'),
  };
  Object.entries(replacements).forEach(([key, replacement]) => {
    value = value.replaceAll(`[${key}]`, replacement);
  });
  return value;
}

export function applyConditionalLegalBasis(code: GdprTemplateCode, meta: GdprMeta): GdprMeta {
  const basis = new Set(selectedValues(meta.temeiGdpr));
  if (code === 'GDPR_PUBLICARE' && (meta.includeImagini === true || hasSelected(meta.tipMateriale, 'materiale_foto_video'))) {
    basis.add('consimtamant');
    basis.add('interes legitim');
  }
  if (code === 'GDPR_ONLINE_MEET' && meta.existaInregistrari === true) {
    basis.add('interes legitim');
  }
  if (basis.size > 0) {
    return { ...meta, temeiGdpr: Array.from(basis) };
  }
  return meta;
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

  if (code === 'GDPR_PUBLICARE' && (meta.includeImagini === true || hasSelected(meta.tipMateriale, 'materiale_foto_video'))) {
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

  const deliverableRequired = isGdprDeliverableRequired(template.code, meta);
  const evidenceMissing = getMissingMinimumEvidence(template, meta, input.hasDeliverable === true);
  evidenceMissing.forEach((field) => missingFields.push(field));

  if (deliverableRequired && input.hasDeliverable === false) {
    missingFields.push('livrabil_generat_sau_atasat');
  }

  if ((meta.incidente === true || meta.concluzie === 'neconform_cu_remediere') && isEmptyMetaValue(meta.recomandari)) {
    missingFields.push('recomandari');
  }

  if (!input.description?.trim()) {
    warnings.push('Descrierea poate fi generata automat din template-ul GDPR.');
  }

  return { ok: missingFields.length === 0, missingFields: Array.from(new Set(missingFields)), warnings };
}

export function isGdprDeliverableRequired(code: GdprTemplateCode, meta: GdprMeta = {}) {
  const template = getGdprTemplate(code);
  if (!template) return false;
  if (template.deliverableRequirement === 'mandatory' || template.deliverableRequirement === 'auto_generated') return true;
  if (template.deliverableRequirement === 'nu_este_necesar' || template.deliverableRequirement === 'optional') {
    return meta.doresteRaportSeparat === true
      || meta.incidente === true
      || meta.concluzie === 'neconform_cu_remediere'
      || meta.concluzie === 'conform_partial';
  }
  if (template.deliverableRequirement !== 'conditional') return false;

  if (meta.doresteRaportSeparat === true || meta.incidente === true || meta.concluzie === 'neconform_cu_remediere') return true;
  if (code === 'GDPR_DOC_GT') return meta.produceValidareDosar === true || meta.dosarComplet === false;
  if (code === 'GDPR_EVENT_IMPL') return meta.fotoVideo === true || meta.evenimentMajor === true || meta.transmitereMateriale === true;
  if (code === 'GDPR_EVENT_POST') return meta.fotoVideo === true || meta.transmitereMateriale === true || hasSelected(meta.materialePublicate, 'materiale_foto_video');
  if (code === 'GDPR_ACH_EVAL') return meta.includeDateOfertanti === true || !isEmptyMetaValue(meta.furnizorOfertanti);
  if (code === 'GDPR_ACH_CONTRACT') return meta.furnizorPrelucreazaDate === true || meta.rolFurnizor === 'imputernicit';
  return false;
}

export function getMissingMinimumEvidence(template: GdprTemplate, meta: GdprMeta, hasDeliverable: boolean) {
  const missing: string[] = [];
  template.minimumEvidenceTypes.forEach((type) => {
    if (type === 'livrabil_generat' || type === 'upload_document') {
      if (!hasDeliverable) missing.push(type);
      return;
    }
    if (type === 'pontaj') return;
    const key = evidenceFieldMap[type];
    if (key && isEmptyMetaValue(meta[key])) missing.push(key);
  });
  return missing;
}

const evidenceFieldMap: Partial<Record<GdprMinimumEvidenceType, string>> = {
  link_publicare: 'linkPublicare',
  referinta_document: 'referintaDocument',
  bifa_checklist: 'checklistCompletat',
  referinta_factura_pv: 'referintaFacturaPv',
  referinta_dosar_gt: 'referintaDosarGt',
  calendar_meeting: 'calendarMeetingRef',
  inregistrare_bd: 'inregistrareBd',
};

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
  const deliverableRequired = isGdprDeliverableRequired(template.code, meta);
  const evidence = getGdprMinimumEvidenceLabels(template.minimumEvidenceTypes).join(', ');
  const closing = deliverableRequired
    ? `In urma verificarii, ${conclusion}. Activitatea se documenteaza prin livrabilul "${template.deliverableTitle}" si contribuie la conformitatea proiectului ${projectCode} - ${projectTitle}.`
    : `In urma verificarii, ${conclusion}. Activitatea este eligibila pe baza dovezii minime (${evidence || 'dovada interna'}) si se include in Anexa 10 fara livrabil suplimentar obligatoriu.`;

  return [opening, analysis, specific, closing].filter(Boolean).join('\n\n');
}

export function buildGdprDeliverableText(input: GdprGenerationInput) {
  const template = getGdprTemplate(input.templateCode);
  if (!template) return '';
  if (template.code === 'GDPR_BUSINESS_HUB') {
    return buildBusinessHubPreliminaryReportText(input);
  }

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
  if (input.templateCode === 'GDPR_BUSINESS_HUB') {
    return buildBusinessHubPreliminaryReportDocx(input);
  }
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

export function buildBusinessHubPreliminaryReportText(input: GdprGenerationInput) {
  const meta = input.meta;
  const month = text(meta.lunaAnalizata, 'luna analizata').toLowerCase();
  const events = getBusinessHubEvents(meta);
  const eventCount = Number(meta.numarEvenimente) || events.length || 0;
  const eventLines = events.length > 0
    ? [
        'Federatie/Asociatie\tEveniment\tData\tSala\tInterval orar\tSemnatura',
        ...events.map((event) => [
          event.federation,
          event.event,
          event.date,
          event.room,
          event.interval,
          event.signature || '',
        ].join('\t')),
      ]
    : ['Tabelul evenimentelor se completeaza pe baza procesului-verbal incarcat.'];

  return [
    'RAPORT PRELIMINAR',
    '',
    `Privind trecerea in revista a evenimentelor desfasurate in Business HUB in luna ${month} - Protectia datelor cu caracter personal`,
    '',
    'Avand in vedere:',
    'Necesitatile operationale identificate in implementarea proiectului "Consolidarea capacitatii Concordia pentru dialog social" PEO/10610/22.01.2024',
    'Aprobarea Manualului Beneficiarului pentru proiectele finantate prin PEO 2021-2027',
    'Recomandarile autoritatii finantatoare in ceea ce priveste documentele justificative',
    '',
    'a fost redactata prezenta minuta de sedinta.',
    '',
    'Activitatea s-a desfasurat in scopul asigurarii conformitatii, trasabilitatii si auditabilitatii proceselor interne, avand caracter preventiv si procedural, nu doar operational, contribuind la:',
    'reducerea riscului de neconformitate in implementare',
    'transparenta si controlul fluxurilor de date in cadrul infrastructurii proiectului',
    'consolidarea capacitatii institutionale de management si administrare a resurselor (SA3.2)',
    '',
    'Scopul sesiunii: documentarea, analizarea si standardizarea modului de gestionare a informatiilor si a datelor cu caracter personal rezultate din activitatile organizate in Business Hub, in vederea asigurarii conformitatii cu prevederile GDPR si cu cerintele proiectelor PEO.',
    '',
    `Avand in vedere obiectivele asumate prin proiectul mentionat, in luna ${month}, s-au desfasurat urmatoarele activitati cu facilitarea accesului la resursele disponibile in Business HUB:`,
    '',
    ...eventLines,
    '',
    'Proces de lucru etapizat',
    `1. Trecerea in revista a ${eventCount || '[numar]'} evenimente desfasurate in luna ${month};`,
    '2. Identificarea si clasificarea datelor personale prelucrate de Administrator Business HUB;',
    '3. Validarea mediului de stocare a documentelor ce contin date personale;',
    '4. Observatii privind zonele de atentie in gestionarea datelor personale de catre organizatorii evenimentelor;',
    '5. Monitorizare si conformitate continua;',
    '',
    `In cadrul sesiunii de lucru au fost parcurse urmatoarele etape:`,
    `1. Trecerea in revista a evenimentelor ce au avut loc in Business HUB in luna ${month}.`,
    'Coordonator Business HUB a elaborat un document in care a enumerat evenimentele, federatia/asociatia organizatoare, data, sala de intalniri, intervalul orar si persoana de contact din partea organizatorilor. La acest document, Expertul in Prelucrarea Datelor cu caracter personal (DPO) a adaugat o informare GDPR, anexata acestuia (livrabil). Documentul urmeaza a fi semnat de catre toti responsabilii (persoana de contact) din partea federatiilor organizatoare.',
    '',
    'Identificarea si clasificarea datelor personale prelucrate de Administrator Business HUB',
    'S-au identificat urmatoarele date personale prelucrate: nume si prenume, date de contact, functie si organizatie, semnatura.',
    '',
    'Validarea mediului de stocare a documentelor ce contin date personale',
    'S-au identificat si discutat urmatoarele medii de stocare: emailurile institutionale primite si transmise, arhivarea dosarelor virtuale stocate pe serverul CPC si dispozitivele utilizate pentru salile de videoconferinta.',
    '',
    'Observatii privind zonele de atentie in gestionarea datelor personale de catre organizatorii evenimentelor',
    'Expertul in Prelucrarea Datelor cu caracter personal (DPO) a mentionat principalele riscuri: acces neautorizat la sedinte/intalniri, lipsa consimtamantului explicit pentru anumite tipuri de date, nerespectarea principiului minimizarii datelor, risc de neconformitate cu drepturile persoanelor vizate si partajarea necontrolata a datelor catre terti.',
    `Coordonatorul Business Hub a verificat si validat faptul ca pentru evenimentele desfasurate in luna ${month}, Business Hub asigura exclusiv suportul logistic si tehnic (spatiu, echipamente, acces), fara implicare in gestionarea datelor personale. Conform responsabilitatilor prevazute in fisa de post si a atributiilor SA3.2, prelucrarea datelor ramane integral in sarcina entitatii organizatoare.`,
    '',
    'Propuneri pentru monitorizarea conformitatii cu GDPR',
    'Expertul in Prelucrarea Datelor cu caracter personal (DPO) a amintit metodele prin care se monitorizeaza conformitatea GDPR in prelucrarea datelor personale si masurile ce se pot adopta pentru sporirea protectiei prelucrarii: masuri de securitate si criptare, masuri de pastrare si stergere a datelor, monitorizarea accesului si jurnalizare, informarea si obtinerea consimtamantului clar exprimat, drepturile persoanelor vizate.',
    '',
    'Concluzii:',
    `Expertul GDPR confirma ca in luna ${month} nu au existat prelucrari directe de date personale de catre Business HUB, responsabilitatea revenind exclusiv organizatiilor care au organizat evenimentele.`,
    'Business HUB nu este operator de date personale in contextul evenimentelor organizate de federatii/asociatii membre, ci doar furnizor de infrastructura. Singura prelucrare de date realizata de HUB consta in procesul verbal al evenimentelor, care contine datele persoanelor de contact desemnate.',
    'Coordonatorul HUB confirma ca toate evenimentele au fost desfasurate conform procedurilor logistice, iar infrastructura a fost utilizata eficient, fara incidente tehnice.',
    `Durata totala a activitatii a fost de 6 ore si include procesul complet de analiza documentara, verificari operationale, consultare tehnica, redactare, validare si arhivare a livrabilelor, in data de ${input.date || 'data selectata'}.`,
    '',
    'Intocmit,',
    input.expertName || 'Expert GDPR',
  ].join('\n');
}

async function buildBusinessHubPreliminaryReportDocx(input: GdprGenerationInput): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } = await import('docx');
  const meta = input.meta;
  const month = text(meta.lunaAnalizata, 'luna analizata').toLowerCase();
  const events = getBusinessHubEvents(meta);
  const eventCount = Number(meta.numarEvenimente) || events.length || 0;
  const p = (value: string, bold = false) => new Paragraph({ children: [new TextRun({ text: value, bold })] });
  const cell = (value: string, bold = false) => new TableCell({ children: [p(value, bold)] });
  const children: any[] = [
    new Paragraph({ text: 'RAPORT PRELIMINAR', heading: HeadingLevel.HEADING_1 }),
    p(`Privind trecerea in revista a evenimentelor desfasurate in Business HUB in luna ${month} - Protectia datelor cu caracter personal`, true),
    p(''),
    p('Avand in vedere:'),
    p('Necesitatile operationale identificate in implementarea proiectului "Consolidarea capacitatii Concordia pentru dialog social" PEO/10610/22.01.2024'),
    p('Aprobarea Manualului Beneficiarului pentru proiectele finantate prin PEO 2021-2027'),
    p('Recomandarile autoritatii finantatoare in ceea ce priveste documentele justificative'),
    p(''),
    p('a fost redactata prezenta minuta de sedinta.'),
    p(''),
    p('Activitatea s-a desfasurat in scopul asigurarii conformitatii, trasabilitatii si auditabilitatii proceselor interne, avand caracter preventiv si procedural, nu doar operational, contribuind la:'),
    p('reducerea riscului de neconformitate in implementare'),
    p('transparenta si controlul fluxurilor de date in cadrul infrastructurii proiectului'),
    p('consolidarea capacitatii institutionale de management si administrare a resurselor (SA3.2)'),
    p(''),
    p('Scopul sesiunii: documentarea, analizarea si standardizarea modului de gestionare a informatiilor si a datelor cu caracter personal rezultate din activitatile organizate in Business Hub, in vederea asigurarii conformitatii cu prevederile GDPR si cu cerintele proiectelor PEO.'),
    p(''),
    p(`Avand in vedere obiectivele asumate prin proiectul mentionat, in luna ${month}, s-au desfasurat urmatoarele activitati cu facilitarea accesului la resursele disponibile in Business HUB:`),
  ];

  if (events.length > 0) {
    children.push(new Table({
      rows: [
        new TableRow({ children: ['Federatie/Asociatie', 'Eveniment', 'Data', 'Sala', 'Interval orar', 'Semnatura'].map((header) => cell(header, true)) }),
        ...events.map((event) => new TableRow({
          children: [event.federation, event.event, event.date, event.room, event.interval, event.signature || ''].map((value) => cell(value)),
        })),
      ],
    }));
  } else {
    children.push(p('Tabelul evenimentelor se completeaza pe baza procesului-verbal incarcat.'));
  }

  children.push(
    new Paragraph({ text: 'Proces de lucru etapizat', heading: HeadingLevel.HEADING_2 }),
    p(`1. Trecerea in revista a ${eventCount || '[numar]'} evenimente desfasurate in luna ${month};`),
    p('2. Identificarea si clasificarea datelor personale prelucrate de Administrator Business HUB;'),
    p('3. Validarea mediului de stocare a documentelor ce contin date personale;'),
    p('4. Observatii privind zonele de atentie in gestionarea datelor personale de catre organizatorii evenimentelor;'),
    p('5. Monitorizare si conformitate continua;'),
    p(''),
    p(`In cadrul sesiunii de lucru au fost parcurse urmatoarele etape:`),
    p(`1. Trecerea in revista a evenimentelor ce au avut loc in Business HUB in luna ${month}.`),
    p('Coordonator Business HUB a elaborat un document in care a enumerat evenimentele, federatia/asociatia organizatoare, data, sala de intalniri, intervalul orar si persoana de contact din partea organizatorilor. La acest document, Expertul in Prelucrarea Datelor cu caracter personal (DPO) a adaugat o informare GDPR, anexata acestuia (livrabil). Documentul urmeaza a fi semnat de catre toti responsabilii (persoana de contact) din partea federatiilor organizatoare.'),
    new Paragraph({ text: 'Identificarea si clasificarea datelor personale prelucrate de Administrator Business HUB', heading: HeadingLevel.HEADING_2 }),
    p('S-au identificat urmatoarele date personale prelucrate: nume si prenume, date de contact, functie si organizatie, semnatura.'),
    new Paragraph({ text: 'Validarea mediului de stocare a documentelor ce contin date personale', heading: HeadingLevel.HEADING_2 }),
    p('S-au identificat si discutat urmatoarele medii de stocare: emailurile institutionale primite si transmise, arhivarea dosarelor virtuale stocate pe serverul CPC si dispozitivele utilizate pentru salile de videoconferinta.'),
    new Paragraph({ text: 'Observatii privind zonele de atentie in gestionarea datelor personale de catre organizatorii evenimentelor', heading: HeadingLevel.HEADING_2 }),
    p('Expertul in Prelucrarea Datelor cu caracter personal (DPO) a mentionat principalele riscuri: acces neautorizat la sedinte/intalniri, lipsa consimtamantului explicit pentru anumite tipuri de date, nerespectarea principiului minimizarii datelor, risc de neconformitate cu drepturile persoanelor vizate si partajarea necontrolata a datelor catre terti.'),
    p(`Coordonatorul Business Hub a verificat si validat faptul ca pentru evenimentele desfasurate in luna ${month}, Business Hub asigura exclusiv suportul logistic si tehnic (spatiu, echipamente, acces), fara implicare in gestionarea datelor personale. Conform responsabilitatilor prevazute in fisa de post si a atributiilor SA3.2, prelucrarea datelor ramane integral in sarcina entitatii organizatoare.`),
    new Paragraph({ text: 'Propuneri pentru monitorizarea conformitatii cu GDPR', heading: HeadingLevel.HEADING_2 }),
    p('Expertul in Prelucrarea Datelor cu caracter personal (DPO) a amintit metodele prin care se monitorizeaza conformitatea GDPR in prelucrarea datelor personale si masurile ce se pot adopta pentru sporirea protectiei prelucrarii: masuri de securitate si criptare, masuri de pastrare si stergere a datelor, monitorizarea accesului si jurnalizare, informarea si obtinerea consimtamantului clar exprimat, drepturile persoanelor vizate.'),
    new Paragraph({ text: 'Concluzii', heading: HeadingLevel.HEADING_2 }),
    p(`Expertul GDPR confirma ca in luna ${month} nu au existat prelucrari directe de date personale de catre Business HUB, responsabilitatea revenind exclusiv organizatiilor care au organizat evenimentele.`),
    p('Business HUB nu este operator de date personale in contextul evenimentelor organizate de federatii/asociatii membre, ci doar furnizor de infrastructura. Singura prelucrare de date realizata de HUB consta in procesul verbal al evenimentelor, care contine datele persoanelor de contact desemnate.'),
    p('Coordonatorul HUB confirma ca toate evenimentele au fost desfasurate conform procedurilor logistice, iar infrastructura a fost utilizata eficient, fara incidente tehnice.'),
    p(`Durata totala a activitatii a fost de 6 ore si include procesul complet de analiza documentara, verificari operationale, consultare tehnica, redactare, validare si arhivare a livrabilelor, in data de ${input.date || 'data selectata'}.`),
    p(''),
    p('Intocmit,'),
    p(input.expertName || 'Expert GDPR'),
  );

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

function getBusinessHubEvents(meta: GdprMeta): GdprBusinessHubEvent[] {
  return Array.isArray(meta.businessHubEvents)
    ? meta.businessHubEvents.filter((event): event is GdprBusinessHubEvent =>
        Boolean(event && typeof event === 'object' && 'event' in event && 'date' in event),
      )
    : [];
}

function isEmptyMetaValue(value: GdprMetaValue) {
  if (isSelectionLikeValue(value)) {
    const selection = normalizeSelectionValue(value);
    return selection.selected.length === 0 && !selection.altele?.trim();
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  return value === undefined || value === null;
}

function text(value: GdprMetaValue, fallback: string) {
  if (isSelectionLikeValue(value)) return listText(value, fallback);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0).join(', ') || fallback;
  if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function stringValue(value: GdprMetaValue) {
  return typeof value === 'string' ? value.trim() : '';
}

function listText(value: GdprMetaValue, fallback: string) {
  if (isSelectionLikeValue(value)) {
    const selection = normalizeSelectionValue(value);
    const labels = selection.selected.map((item) => optionLabelByKey(item));
    if (selection.altele?.trim()) labels.push(selection.altele.trim());
    return labels.filter(Boolean).join(', ') || fallback;
  }
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean).join(', ') || fallback;
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function isSelectionLikeValue(value: GdprMetaValue): value is GdprSelectionValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isSelectionValue(value: GdprMetaValue): value is GdprSelectionValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as GdprSelectionValue).selected));
}

function normalizeSelectionValue(value: GdprMetaValue): GdprSelectionValue {
  if (!isSelectionLikeValue(value)) return { selected: [] };
  const selection = value as GdprSelectionValue;
  return {
    selected: Array.isArray(selection.selected)
      ? selection.selected.filter((item): item is string => typeof item === 'string')
      : [],
    altele: typeof selection.altele === 'string' ? selection.altele : undefined,
  };
}

function selectedValues(value: GdprMetaValue): string[] {
  if (isSelectionLikeValue(value)) return normalizeSelectionValue(value).selected;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function hasSelected(value: GdprMetaValue, key: string) {
  return selectedValues(value).includes(key);
}

function optionLabelByKey(key: string) {
  const option = [...GDPR_MATERIAL_TYPES, ...GDPR_DOCUMENT_TYPES].find((item) => item.key === key);
  return option?.label || key.replaceAll('_', ' ');
}
