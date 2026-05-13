export function normalizePeoCategory(category?: string) {
  const value = (category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (!value) return '';
  if (value === 'pa' || value === 'ap') return 'ap';
  if (value === 'resch' || value === 'research' || value === 'cercetare') return 'cercetare';
  if (value === 'business hub') return 'bh';
  if (value === 'comunicare') return 'com';
  if (value === 'centre regionale') return 'cr';
  if (value === 'grup tinta') return 'gt';
  if (value === 'protectia datelor') return 'gdpr';
  return value;
}

export function isGtExpertCategory(category?: string) {
  return normalizePeoCategory(category) === 'gt';
}
