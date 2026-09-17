import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import outputs from '../amplify_outputs.json';
import { eligibilityStore, eligibilityTable, immutablePut } from './eligibility-server-store.ts';
import { authorizeEligibilityDocument, EligibilityAccessError } from './eligibility-authorization.ts';
import type { Deliverable, Expert } from './types.ts';
import { readEligibilityOriginal } from './eligibility-originals.ts';
import type { DocumentDiagnosticContext } from './eligibility-document-diagnostics.ts';

const client = new S3Client({ region: outputs.auth.aws_region, maxAttempts: 2 });
const bucket = outputs.storage.bucket_name;
const MAX_BYTES = 15 * 1024 * 1024;
export type EligibilityDraft = {
  id: string; expertId: string; projectCode: string; actorId: string; saCode: string;
  fileName: string; declaredTitle: string; deliverableType: string; s3Key: string;
  fileSize: number; fileHash?: string; state: 'uploading' | 'ready'; createdAt: string; sourceDraftId?: string;
};

export async function createEligibilityDraft(expert: Expert, actorId: string, input: { fileName: string; fileSize: number; declaredTitle: string; deliverableType: string; saCode: string }, context?: DocumentDiagnosticContext) {
  if (context) context.stage = 'request';
  if (!expert.saCodes?.includes(input.saCode)) throw new EligibilityAccessError('Subactivitatea selectata nu este atribuita expertului.', 422);
  if (!/\.(pdf|docx|txt|md|csv|xlsx|xls)$/i.test(input.fileName)) throw new EligibilityAccessError('Format neacceptat. Sunt permise PDF, DOCX, TXT, MD, CSV, XLSX si XLS.', 422);
  if (!Number.isInteger(input.fileSize) || input.fileSize < 1) throw new EligibilityAccessError('Fisierul este gol sau dimensiunea declarata este invalida.', 422);
  if (input.fileSize > MAX_BYTES) throw new EligibilityAccessError('Fisierul depaseste limita de 15 MB.', 422);
  const id = `draft_${randomUUID()}`;
  const draft: EligibilityDraft = { ...input, id, expertId: expert.id, projectCode: expert.projectCode!, actorId,
    s3Key: `eligibility-private/originals/${id}/${input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    state: 'uploading', createdAt: new Date().toISOString() };
  if (context) context.stage = 'registration';
  await eligibilityStore.transact([immutablePut('EligibilityRuntime', draft)]);
  // Conditional PUT prevents replacement after the URL has been used once.
  if (context) context.stage = 'upload_url';
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: draft.s3Key,
    ContentType: 'application/octet-stream', IfNoneMatch: '*', ContentLength: input.fileSize }), { expiresIn: 300 });
  return { documentId: id, uploadUrl };
}

export async function getAuthorizedDraft(id: string, expert: Pick<Expert, 'id' | 'projectCode'>, visited = new Set<string>()): Promise<EligibilityDraft> {
  if (visited.has(id) || visited.size >= 30) throw new EligibilityAccessError('Legatura originalului nu poate fi verificata.', 409);
  visited.add(id);
  const draft = await eligibilityStore.get<EligibilityDraft>('EligibilityRuntime', id);
  if (!draft || !id.startsWith('draft_')) throw new EligibilityAccessError('Documentul nu este disponibil.', 404);
  try { authorizeEligibilityDocument(draft, expert); }
  catch (error) {
    // Reuse only an actual saved association, never a matching hash or project alone.
    const relations = await eligibilityStore.list<Deliverable>('Deliverable', { field: 's3Key', value: draft.s3Key });
    let allowed = false;
    for (const relation of relations) {
      if (relation.fileHash !== draft.fileHash || relation.s3Key !== draft.s3Key || !relation.activityId) continue;
      const activity = await eligibilityStore.get<{ expertId?: string; projectCode?: string }>('Activity', relation.activityId);
      if (activity?.expertId === expert.id && activity.projectCode === expert.projectCode && expert.projectCode === draft.projectCode) allowed = true;
    }
    if (!allowed) throw error;
  }
  if (draft.sourceDraftId) await getAuthorizedDraft(draft.sourceDraftId, expert, visited);
  return draft;
}

export async function reviseEligibilityDraft(id: string, expert: Expert, input: { declaredTitle: string; deliverableType: string; saCode: string }, context?: DocumentDiagnosticContext) {
  if (context) context.stage = 'authorization';
  const draft = await getAuthorizedDraft(id, expert);
  if (!expert.saCodes?.includes(input.saCode) || draft.state !== 'ready') throw new EligibilityAccessError('Contextul documentului nu este disponibil.', 422);
  if (draft.declaredTitle === input.declaredTitle && draft.deliverableType === input.deliverableType && draft.saCode === input.saCode && draft.expertId === expert.id) return { documentId: id };
  const next = { ...draft, ...input, id: `draft_${randomUUID()}`, expertId: expert.id, sourceDraftId: draft.id, createdAt: new Date().toISOString() };
  if (context) context.stage = 'registration';
  await eligibilityStore.transact([immutablePut('EligibilityRuntime', next)]);
  return { documentId: next.id };
}

export async function completeEligibilityDraft(id: string, expert: Expert, context?: DocumentDiagnosticContext) {
  if (context) context.stage = 'authorization';
  const draft = await getAuthorizedDraft(id, expert);
  if (context) context.stage = 'original';
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: draft.s3Key }), { abortSignal: AbortSignal.timeout(15_000) });
  if (!result.Body || result.ContentLength !== draft.fileSize || result.ContentLength > MAX_BYTES) throw new EligibilityAccessError('Originalul incarcat nu corespunde fisierului declarat.', 422);
  const bytes = await result.Body.transformToByteArray();
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  if (draft.fileHash && draft.fileHash !== fileHash) throw new EligibilityAccessError('Versiunea originalului s-a modificat.', 409);
  if (context) context.stage = 'confirmation';
  await eligibilityStore.transact([{ Update: { TableName: eligibilityTable('EligibilityRuntime'), Key: { id },
    UpdateExpression: 'SET #state = :ready, fileHash = :hash',
    ConditionExpression: 'expertId = :expert AND (attribute_not_exists(fileHash) OR fileHash = :hash)',
    ExpressionAttributeNames: { '#state': 'state' }, ExpressionAttributeValues: { ':ready': 'ready', ':hash': fileHash, ':expert': expert.id },
  } }]);
  const document = await readEligibilityOriginal({ ...draft, fileHash, originalFileName: draft.fileName } as unknown as Deliverable, context);
  return { documentId: id, fileHash, s3Key: draft.s3Key, s3Bucket: bucket, filePath: draft.s3Key,
    extractionComplete: document.extractionComplete === true };
}

export async function readEligibilityDraft(id: string, expert: Expert): Promise<Deliverable> {
  const draft = await getAuthorizedDraft(id, expert);
  if (draft.state !== 'ready' || !draft.fileHash) throw new EligibilityAccessError('Incarcarea documentului nu este finalizata.', 422);
  return readEligibilityOriginal({ ...draft, originalFileName: draft.fileName } as unknown as Deliverable);
}

export async function getEligibilityDraftUrl(id: string, expert: Expert, context?: DocumentDiagnosticContext) {
  if (context) context.stage = 'authorization';
  const draft = await getAuthorizedDraft(id, expert);
  if (draft.state !== 'ready') throw new EligibilityAccessError('Documentul nu este disponibil.', 422);
  if (context) context.stage = 'download_url';
  return { url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: draft.s3Key }), { expiresIn: 120 }),
    fileName: draft.fileName, expiresAt: new Date(Date.now() + 120_000).toISOString() };
}
