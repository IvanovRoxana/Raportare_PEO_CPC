import { archiveRagOriginal } from '@/lib/eligibility-originals';
import { authenticateEligibilityRequest } from '@/lib/eligibility-resolver';
import { assertKnowledgeRequest, knowledgeAuthErrorResponse } from '@/lib/rag/knowledge-auth';
import { NextResponse } from 'next/server';
import { guardRagAdminRequest, ragAdminAuthErrorResponse } from '@/lib/rag/admin-auth';
import { getCognitoAccessTokenFromRequest } from '@/lib/rag/cognito-auth';
import { indexKnowledgeDocument } from '@/lib/rag/store';
import { REPORTING_EXAMPLE_SOURCE_TYPE, validateReportingExampleInput } from '@/lib/rag/reporting-examples';
import { prepareIndexGeneration } from '@/lib/rag/index-generation';
import { getRagEmbeddingModelName } from '@/lib/rag/embeddings';
import { hashRagText } from '@/lib/rag/chunking';
import { invalidateProjectReferenceCache } from '@/lib/rag/eligibility-context';
import outputs from '@/amplify_outputs.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    let authToken = '';
    if (req.headers.get('authorization')) {
      authToken = await assertKnowledgeRequest(req);
    } else {
      const denied = guardRagAdminRequest(req);
      if (denied) return denied;
      authToken = getCognitoAccessTokenFromRequest(req, { allowAuthorizationHeader: false });
    }

    const url = new URL(req.url);
    const body = await req.json();
    let text = typeof body?.text === 'string' ? body.text : '';
    const title = typeof body?.title === 'string' ? body.title : body?.originalFileName;
    const sourceType = typeof body?.sourceType === 'string' ? body.sourceType : 'other';
    const projectCode = typeof body?.projectCode === 'string' ? body.projectCode.trim() : '';
    const saCode = typeof body?.saCode === 'string' ? body.saCode.trim() : '';
    const expertId = typeof body?.expertId === 'string' ? body.expertId.trim() : '';
    const expertName = typeof body?.expertName === 'string' ? body.expertName.trim() : '';
    const expertRole = typeof body?.expertRole === 'string' ? body.expertRole.trim() : '';
    const roleId = typeof body?.roleId === 'string' ? body.roleId.trim() : '';
    const dryRun = body?.dryRun === true || url.searchParams.get('dryRun') === 'true';
    const isProjectReference = ['cerere_finantare', 'manual_beneficiar'].includes(sourceType);
    const metadata = {
      ...(body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      // One current document of each official type serves the entire project.
      // Re-indexing publishes a new generation instead of creating a copy per case.
      ...(isProjectReference ? { sourceIdentity: `project:${projectCode}:${sourceType}` } : {}),
    };

    if (!text.trim() || !title) {
      return NextResponse.json({ error: 'Documentul RAG are nevoie de title si text.' }, { status: 400 });
    }

    if (['cerere_finantare', 'manual_beneficiar'].includes(sourceType) && !projectCode) {
      return NextResponse.json({ error: 'Sursele de proiect necesita codul proiectului.' }, { status: 400 });
    }
    if (['cerere_finantare', 'manual_beneficiar'].includes(sourceType) && saCode) {
      return NextResponse.json({ error: 'Sursele globale de proiect nu pot fi asociate accidental unui cod SA.' }, { status: 400 });
    }
    if (['scop_sa', 'descriere_activitati'].includes(sourceType) && (!projectCode || !saCode)) {
      return NextResponse.json({ error: 'Sursele subactivitatii necesita codul proiectului si codul SA.' }, { status: 400 });
    }
    if (sourceType === 'fisa_post' && !expertId && !expertName && !expertRole && !roleId) {
      return NextResponse.json({ error: 'Sursa fisei postului necesita un expert sau un rol.' }, { status: 400 });
    }

    const isApprovedHistorical = ['raport_activitate_aprobat', 'livrabil_aprobat'].includes(sourceType);
    try {
      validateReportingExampleInput({ sourceType, projectCode, saCode, category: body.category,
        activityName: body.activityName, approvalStatus: body.approvalStatus, metadata: body.metadata });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Exemplu RAG invalid.' }, { status: 400 });
    }
    if (isApprovedHistorical) {
      const month = Number(body?.month);
      const year = Number(body?.year);
      const requiresActivityScope = sourceType === 'livrabil_aprobat';
      if (!expertId || !projectCode || (requiresActivityScope && (!saCode || !body?.activityName)) || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
        return NextResponse.json({ error: requiresActivityScope
          ? 'Livrabilele aprobate necesita expert, proiect, luna, an, SA si activitate.'
          : 'Rapoartele de activitate aprobate necesita expert, proiect, luna si an.' }, { status: 400 });
      }
      if (body?.approvalStatus !== 'approved') {
        return NextResponse.json({ error: 'Doar documentele aprobate pot fi indexate in istoricul RAG.' }, { status: 400 });
      }
      const now = new Date();
      const ageInMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
      if (ageInMonths < 0 || ageInMonths >= 12) {
        return NextResponse.json({ error: 'Documentul trebuie sa apartina ultimelor 12 luni.' }, { status: 400 });
      }
    }

    if (!dryRun && !authToken) {
      return NextResponse.json({ error: 'Importul RAG real necesita x-cognito-access-token pentru scrierea in AppSync.' }, { status: 401 });
    }

    let generation;
    if (sourceType === REPORTING_EXAMPLE_SOURCE_TYPE) {
      if (body.expectedApiUrl && body.expectedApiUrl !== outputs.data.url) return NextResponse.json({ error: 'Backend diferit de lotul aprobat.' }, { status: 409 });
      if (!body.originalFileName?.endsWith('.md') || body.originalFileBase64) return NextResponse.json({ error: 'Exemplele pregatite se importa ca text Markdown, separat de originalele DOCX.' }, { status: 400 });
      generation = prepareIndexGeneration({ title, sourceType, text, projectCode, saCode, category: body.category,
        activityName: body.activityName, expertId: expertId || undefined, expertRole: expertRole || undefined, roleId: roleId || undefined,
        originalFileName: body.originalFileName, extractionComplete: true,
        metadata: { ...body.metadata, originalFileHash: hashRagText(text) } }, getRagEmbeddingModelName()).manifest;
      if (body.expectedGenerationId && body.expectedGenerationId !== generation.indexGenerationId) return NextResponse.json({ error: 'Generatia/modelul de embeddings difera de simulare.' }, { status: 409 });
    }

    let original: { s3Key: string; originalFileHash: string } | undefined;
    let actorId = 'dry-run';
    if (!dryRun) {
      const actor = await authenticateEligibilityRequest(req);
      if (!actor.roles.some((role) => ['pm', 'admin'].includes(role))) return NextResponse.json({ error: 'Importul necesita PM/Admin.' }, { status: 403 });
      actorId = actor.id;
      const fileName = typeof body.originalFileName === 'string' ? body.originalFileName : `${title}.txt`;
      const binary = /\.(pdf|docx)$/i.test(fileName);
      // The SSR runtime has no binary archive capability. PDF/DOCX text is
      // extracted in the browser and indexed directly, just like bulk imports.
      if (!binary) {
        const bytes = body.originalFileBase64 ? new Uint8Array(Buffer.from(String(body.originalFileBase64), 'base64')) : new TextEncoder().encode(text);
        original = await archiveRagOriginal(fileName, bytes);
        body.extractionComplete = true;
      }
    }
    const result = await indexKnowledgeDocument({
      title,
      sourceType,
      text,
      category: typeof body?.category === 'string' ? body.category : undefined,
      expertId: expertId || undefined,
      expertName: expertName || undefined,
      expertRole: expertRole || undefined,
      roleId: roleId || undefined,
      projectCode: projectCode || undefined,
      month: body?.month != null && Number.isFinite(Number(body.month)) ? Number(body.month) : undefined,
      year: body?.year != null && Number.isFinite(Number(body.year)) ? Number(body.year) : undefined,
      saCode: saCode || undefined,
      activityName: typeof body?.activityName === 'string' ? body.activityName : undefined,
      approvalStatus: typeof body?.approvalStatus === 'string' ? body.approvalStatus : undefined,
      originalFileName: typeof body?.originalFileName === 'string' ? body.originalFileName : undefined,
      s3Key: original?.s3Key || (typeof body?.s3Key === 'string' ? body.s3Key : undefined),
      createdBy: actorId,
      metadata: { ...metadata, originalFileHash: original?.originalFileHash },
      extractionSource: body?.extractionSource === 'ocr' ? 'ocr' : body?.extractionSource === 'native' ? 'native' : undefined,
      extractionComplete: typeof body?.extractionComplete === 'boolean' ? body.extractionComplete : undefined,
    }, { dryRun, authToken });

    if (!dryRun && ['cerere_finantare', 'manual_beneficiar'].includes(sourceType)) {
      invalidateProjectReferenceCache();
    }

    return NextResponse.json({
      ok: true,
      ...(generation ? { generation, backendApiUrl: outputs.data.url } : {}),
      dryRun: result.dryRun,
      documentId: result.document?.id,
      chunks: result.chunks.length,
      duplicate: result.chunks.length === 0 && Boolean(result.document?.id),
      preview: result.chunks.slice(0, 3).map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        tokenEstimate: chunk.tokenEstimate,
        text: chunk.text.slice(0, 220),
      })),
    });
  } catch (error) {
    const authError = knowledgeAuthErrorResponse(error) || ragAdminAuthErrorResponse(error);
    if (authError) return authError;
    console.error('[admin-rag-index-document] Failed to index document.', error);
    return NextResponse.json({ error: 'Indexarea documentului RAG a esuat.' }, { status: 500 });
  }
}
