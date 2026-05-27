import type { QualifiedSignatureStatus } from './types.ts';

export type LocalSignatureDetection = {
  signaturePresent: boolean;
  markers: string[];
  status: QualifiedSignatureStatus;
  notes: string;
};

function bytesToSearchableText(bytes: Uint8Array) {
  const maxBytes = Math.min(bytes.byteLength, 2_000_000);
  let output = '';
  for (let index = 0; index < maxBytes; index += 8192) {
    const chunk = bytes.slice(index, Math.min(index + 8192, maxBytes));
    output += String.fromCharCode(...chunk);
  }
  return output;
}

export function detectEmbeddedSignature(bytes: Uint8Array, filename = ''): LocalSignatureDetection {
  const text = bytesToSearchableText(bytes);
  const lowerFilename = filename.toLowerCase();
  const markers = [
    ['/ByteRange', 'pdf-byte-range'],
    ['/Sig', 'pdf-signature-object'],
    ['adbe.pkcs7', 'pdf-pkcs7'],
    ['ETSI.CAdES', 'pdf-cades'],
    ['_xmlsignatures/', 'office-xml-signature'],
    ['origin.sigs', 'office-origin-signature'],
    ['META-INF/signatures', 'odf-signature'],
  ]
    .filter(([needle]) => text.includes(needle))
    .map(([, marker]) => marker);

  const detachedSignature = /\.(p7s|p7m|p12|pfx|asice|sce)$/i.test(lowerFilename);
  if (detachedSignature) markers.push('detached-signature-file');

  const signaturePresent = markers.length > 0;
  return {
    signaturePresent,
    markers,
    status: signaturePresent ? 'review' : 'not_signed',
    notes: signaturePresent
      ? 'Semnătură detectată local; validarea calificată cere provider extern configurat.'
      : 'Nu au fost detectați markeri locali de semnătură integrată.',
  };
}
