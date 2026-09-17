import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/);
const schema = z.object({ version: z.literal(1), id, sources: z.array(z.object({
  id, file: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), title: z.string().min(1),
  mappings: z.array(z.object({ id, projectCode: z.string().min(1),
    sourceType: z.enum(['cerere_finantare', 'manual_beneficiar', 'descriere_activitati', 'fisa_post', 'raportare_aprobata_oir', 'livrabil_istoric']),
    category: z.string().optional(), roleId: z.string().optional(), expertId: z.string().optional(), saCode: z.string().optional(),
    approvalStatus: z.string().optional(),
  }).strict()).min(1),
}).strict()).min(1) }).strict();

/** A manifest supplies explicit mappings; the existing importer still owns extraction and publication. */
export async function collectManifestDocuments(manifestPath, extract) {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = schema.parse(JSON.parse(raw));
  const manifestHash = createHash('sha256').update(raw).digest('hex');
  const documents = [];
  const seenSources = new Set();
  for (const source of manifest.sources) {
    if (seenSources.has(source.id)) throw new Error(`Sursa duplicata: ${source.id}`);
    seenSources.add(source.id);
    const filePath = path.resolve(path.dirname(manifestPath), source.file);
    const extension = path.extname(filePath).toLowerCase();
    if (!['.pdf', '.docx', '.txt', '.md'].includes(extension)) throw new Error(`Format nesuportat: ${source.id}`);
    const bytes = await readFile(filePath);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Hash diferit pentru sursa: ${source.id}`);
    const extraction = await extract(filePath, extension);
    if (!extraction.complete || extraction.failedSections?.length || extraction.text.trim().length < 100) {
      throw new Error(`Extragere incompleta pentru sursa: ${source.id}`);
    }
    const seenMappings = new Set();
    for (const mapping of source.mappings) {
      if (seenMappings.has(mapping.id)) throw new Error(`Asociere duplicata: ${source.id}/${mapping.id}`);
      seenMappings.add(mapping.id);
      if (mapping.sourceType === 'fisa_post' && !mapping.roleId && !mapping.expertId) throw new Error(`Fisa postului necesita rol sau expert: ${source.id}`);
      if (mapping.sourceType === 'descriere_activitati' && !mapping.saCode) throw new Error(`Descrierea necesita SA: ${source.id}`);
      if (mapping.sourceType === 'raportare_aprobata_oir' && mapping.approvalStatus !== 'approved') throw new Error(`Aprobarea istorica trebuie declarata: ${source.id}`);
      const { id: mappingId, ...scope } = mapping;
      documents.push({ ...scope, title: source.title, text: extraction.text, extractionComplete: true, extractionSource: 'native',
        originalFileName: path.basename(filePath), originalFileBase64: bytes.toString('base64'), createdBy: 't0-manifest-import',
        metadata: { sourceIdentity: `t0:${manifest.id}:${source.id}:${mappingId}`, originalFileHash: source.sha256,
          manifestId: manifest.id, manifestHash, manifestVersion: manifest.version, sourceId: source.id, mappingId,
          processedSections: extraction.processedSections || [], failedSections: [] },
      });
    }
  }
  return { documents, skipped: [], manifest: { id: manifest.id, hash: manifestHash, sources: seenSources.size, mappings: documents.length } };
}
