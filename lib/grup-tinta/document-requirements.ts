export const GT_ENTITY_REQUIRED_DOCS = [
  'extras_registru_organizatii_patronale',
  'dovada_afiliere_cpc',
  'dovada_afiliere_federatie',
  'declaratie_unic_proiect_apel',
] as const;

export const GT_PERSON_REQUIRED_DOCS = [
  'formular_inregistrare_gt',
  'carte_identitate',
  'declaratie_apartenenta_incompatibilitate',
  'cerere_inscriere_angajament',
  'consimtamant_gdpr',
  'declaratie_evitare_dubla_finantare',
  'adeverinta_salariat_reprezentare',
  'diploma_studii',
] as const;

export const GT_DOCUMENT_LABELS: Record<string, string> = {
  extras_registru_organizatii_patronale: 'Extras registru organizatii patronale',
  dovada_afiliere_cpc: 'Dovada afiliere CPC',
  dovada_afiliere_federatie: 'Dovada afiliere federatie',
  declaratie_unic_proiect_apel: 'Declaratie unic proiect apel',
  formular_inregistrare_gt: 'Formular inregistrare GT',
  carte_identitate: 'Carte identitate',
  declaratie_apartenenta_incompatibilitate: 'Declaratie apartenenta si incompatibilitate',
  cerere_inscriere_angajament: 'Cerere inscriere si angajament',
  consimtamant_gdpr: 'Consimtamant GDPR',
  declaratie_evitare_dubla_finantare: 'Declaratie evitare dubla finantare',
  adeverinta_salariat_reprezentare: 'Adeverinta salariat/reprezentare',
  diploma_studii: 'Diploma studii',
};
