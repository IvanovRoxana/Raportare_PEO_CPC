function getBearerToken(value?: string | null) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function getCognitoAccessTokenFromRequest(
  request: Request,
  options: { allowAuthorizationHeader?: boolean } = {},
) {
  const explicitToken = (
    request.headers.get('x-cognito-access-token')
    || request.headers.get('x-rag-cognito-token')
  )?.trim();

  if (explicitToken) return explicitToken;
  return options.allowAuthorizationHeader
    ? getBearerToken(request.headers.get('authorization'))
    : '';
}
