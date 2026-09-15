import { NextResponse } from 'next/server';
import { assertRagAdminRequest, guardRagAdminRequest, ragAdminAuthErrorResponse } from '@/lib/rag/admin-auth';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { indexKnowledgeDocument } from '@/lib/rag/store';
import { extractPdfTextFromBuffer } from '@/lib/rag/pdf-text';
import {
  cleanReferenceTitle,
  inferRagReferenceImportFromFileName,
  type RagReferenceImportOverride,
} from '@/lib/rag/reference-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024;

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
    const createdBy = getString(formData.get('createdBy')) || 'admin-rag-reference-pdf-import';
    const projectCode = getString(formData.get('projectCode')) || '302141';
    const globalOverride = buildFormOverride(formData);
    const overrides = parseOverrides(formData.get('overrides'));
    const files = getFiles(formData);

    if (!files.length) {
      return NextResponse.json({ error: 'Incarca cel putin un PDF in campul files.' }, { status: 400 });
    }

    if (!dryRun && !authToken) {
      return NextResponse.json({ error: 'Importul RAG real necesita x-cognito-access-token pentru scrierea in AppSync.' }, { status: 401 });
    }

    const results = [];

    for (const file of files) {
      const fileName = file.name || 'document.pdf';
      const contentType = file.type || 'application/pdf';
      const isPdf = fileName.toLowerCase().endsWith('.pdf') || contentType === 'application/pdf';

      if (!isPdf) {
        results.push({
          fileName,
          status: 'skipped',
          reason: 'Fisierul nu este PDF.',
        });
        continue;
      }

      if (file.size > MAX_PDF_SIZE_BYTES) {
        results.push({
          fileName,
          status: 'skipped',
          reason: 'PDF-ul depaseste limita de 15 MB pentru importul sincron.',
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

      let extracted;
      try {
        extracted = await extractPdfTextFromBuffer(await file.arrayBuffer());
      } catch (error) {
        results.push({
          fileName,
          title: inference.input.title,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Extragerea textului din PDF a esuat.',
          warnings: inference.warnings,
        });
        continue;
      }

      if (extracted.text.length < 80) {
        results.push({
          fileName,
          title: inference.input.title,
          status: 'skipped',
          reason: 'PDF-ul nu contine suficient text nativ pentru indexare. Este posibil sa necesite OCR.',
          pageCount: extracted.pageCount,
          warnings: inference.warnings,
        });
        continue;
      }

      const result = await indexKnowledgeDocument({
        ...inference.input,
        text: extracted.text,
        metadata: {
          ...(inference.input.metadata ?? {}),
          importEndpoint: 'index-reference-pdfs',
          fileSize: file.size,
          contentType,
          pageCount: extracted.pageCount,
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
        warnings: inference.warnings,
        preview: result.chunks.slice(0, 2).map((chunk) => ({
          chunkIndex: chunk.chunkIndex,
          tokenEstimate: chunk.tokenEstimate,
          text: chunk.text.slice(0, 220),
        })),
      });
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
