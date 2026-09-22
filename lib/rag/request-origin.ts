function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || '';
}

export function hasSamePublicRequestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    // Amplify SSR forwards the browser host separately from its internal request URL.
    const requestHost = firstHeaderValue(request.headers.get('x-forwarded-host'))
      || firstHeaderValue(request.headers.get('host'))
      || new URL(request.url).host;
    return originHost === requestHost.toLowerCase();
  } catch {
    return false;
  }
}
