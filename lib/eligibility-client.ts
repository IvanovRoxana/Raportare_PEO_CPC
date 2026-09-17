'use client';
import { fetchAuthSession } from 'aws-amplify/auth';
import { documentStages, EligibilityDocumentRequestError, type DocumentDiagnostic } from './eligibility-document-diagnostics';

export async function eligibilityRequest(path: string, body?: unknown, signal?: AbortSignal) {
  const token = (await fetchAuthSession()).tokens?.accessToken?.toString();
  if (!token) {
    if (path === '/api/eligibility/documents') throw new EligibilityDocumentRequestError('Sesiunea Cognito lipseste.',
      { stage: 'authentication', code: 'SESSION_MISSING', action: 'Autentifica-te din nou.' });
    throw new Error('Sesiunea Cognito lipseste.');
  }
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    if (path === '/api/eligibility/documents') {
      const diagnostic = result?.diagnostic as DocumentDiagnostic | undefined;
      if (diagnostic && Object.hasOwn(documentStages, diagnostic.stage) && typeof diagnostic.code === 'string' && typeof diagnostic.action === 'string') {
        throw new EligibilityDocumentRequestError(result.error || 'Operatia nu a putut fi finalizata.', diagnostic);
      }
      throw new EligibilityDocumentRequestError(`Serverul a returnat un raspuns ${!result ? 'neinterpretabil ' : ''}(HTTP ${response.status}).`,
        { stage: 'request', code: `DOCUMENT_HTTP_${response.status}`, action: 'Reincearca; daca eroarea persista, transmite codul administratorului.' });
    }
    throw new Error(result?.error || `Operatia nu a putut fi finalizata (HTTP ${response.status}).`);
  }
  return result;
}
