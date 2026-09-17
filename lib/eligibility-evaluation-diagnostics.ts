import { diagnoseDocumentError } from './eligibility-document-diagnostics.ts';

export const evaluationStages = {
  request: 'validarea cererii de evaluare',
  context: 'pregatirea documentelor si surselor evaluarii',
  catalog: 'incarcarea catalogului de activitati',
  validation: 'validarea documentelor pentru evaluare',
  rules: 'incarcarea regulilor de eligibilitate',
  references: 'pregatirea surselor de referinta',
  snapshot: 'pregatirea contextului de evaluare',
  reuse: 'verificarea evaluarilor anterioare',
  registration: 'inregistrarea evaluarii',
  budget: 'rezervarea bugetului de evaluare',
  model: 'analiza AI a documentelor',
  result_validation: 'validarea rezultatului AI',
  revalidation: 'reverificarea contextului evaluarii',
  save: 'salvarea rezultatului evaluarii',
} as const;
export type EvaluationStage = keyof typeof evaluationStages;
export type EvaluationFailure = { error: string; code: string; action: string; status: number;
  stage: EvaluationStage; requestId?: string; runId?: string };
export type EvaluationDiagnosticContext = { stage: EvaluationStage; requestId?: string; runId?: string; failure?: EvaluationFailure };

type ErrorInfo = { name?: string; message?: string; code?: string; status?: number; statusCode?: number; cause?: unknown;
  lastError?: unknown; data?: { error?: { code?: string } }; finishReason?: string;
  $metadata?: { requestId?: string; httpStatusCode?: number }; responseHeaders?: Record<string, string> };
function errorChain(error: unknown): ErrorInfo[] {
  const values: ErrorInfo[] = [];
  while (error && typeof error === 'object' && values.length < 6 && !values.includes(error as ErrorInfo)) {
    const value = error as ErrorInfo;
    values.push(value);
    error = value.cause || value.lastError;
  }
  return values;
}

