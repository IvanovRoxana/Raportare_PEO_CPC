import type { GTEntity, GTIndicatorResult, GTPerson } from './types.ts';

export const GT_INDICATOR_TARGETS = {
  '5SO04': 6,
  '5SR04': 6,
  '5SO01': 375,
} as const;

export function computeGTIndicators(entities: GTEntity[], persons: GTPerson[]): Record<GTIndicatorResult['code'], GTIndicatorResult> {
  const so04 = entities.filter((entity) => Boolean(entity.dataIntrareOperatiune) || entity.indicator5SO04).length;
  const sr04 = entities.filter((entity) => Boolean(entity.indicator5SR04)).length;
  const so01 = persons.filter((person) => Boolean(person.dataIntrareOperatiune) || person.indicator5SO01).length;
  const sr01 = persons.filter((person) => Boolean(person.indicator5SR01)).length;
  const sr01Target = Math.ceil(so01 * 0.9);

  return {
    '5SO04': { code: '5SO04', value: so04, target: GT_INDICATOR_TARGETS['5SO04'], valid: true },
    '5SR04': { code: '5SR04', value: sr04, target: GT_INDICATOR_TARGETS['5SR04'], valid: sr04 <= so04 },
    '5SO01': { code: '5SO01', value: so01, target: GT_INDICATOR_TARGETS['5SO01'], valid: true },
    '5SR01': { code: '5SR01', value: sr01, target: sr01Target, valid: sr01 <= so01 },
  };
}

export function buildGTIndicatorSummary(entities: GTEntity[], persons: GTPerson[]) {
  const indicators = computeGTIndicators(entities, persons);
  return {
    indicators,
    totalEntities: entities.length,
    activeEntities: entities.filter((entity) => ['eligibil_validat', 'inscris_mysmis', 'in_operatiune'].includes(entity.status)).length,
    totalPersons: persons.length,
    activePersons: persons.filter((person) => ['eligibil_validat', 'inscris_mysmis', 'in_operatiune'].includes(person.status)).length,
    invalidIndicators: Object.values(indicators).filter((indicator) => !indicator.valid),
  };
}
