const PRODUCTION_ENVIRONMENTS = new Set(['production', 'prod', 'main']);

export function getAppEnvironment() {
  return (
    process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() ||
    process.env.APP_ENV?.trim().toLowerCase() ||
    'production'
  );
}

export function isStagingEnvironment() {
  return getAppEnvironment() === 'staging';
}

export function isProductionEnvironment() {
  return PRODUCTION_ENVIRONMENTS.has(getAppEnvironment());
}

export function markTestFilename(filename: string) {
  if (!isStagingEnvironment()) return filename;
  const extensionIndex = filename.lastIndexOf('.');
  if (extensionIndex <= 0) return `${filename}_TEST`;
  return `${filename.slice(0, extensionIndex)}_TEST${filename.slice(extensionIndex)}`;
}
