'use client';

import { getUrl } from 'aws-amplify/storage';
import type { DocumentMetadata } from './types';

export async function getSecureDocumentUrl(document: Pick<DocumentMetadata, 's3Key' | 'originalFileName'>) {
  if (!document.s3Key) {
    throw new Error('Documentul nu are s3_key salvat in metadata.');
  }

  const result = await getUrl({
    path: document.s3Key,
    options: {
      expiresIn: 15 * 60,
    },
  });

  return {
    url: result.url.toString(),
    expiresAt: result.expiresAt,
    fileName: document.originalFileName,
  };
}