/** Only fixed messages or existing application errors may reach the client; never provider payloads. */
export function diagnoseEvaluationError(error: unknown, context: EvaluationDiagnosticContext): EvaluationFailure {
  const chain = errorChain(error);
  const value = chain[0] || {};
  const result = (code: string, message: string, action: string, status = 503): EvaluationFailure => ({
    code, error: message, action, status, stage: context.stage, requestId: context.requestId, runId: context.runId,
  });
  const investigate = 'Transmite administratorului codul si referinta de diagnostic.';
  if (['EligibilityExecutionError', 'AiGovernanceError', 'EligibilityAccessError', 'EligibilityAssessmentInputError'].includes(value.name || '')) {
    return result(value.code || (value.name === 'EligibilityAssessmentInputError' ? 'ELIGIBILITY_INPUT_INCOMPLETE' : 'ELIGIBILITY_ACCESS_DENIED'),
      value.message || 'Cererea de evaluare a fost respinsa.', value.status === 401 ? 'Autentifica-te din nou.' : 'Urmeaza indicatia din mesaj; daca problema persista, contacteaza administratorul.',
      value.status || 422);
  }
  if (value.code === 'OPENAI_API_KEY_MISSING') return result('OPENAI_API_KEY_MISSING',
    'Serviciul AI nu este configurat pe server.', 'Administratorul trebuie sa verifice configuratia serviciului AI.', 500);
  if (context.stage === 'catalog') {
    if (value.name === 'CatalogAuthenticationError' || [
      'Sesiunea Cognito nu permite citirea catalogului. Autentifica-te din nou.',
      'Lipseste autentificarea Cognito pentru verificarea catalogului de activitati.',
    ].includes(value.message || '')) return result('ELIGIBILITY_CATALOG_AUTH',
      'Sesiunea Cognito nu permite citirea catalogului de activitati.', 'Autentifica-te din nou; daca problema persista, administratorul trebuie sa verifice accesul catalogului.', 401);
    const catalogMessages = [
      'Profilul returnat nu corespunde expertului selectat.',
      'Profilul expertului nu a putut fi identificat in baza de date sau in datele de referinta.',
      'Expertul selectat este inactiv.',
      'Profilul expertului nu are categoria si subactivitatile configurate.',
      'Subactivitatea selectata nu este atribuita expertului in profilul autorizat.',
    ];
    if (catalogMessages.includes(value.message || '')) return result('ELIGIBILITY_CATALOG_PROFILE', value.message!,
      'Administratorul trebuie sa verifice asocierea profilului expertului cu proiectul, categoria si subactivitatile.', 422);
  }
  if (context.stage === 'rules' && value.message === 'Versiuni de reguli in conflict.') return result('ELIGIBILITY_RULES_CONFLICT',
    'Exista versiuni publicate ale regulilor cu aceeasi prioritate.', 'Responsabilul de proiect trebuie sa verifice versiunile regulilor.', 409);
  for (const cause of chain) {
    if (cause.name === 'AI_APICallError') {
      const code = cause.data?.error?.code || cause.code;
      if (code === 'insufficient_quota') return result('AI_QUOTA_EXHAUSTED', 'Furnizorul AI a raportat epuizarea cotei disponibile.',
        'Administratorul trebuie sa verifice creditul si limita de consum API.', 429);
      if (code === 'context_length_exceeded') return result('AI_CONTEXT_TOO_LARGE', 'Documentele si contextul depasesc limita de intrare a modelului AI.',
        'Redu grupul de documente sau solicita administratorului ajustarea contextului.', 422);
      if (code === 'invalid_json_schema') return result('AI_RESPONSE_SCHEMA_INVALID', 'Furnizorul AI a respins schema de raspuns configurata de aplicatie.', investigate, 500);
      if (cause.statusCode === 401) return result('AI_AUTHENTICATION_FAILED', 'Autentificarea serverului la serviciul AI a esuat.',
        'Administratorul trebuie sa verifice cheia API configurata pe server.', 503);
      if (code === 'model_not_found' || [403, 404].includes(cause.statusCode || 0)) return result('AI_MODEL_ACCESS_DENIED',
        'Modelul sau resursa AI solicitata nu este accesibila serverului.', 'Administratorul trebuie sa verifice modelul si accesul proiectului AI.');
      if (cause.statusCode === 429) return result('AI_RATE_LIMIT', 'Furnizorul AI a limitat temporar cererile.', 'Asteapta putin si reincearca verificarea.', 429);
      if (cause.statusCode === 400) return result('AI_REQUEST_REJECTED', 'Furnizorul AI a respins parametrii cererii de evaluare.', investigate, 502);
      if ((cause.statusCode || 0) >= 500) return result('AI_UNAVAILABLE', 'Serviciul AI a raportat o eroare interna.', 'Reincearca verificarea mai tarziu.', 502);
    }
    if (['ValidationException', 'TransactionCanceledException'].includes(cause.name || '')) return result('EVALUATION_DATABASE_REJECTED',
      'Baza de date a respins operatia necesara evaluarii.', investigate, 503);
    const storage = diagnoseDocumentError(cause, 'original');
    if (storage.code === 'STORAGE_CONNECTION' && chain.some((item) => item.name === 'AI_APICallError')) return result('AI_CONNECTION_FAILED',
      'Conexiunea serverului cu serviciul AI a esuat inainte de primirea unui raspuns.', 'Reincearca; daca problema persista, administratorul trebuie sa verifice conexiunea serverului.');
    if (storage.code !== 'DOCUMENT_ERROR') return result(storage.code === 'DOCUMENT_TIMEOUT' ? 'ELIGIBILITY_TIMEOUT'
      : storage.code === 'BACKEND_NOT_CONFIGURED' ? 'ELIGIBILITY_BACKEND_NOT_DEPLOYED' : storage.code, storage.error, storage.action, storage.status);
  }
  if (value.name === 'ZodError' && !['model', 'result_validation'].includes(context.stage)) return result('EVALUATION_DATA_INVALID',
    'Datele necesare acestei etape nu respecta structura asteptata.', investigate, 422);
  if (chain.some((cause) => ['AI_NoObjectGeneratedError', 'AI_NoOutputGeneratedError', 'AI_TypeValidationError', 'AI_JSONParseError', 'ZodError'].includes(cause.name || ''))) {
    return result('AI_RESULT_INVALID', 'Rezultatul generat nu respecta structura necesara evaluarii.',
      'Reincearca verificarea. Daca problema persista, transmite referinta administratorului.', 502);
  }
  if (chain.some((cause) => cause.name === 'AI_APICallError')) return result('AI_CONNECTION_FAILED',
    'Apelul catre serviciul AI nu a primit un raspuns HTTP utilizabil.', 'Reincearca; daca problema persista, administratorul trebuie sa verifice conexiunea serverului.');
  return result('ELIGIBILITY_EXECUTION_FAILED', 'Operatia a esuat; cauza exacta nu a putut fi identificata automat.', investigate, 500);
}

export function safeEvaluationErrorMetadata(error: unknown) {
  const safe = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : undefined;
  return errorChain(error).map((cause) => ({ type: safe(cause.name), code: safe(cause.code || cause.data?.error?.code),
    status: typeof cause.statusCode === 'number' ? cause.statusCode : cause.$metadata?.httpStatusCode,
    requestId: safe(cause.$metadata?.requestId || cause.responseHeaders?.['x-request-id']), finishReason: safe(cause.finishReason) }));
}

export class EligibilityEvaluationRequestError extends Error {
  readonly diagnostic: EvaluationFailure;
  constructor(diagnostic: EvaluationFailure) { super(diagnostic.error); this.name = 'EligibilityEvaluationRequestError'; this.diagnostic = diagnostic; }
}

export function evaluationFailureFromResponse(value: unknown): EvaluationFailure | null {
  if (!value || typeof value !== 'object') return null;
  const failure = value as EvaluationFailure;
  return Object.hasOwn(evaluationStages, failure.stage) && typeof failure.code === 'string' && typeof failure.error === 'string'
    && typeof failure.action === 'string' && typeof failure.status === 'number'
    && (failure.requestId === undefined || typeof failure.requestId === 'string')
    && (failure.runId === undefined || typeof failure.runId === 'string') ? failure : null;
}

export function formatEvaluationFailure(error: EligibilityEvaluationRequestError) {
  const { stage, code, action, requestId, runId } = error.diagnostic;
  return `Eroare la ${evaluationStages[stage]}: ${error.message} ${action} Cod: ${code}${requestId ? `; referinta: ${requestId}` : ''}${runId ? `; evaluare: ${runId}` : ''}. Evaluarea nu a fost finalizata.`;
}
