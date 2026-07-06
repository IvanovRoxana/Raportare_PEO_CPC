import type { DeliverableSlot } from './deliverable-types';
import type { Activity, ActivityCatalog } from './types';

export type ExistingDeliverableSourceAction = 'activity' | 'deliverableType' | 'stadiu';

export interface ExistingDeliverableSourceContext {
  deliverableId: string;
  title: string;
  sourceActivityId?: string;
  sourceActivityDate?: string;
  sourceExpertName?: string;
  sourceSaCode?: string;
  sourceActivityName?: string;
  selectedActivityId?: string;
  sourceDescription?: string;
  deliverableType?: string;
  stadiu?: string;
  titleConfirmed?: boolean;
  hasExtractedText: boolean;
  eligibilityCheck?: DeliverableSlot['eligibilityCheck'];
}

export interface ExistingDeliverableSourceSuggestion {
  deliverableId: string;
  action: ExistingDeliverableSourceAction;
  label: string;
  detail: string;
}

function inferSourceStadiu(deliverable: Pick<DeliverableSlot, 'stadiu' | 'eligibilityCheck'>) {
  if (deliverable.stadiu) return deliverable.stadiu;
  return deliverable.eligibilityCheck ? 'final' : undefined;
}

function getContextTitle(deliverable: DeliverableSlot) {
  return deliverable.declaredTitle
    || deliverable.docTitle
    || deliverable.filename
    || deliverable.name
    || 'Livrabil existent';
}

function findCatalogItem(args: {
  catalog: ActivityCatalog[];
  saCode?: string;
  activityName?: string;
  selectedActivityId?: string;
}) {
  return args.catalog.find((item) => (
    item.saCode === args.saCode
    && (!args.activityName || item.activityName === args.activityName)
    && (!args.selectedActivityId || item.id === args.selectedActivityId)
  )) || null;
}

export function buildExistingDeliverableSourceContext(args: {
  deliverable: DeliverableSlot;
  activities: Activity[];
  catalog: ActivityCatalog[];
}): ExistingDeliverableSourceContext | null {
  const { deliverable, activities, catalog } = args;
  if (!deliverable.uploaded || deliverable.isPhoto) return null;
  if (!deliverable.sourceActivityId && !deliverable.uploadedByExpertName && !deliverable.saCode && !deliverable.eligibilityCheck) return null;

  const sourceActivity = deliverable.sourceActivityId
    ? activities.find((activity) => activity.id === deliverable.sourceActivityId)
    : undefined;
  const sourceSaCode = sourceActivity?.saCode || deliverable.saCode;
  const sourceActivityName = sourceActivity?.activityType || sourceActivity?.title;
  const catalogMatch = findCatalogItem({
    catalog,
    saCode: sourceSaCode,
    activityName: sourceActivityName,
    selectedActivityId: sourceActivity?.catalogActivityId,
  }) || (sourceSaCode && sourceActivityName
    ? findCatalogItem({ catalog, saCode: sourceSaCode, activityName: sourceActivityName })
    : null);

  return {
    deliverableId: deliverable.id,
    title: getContextTitle(deliverable),
    sourceActivityId: deliverable.sourceActivityId || sourceActivity?.id,
    sourceActivityDate: sourceActivity?.date || deliverable.activityDate,
    sourceExpertName: deliverable.uploadedByExpertName || sourceActivity?.expertName,
    sourceSaCode,
    sourceActivityName: sourceActivityName || catalogMatch?.activityName,
    selectedActivityId: catalogMatch?.id || sourceActivity?.catalogActivityId,
    sourceDescription: sourceActivity?.description,
    deliverableType: deliverable.deliverableType || deliverable.type,
    stadiu: inferSourceStadiu(deliverable),
    titleConfirmed: deliverable.titleConfirmed,
    hasExtractedText: Boolean(deliverable.docText || deliverable.firstPageText),
    eligibilityCheck: deliverable.eligibilityCheck,
  };
}

export function buildExistingDeliverableSourceSuggestions(args: {
  context: ExistingDeliverableSourceContext;
  currentSaCode?: string;
  currentActivityName?: string;
  currentDeliverable?: Pick<DeliverableSlot, 'deliverableType' | 'type' | 'stadiu'>;
}) {
  const { context, currentActivityName, currentDeliverable, currentSaCode } = args;
  const suggestions: ExistingDeliverableSourceSuggestion[] = [];

  if (
    context.sourceSaCode
    && context.sourceActivityName
    && (context.sourceSaCode !== currentSaCode || context.sourceActivityName !== currentActivityName)
  ) {
    suggestions.push({
      deliverableId: context.deliverableId,
      action: 'activity',
      label: 'Aplica incadrarea sursa',
      detail: `${context.sourceSaCode} - ${context.sourceActivityName}`,
    });
  }

  const currentDeliverableType = currentDeliverable?.deliverableType || currentDeliverable?.type;
  if (context.deliverableType && context.deliverableType !== currentDeliverableType) {
    suggestions.push({
      deliverableId: context.deliverableId,
      action: 'deliverableType',
      label: 'Aplica tipul livrabilului',
      detail: context.deliverableType,
    });
  }

  if (context.stadiu && context.stadiu !== currentDeliverable?.stadiu) {
    suggestions.push({
      deliverableId: context.deliverableId,
      action: 'stadiu',
      label: 'Aplica stadiul',
      detail: context.stadiu,
    });
  }

  return suggestions;
}
