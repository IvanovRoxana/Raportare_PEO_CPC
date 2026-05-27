import type { OfferPackageDocumentInput, ProcurementOfferPackage } from './types.ts';
import { getFileExtension, normalizeFilename } from './utils.ts';

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getRelativePath(file: File) {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

export async function createOfferPackageFromFiles(args: {
  procurementProjectId: string;
  supplierId: string;
  supplierName: string;
  files: File[];
}) {
  const importedAt = new Date().toISOString();
  const packageId = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const documents: OfferPackageDocumentInput[] = [];

  for (const [index, file] of args.files.entries()) {
    const originalPath = getRelativePath(file);
    documents.push({
      id: `${packageId}-doc-${String(index + 1).padStart(3, '0')}`,
      procurementProjectId: args.procurementProjectId,
      supplierId: args.supplierId,
      supplierName: args.supplierName,
      packageId,
      originalPath,
      normalizedFilename: normalizeFilename(originalPath),
      extension: getFileExtension(file.name),
      sizeBytes: file.size,
      hash: await sha256(file),
      importedAt,
    });
  }

  const offerPackage: ProcurementOfferPackage = {
    id: packageId,
    procurementProjectId: args.procurementProjectId,
    supplierId: args.supplierId,
    supplierName: args.supplierName,
    originalRootName: documents[0]?.originalPath.split(/[\\/]/)[0],
    importedAt,
    documentCount: documents.length,
    status: 'Neverificat',
  };

  return { package: offerPackage, documents };
}
