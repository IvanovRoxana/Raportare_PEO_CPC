import { NextResponse } from 'next/server';
import { assertRagAdminRequest, guardRagAdminRequest, ragAdminAuthErrorResponse } from '@/lib/rag/admin-auth';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { archiveRagOriginal } from '@/lib/eligibility-originals';
import { authenticateEligibilityRequest } from '@/lib/eligibility-resolver';
import { indexKnowledgeDocument } from '@/lib/rag/store';
import { extractReferenceDocumentText } from '@/lib/rag/reference-document-text';
import {
  cleanReferenceTitle,
  inferRagReferenceImportFromFileName,
  MAX_REFERENCE_FILE_BYTES,
  type RagReferenceImportOverride,
} from '@/lib/rag/reference-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseOverrides(value: FormDataEntryValue | null): Record<string, RagReferenceImportOverride> {
  const raw = getString(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, RagReferenceImportOverride>;
  } catch {
    return {};
  }
}

function buildFormOverride(formData: FormData): RagReferenceImportOverride {
  return {
    title: getString(formData.get('title')) || undefined,
    sourceType: getString(formData.get('sourceType')) || undefined,
    projectCode: getString(formData.get('projectCode')) || undefined,
    saCode: getString(formData.get('saCode')) || undefined,
    category: getString(formData.get('category')) || undefined,
    expertId: getString(formData.get('expertId')) || undefined,
    expertName: getString(formData.get('expertName')) || undefined,
    expertRole: getString(formData.get('expertRole')) || undefined,
  };
}

function mergeOverrides(...items: Array<RagReferenceImportOverride | undefined>) {
  return items.reduce<RagReferenceImportOverride>((merged, item) => {
    if (!item) return merged;
    for (const [key, value] of Object.entries(item)) {
      if (value !== undefined && value !== '') {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  }, {});
}

function getFiles(formData: FormData) {
  return [...formData.getAll('files'), ...formData.getAll('file')]
    .filter((entry): entry is File => typeof entry === 'object' && entry instanceof File);
}

export async function POST(req: Request) {
  try {
    let authToken = '';
    if (req.headers.get('authorization')) {
      authToken = await assertRagAdminRequest(req);
    } else {
      const denied = guardRagAdminRequest(req);
      if (denied) return denied;
      authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: false });
    }

    const url = new URL(req.url);
    const formData = await req.formData();
    const dryRun = getString(formData.get('dryRun')) === 'true' || url.searchParams.get('dryRun') === 'true';
    let createdBy = 'dry-run';
    const projectCode = getString(formData.get('projectCode')) || '302141';
    const globalOverride = buildFormOverride(formData);
    const overrides = parseOverrides(formData.get('overrides'));
    const files = getFiles(formData);

    if (!files.length) {
      return NextResponse.json({ error: 'Incarca cel putin un PDF sau DOCX in campul files.' }, { status: 400 });
    }

    if (!dryRun && !authToken) {
      return NextResponse.json({ error: 'Importul RAG real necesita x-cognito-access-token pentru scrierea in AppSync.' }, { status: 401 });
    }
    if (!dryRun) {
      const actor = await authenticateEligibilityRequest(req);
      if (!actor.roles.some((role) => ['pm', 'admin'].includes(role))) return NextResponse.json({ error: 'Importul necesita PM/Admin.' }, { status: 403 });
      createdBy = actor.id;
    }

    const results = [];

    for (const file of files) {
      const fileName = file.name || 'document.pdf';
      const contentType = file.type || 'application/octet-stream';
      const isSupported = /\.(pdf|docx)$/i.test(fileName);

      if (!isSupported) {
        results.push({
          fileName,
          status: 'skipped',
          reason: 'Sunt acceptate doar fisiere PDF sau DOCX.',
        });
        continue;
      }

      if (file.size > MAX_REFERENCE_FILE_BYTES) {
        results.push({
          fileName,
          status: 'skipped',
          reason: 'Fisierul depaseste limita de 15 MB pentru importul sincron.',
        });
        continue;
      }

      const fileOverride = overrides[fileName] ?? overrides[cleanReferenceTitle(fileName)];
      const inference = inferRagReferenceImportFromFileName(fileName, {
        projectCode,
        createdBy,
        override: mergeOverrides(globalOverride, fileOverride),
      });

      if (!inference.ok) {
        results.push({
          fileName,
          title: inference.title,
          status: 'skipped',
          reason: inference.reason,
          warnings: inference.warnings,
        });
        continue;
      }

      const originalBytes = new Uint8Array(await file.arrayBuffer());
      let extracted;
      try {
        extracted = await extractReferenceDocumentText(fileName, originalBytes.buffer);
      } catch (error) {
        results.push({
          fileName,
          title: inference.input.title,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Extragerea textului a esuat.',
          warnings: inference.warnings,
        });
        continue;
      }

      if (extracted.text.length < 80) {
        results.push({
          fileName,
          title: inference.input.title,
          status: 'skipped',
          reason: 'Documentul nu contine suficient text nativ pentru indexare. Pentru PDF scanat foloseste incarcarea individuala cu OCR.',
          pageCount: extracted.pageCount,
          warnings: inference.warnings,
        });
        continue;
      }

      try {
        const original = dryRun ? undefined : await archiveRagOriginal(fileName, originalBytes);
        const result = await indexKnowledgeDocument({
          ...inference.input,
          text: extracted.text,
          s3Key: original?.s3Key, extractionComplete: extracted.complete, extractionSource: 'native',
          metadata: {
            ...(inference.input.metadata ?? {}),
            importEndpoint: 'index-reference-pdfs',
            fileSize: file.size,
            contentType,
            pageCount: extracted.pageCount,
            originalFileHash: original?.originalFileHash, processedSections: extracted.processedSections, failedSections: extracted.failedSections,
          },
        }, { dryRun, authToken });

        results.push({
          fileName,
          title: inference.input.title,
          status: dryRun ? 'dry_run' : result.chunks.length === 0 && result.document?.id ? 'duplicate' : 'indexed',
          sourceType: inference.input.sourceType,
          projectCode: inference.input.projectCode,
          saCode: inference.input.saCode,
          expertId: inference.input.expertId,
          expertName: inference.input.expertName,
          expertRole: inference.input.expertRole,
          documentId: result.document?.id,
          chunks: result.chunks.length,
          pageCount: extracted.pageCount,
          warnings: [...inference.warnings, ...extracted.warnings],
          preview: result.chunks.slice(0, 2).map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            tokenEstimate: chunk.tokenEstimate,
            text: chunk.text.slice(0, 220),
          })),
        });
      } catch (error) {
        console.error('[admin-rag-index-reference-pdfs] Indexing failed.', error);
        results.push({ fileName, status: 'failed', error: 'Indexarea a esuat. Verifica biblioteca RAG inainte de reincercare; pot exista date partiale.' });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      processed: files.length,
      indexed: results.filter((item) => item.status === 'indexed').length,
      duplicates: results.filter((item) => item.status === 'duplicate').length,
      skipped: results.filter((item) => item.status === 'skipped').length,
      failed: results.filter((item) => item.status === 'failed').length,
      results,
    });
  } catch (error) {
    const authError = ragAdminAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[admin-rag-index-reference-pdfs] Failed to import reference PDFs.', error);
    return NextResponse.json({ error: 'Importul PDF-urilor RAG a esuat.' }, { status: 500 });
  }
}
