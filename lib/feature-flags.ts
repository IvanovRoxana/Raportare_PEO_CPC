export const DELIVERABLE_ELIGIBILITY_DISABLED_STATUS = 'disabled';

export const DELIVERABLE_ELIGIBILITY_DISABLED_MESSAGE =
  'Verificarea eligibilitatii livrabilelor este suspendata temporar pana la configurarea API keys.';

export const DELIVERABLE_ELIGIBILITY_UI_MESSAGE =
  'Verificarea automata a eligibilitatii livrabilelor este temporar indisponibila pana la finalizarea configurarii API keys si validarea regulilor de verificare. Eligibilitatea se verifica manual de catre PM.';

export function isDeliverableEligibilityCheckEnabled() {
  return process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK === 'true';
}

export function isDeliverableEligibilityCheckEnabledClient() {
  return process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK === 'true';
}
