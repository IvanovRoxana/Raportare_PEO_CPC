import { MAX_REFERENCE_FILE_BYTES, inferRagReferenceImportFromFileName, type RagReferenceImportOverride } from './reference-import.ts';

export type ReferenceUploadResult = {
  fileName: string;
  status: 'dry_run' | 'indexed' | 'duplicate' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
  chunks?: number;
  pageCount?: number;
  documentId?: string;
  warnings?: string[];
  preview?: Array<{ text: string }>;
};

export function validateReferenceUpload(file: Pick<File, 'name' | 'size'>, projectCode: string, override: RagReferenceImportOverride) {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Sunt acceptate doar PDF si DOCX.';
  if (!file.size || file.size > MAX_REFERENCE_FILE_BYTES) return 'Fisierul trebuie sa aiba intre 1 byte si 15 MB.';
  if (!projectCode.trim()) return 'Completeaza codul proiectului.';
  if (!override.sourceType) return 'Alege tipul sursei.';
  if (override.sourceType === 'fisa_post' && !override.expertRole?.trim()) return 'Completeaza pozitia expertului.';
  if (['scop_sa', 'descriere_activitati'].includes(override.sourceType) && !override.saCode?.trim()) return 'Completeaza codul SA.';
  const inference = inferRagReferenceImportFromFileName(file.name, { projectCode, override });
  return inference.ok ? null : inference.reason;
}

export async function uploadReferenceFile(
  file: File,
  projectCode: string,
  override: RagReferenceImportOverride,
  dryRun: boolean,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<ReferenceUploadResult> {
  const validation = validateReferenceUpload(file, projectCode, override);
  if (validation) throw new Error(validation);
  if (!token) throw new Error('Sesiunea Cognito lipseste. Autentifica-te din nou.');
  const body = new FormData();
  body.set('files', file);
  body.set('projectCode', projectCode.trim());
  body.set('dryRun', String(dryRun));
  body.set('overrides', JSON.stringify({ [file.name]: override }));
  const response = await fetcher('/api/admin/rag/index-reference-pdfs', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Import indisponibil (HTTP ${response.status}).`);
  const result = data?.results?.[0] as ReferenceUploadResult | undefined;
  const expected = dryRun ? ['dry_run', 'skipped', 'failed'] : ['indexed', 'duplicate', 'skipped', 'failed'];
  if (!result || result.fileName !== file.name || !expected.includes(result.status)) {
    throw new Error('Serverul nu a confirmat rezultatul pentru acest fisier.');
  }
  return result;
}
