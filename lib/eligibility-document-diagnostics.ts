/** Public diagnostics contain fixed messages, never raw provider errors or signed URLs. */
export const documentStages = {
  request: 'validarea cererii',
  authentication: 'verificarea sesiunii',
  experts: 'citirea profilului expertului',
  authorization: 'verificarea accesului la document',
  registration: 'inregistrarea documentului',
  upload_url: 'pregatirea incarcarii',
  upload: 'incarcarea fisierului',
  original: 'citirea originalului incarcat',
  confirmation: 'confirmarea incarcarii',
  extraction_cache: 'citirea textului procesat anterior',
  extraction: 'extragerea textului din document',
  extraction_save: 'salvarea textului extras',
  download_url: 'pregatirea descarcarii',
} as const;
export type DocumentStage = keyof typeof documentStages;
export type DocumentDiagnosticContext = { stage: DocumentStage };
export type DocumentDiagnostic = { stage: DocumentStage; code: string; action: string; requestId?: string };

export function diagnoseDocumentError(error: unknown, stage: DocumentStage) {
  const value = error && typeof error === 'object' ? error as { name?: string; code?: string; message?: string } : {};
  const name = value.name || '';
  const code = value.code || name;
  const message = value.message || '';
  const result = (code: string, error: string, action: string, status = 503) => ({ error, code, action, status });
  if (message.startsWith('ELIGIBILITY_BACKEND_NOT_DEPLOYED:')) return result('BACKEND_NOT_CONFIGURED',
    'Stocarea necesara verificarii nu este configurata pe server.', 'Administratorul trebuie sa verifice configuratia modulului de eligibilitate.');
  if (['AccessDenied', 'AccessDeniedException', 'UnauthorizedException'].includes(name)) return result('STORAGE_ACCESS_DENIED',
    'Serverul nu are permisiune pentru aceasta operatie de stocare.', 'Administratorul trebuie sa verifice permisiunile serviciului; reincarcarea fisierului nu rezolva aceasta cauza.');
  if (['CredentialsProviderError', 'ExpiredToken', 'ExpiredTokenException', 'InvalidClientTokenId', 'UnrecognizedClientException'].includes(name)) return result('SERVER_CREDENTIALS',
    'Autentificarea serverului la serviciul de stocare a esuat.', 'Administratorul trebuie sa verifice identitatea si acreditarile serviciului.');
  if (['NoSuchBucket', 'ResourceNotFoundException'].includes(name)) return result('STORAGE_NOT_FOUND',
    'O resursa de stocare configurata pe server nu exista.', 'Administratorul trebuie sa verifice resursele si configuratia mediului.');
  if (['NoSuchKey', 'NotFound'].includes(name)) return result('ORIGINAL_NOT_FOUND',
    'Fisierul solicitat nu a fost gasit in stocare.', 'Reincarca fisierul si reincearca verificarea.', 404);
  if (['AbortError', 'TimeoutError', 'RequestTimeout', 'RequestTimeoutException'].includes(name) || ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)) return result('DOCUMENT_TIMEOUT',
    'Serviciul nu a raspuns in timpul disponibil.', 'Reincearca verificarea. Daca eroarea persista, transmite codul de diagnostic administratorului.', 504);
  if (['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)) return result('STORAGE_CONNECTION',
    'Conexiunea serverului cu serviciul necesar a esuat.', 'Reincearca; daca problema persista, administratorul trebuie sa verifice conectivitatea serverului.');
  if (['ThrottlingException', 'ProvisionedThroughputExceededException', 'SlowDown', 'TooManyRequestsException'].includes(name)) return result('STORAGE_BUSY',
    'Serviciul a limitat temporar numarul de cereri.', 'Asteapta putin si reincearca verificarea.', 429);
  if (['ConditionalCheckFailedException', 'TransactionCanceledException', 'PreconditionFailed'].includes(name)) return result('DOCUMENT_CONFLICT',
    'Operatia de salvare a documentului a fost refuzata sau anulata.', 'Reincearca verificarea; daca problema persista, transmite codul administratorului.', 409);
  if (message === 'ELIGIBILITY_ORIGINAL_HASH_MISMATCH') return result('ORIGINAL_CHANGED',
    'Continutul originalului nu corespunde versiunii inregistrate.', 'Reincarca versiunea corecta a documentului.', 409);
  if (message === 'ELIGIBILITY_ORIGINAL_TOO_LARGE') return result('ORIGINAL_SIZE_INVALID',
    'Originalul este gol, indisponibil sau depaseste limita de 15 MB.', 'Verifica fisierul si incarca un document de cel mult 15 MB.', 422);
  if (message === 'ELIGIBILITY_DOCUMENT_BUCKET_MISMATCH') return result('STORAGE_MISMATCH',
    'Documentul indica un spatiu de stocare diferit de cel configurat.', 'Administratorul trebuie sa verifice asocierea documentului cu mediul curent.');
  if (stage === 'extraction' && name === 'PasswordException') return result('DOCUMENT_PASSWORD',
    'Documentul este protejat cu parola.', 'Incarca o copie fara parola.', 422);
  if (stage === 'extraction' && ['InvalidPDFException', 'FormatError'].includes(name)) return result('DOCUMENT_FORMAT_INVALID',
    'Procesorul a raportat un format de document invalid.', 'Deschide documentul si exporta-l din nou in formatul acceptat.', 422);
  if (stage === 'extraction' && code === 'ERR_ENCODING_INVALID_ENCODED_DATA') return result('DOCUMENT_ENCODING',
    'Fisierul text nu foloseste codificarea UTF-8 acceptata.', 'Salveaza fisierul text cu codificare UTF-8 si reincarca-l.', 422);
  return result('DOCUMENT_ERROR', 'Operatia a esuat; cauza exacta nu a putut fi identificata automat.',
    'Transmite administratorului etapa si codul de diagnostic pentru investigatie.');
}

export class EligibilityDocumentRequestError extends Error {
  readonly diagnostic: DocumentDiagnostic;
  constructor(message: string, diagnostic: DocumentDiagnostic) {
    super(message);
    this.name = 'EligibilityDocumentRequestError';
    this.diagnostic = diagnostic;
  }
}

export function formatDocumentFailure(error: EligibilityDocumentRequestError) {
  const { stage, code, action, requestId } = error.diagnostic;
  return `Eroare la ${documentStages[stage]}: ${error.message} ${action} Cod: ${code}${requestId ? `; referinta: ${requestId}` : ''}. Evaluarea nu a fost finalizata.`;
}
