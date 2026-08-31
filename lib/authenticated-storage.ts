'use client';

import { fetchAuthSession } from 'aws-amplify/auth';
import { uploadData } from 'aws-amplify/storage';

type AuthenticatedUploadInput = {
  path: string;
  data: Blob | ArrayBuffer | ArrayBufferView | string;
  options?: {
    contentType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export async function getAuthenticatedStorageIdentityId() {
  const session = await fetchAuthSession({ forceRefresh: true });
  if (!session.tokens || !session.credentials || !session.identityId) {
    throw new Error('Sesiunea de autentificare a expirat. Autentifica-te din nou inainte de upload.');
  }
  return session.identityId;
}

export function normalizeAuthenticatedUploadPath(path: string, identityId?: string | null) {
  if (!identityId || !path.startsWith('deliverables/')) return path;

  const safeIdentityId = identityId.replace(/[^a-zA-Z0-9._:-]/g, '_');
  const rest = path.slice('deliverables/'.length);
  if (!rest || rest.startsWith(`${safeIdentityId}/`)) return path;

  return `deliverables/${safeIdentityId}/${rest}`;
}

export function uploadAuthenticatedData(input: AuthenticatedUploadInput) {
  return {
    result: (async () => {
      const session = await fetchAuthSession({ forceRefresh: true });
      if (!session.tokens || !session.credentials) {
        throw new Error('Sesiunea de autentificare a expirat. Autentifica-te din nou inainte de upload.');
      }

      const normalizedInput = {
        ...input,
        path: normalizeAuthenticatedUploadPath(input.path, session.identityId),
      };

      return uploadData(normalizedInput as any).result;
    })(),
  };
}
