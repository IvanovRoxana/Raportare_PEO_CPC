import { detectEmbeddedSignature } from './signature-detection.ts';
import type { QualifiedSignatureStatus } from './types.ts';

export type QualifiedSignatureValidationResult = {
  signaturePresent: boolean;
  qualifiedSignatureStatus: QualifiedSignatureStatus;
  provider?: string;
  validatedAt: string;
  notes: string;
  markers: string[];
};

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export async function validateQualifiedSignatureFile(file: File): Promise<QualifiedSignatureValidationResult> {
  const buffer = await file.arrayBuffer();
  const local = detectEmbeddedSignature(new Uint8Array(buffer), file.name);

  try {
    const response = await fetch('/api/procurement/signature/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: arrayBufferToBase64(buffer),
      }),
    });

    if (!response.ok) throw new Error('Signature validation endpoint failed.');
    return await response.json();
  } catch {
    return {
      signaturePresent: local.signaturePresent,
      qualifiedSignatureStatus: local.status,
      provider: 'local-detection',
      validatedAt: new Date().toISOString(),
      notes: local.notes,
      markers: local.markers,
    };
  }
}
