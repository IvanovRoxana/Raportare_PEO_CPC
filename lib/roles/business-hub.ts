import type { Expert } from '../types.ts';
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
