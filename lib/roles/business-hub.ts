import type { Expert } from '../types.ts';
import type { Activity } from '../types.ts';
import { normalizePeoCategory } from '../peo-category.ts';

export const BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE =
  'Coordonarea și supervizarea activităților de interes pentru membrii Confederației Patronale Concordia, derulate în BusinessHUB pentru asigurarea unei funcționări eficiente și corespunzătoare';

export const BUSINESS_HUB_ROLE = {
  category: 'bh',
  saCodes: ['SA3.2'],
  defaultSaCode: 'SA3.2',
  defaultActivityTitle: BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE,
  enabledSections: {
    businessHubTab: true,
    entityRequestUpload: false,
    momDeliverable: true,
    monthlyPv: true,
    gdprAssistant: false,
    grupTinta: false,
  },
} as const;

function normalizeActivityLabel(value?: string | null) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isBusinessHubRegistryActivity(
  activity: Pick<Activity, 'activityType' | 'title' | 'businessHubMetaJson'> | null | undefined,
  expertCategory?: string | null,
) {
  if (!activity) return false;
  if (normalizePeoCategory(expertCategory ?? undefined) !== BUSINESS_HUB_ROLE.category) return false;
  if (activity.businessHubMetaJson) return true;

  const registryTitle = normalizeActivityLabel(BUSINESS_HUB_REGISTRY_ACTIVITY_TITLE);
  return normalizeActivityLabel(activity.activityType) === registryTitle
    || normalizeActivityLabel(activity.title) === registryTitle;
}

export type ActivityFormRoleConfig = {
  category: string;
  enabledSections: {
    businessHubTab: boolean;
    entityRequestUpload: boolean;
    momDeliverable: boolean;
    monthlyPv: boolean;
    gdprAssistant: boolean;
    grupTinta: boolean;
  };
  defaultSaCode?: string;
  defaultActivityTitle?: string;
};

export function getActivityFormRoleConfig(expert?: Pick<Expert, 'category'> | null): ActivityFormRoleConfig {
  const category = normalizePeoCategory(expert?.category);

  if (category === BUSINESS_HUB_ROLE.category) {
    return {
      category,
      enabledSections: { ...BUSINESS_HUB_ROLE.enabledSections },
      defaultSaCode: BUSINESS_HUB_ROLE.defaultSaCode,
      defaultActivityTitle: BUSINESS_HUB_ROLE.defaultActivityTitle,
    };
  }

  return {
    category,
    enabledSections: {
      businessHubTab: false,
      entityRequestUpload: false,
      momDeliverable: true,
      monthlyPv: false,
      gdprAssistant: category === 'gdpr',
      grupTinta: category === 'gt',
    },
  };
}

export function shouldShowGrupTintaActivitySection(args: {
  expert?: Pick<Expert, 'category'> | null;
  wizardStep: string;
  saCode?: string | null;
}) {
  return (
    args.wizardStep === 'collaboration'
    && normalizePeoCategory(args.expert?.category) === 'gt'
    && String(args.saCode ?? '').trim() === 'SA1.1'
  );
}
