import { NextResponse } from 'next/server';
import { z } from 'zod';
import { detectEmbeddedSignature } from '@/lib/procurement-evaluation/signature-detection';
import type { QualifiedSignatureStatus } from '@/lib/procurement-evaluation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  filename: z.string(),
  mimeType: z.string().optional(),
  contentBase64: z.string(),
});

function normalizeProviderStatus(data: unknown): QualifiedSignatureStatus {
  if (!data || typeof data !== 'object') return 'review';
  const record = data as Record<string, unknown>;
  const status = String(record.status ?? record.qualifiedSignatureStatus ?? '').toLowerCase();
  const valid = record.valid === true || status === 'valid' || status === 'qualified_valid';
  const invalid = record.valid === false || status === 'invalid' || status === 'qualified_invalid';
  if (valid) return 'valid';
  if (invalid) return 'invalid';
  return 'review';
}

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());
    const bytes = Uint8Array.from(Buffer.from(body.contentBase64, 'base64'));
    const local = detectEmbeddedSignature(bytes, body.filename);
    const providerUrl = process.env.QUALIFIED_SIGNATURE_VALIDATION_URL;
    const providerName = process.env.QUALIFIED_SIGNATURE_VALIDATION_PROVIDER || (providerUrl ? 'configured-provider' : 'local-detection');

    if (!local.signaturePresent) {
      return NextResponse.json({
        signaturePresent: false,
        qualifiedSignatureStatus: 'not_signed',
        provider: providerName,
        validatedAt: new Date().toISOString(),
        notes: local.notes,
        markers: local.markers,
      });
    }

    if (!providerUrl) {
      return NextResponse.json({
        signaturePresent: true,
        qualifiedSignatureStatus: 'not_configured',
        provider: providerName,
        validatedAt: new Date().toISOString(),
        notes: 'Semnătură detectată, dar nu este configurat un serviciu de validare calificată.',
        markers: local.markers,
      });
    }

    const providerResponse = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.QUALIFIED_SIGNATURE_VALIDATION_API_KEY
          ? { Authorization: `Bearer ${process.env.QUALIFIED_SIGNATURE_VALIDATION_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        filename: body.filename,
        mimeType: body.mimeType,
        contentBase64: body.contentBase64,
        localMarkers: local.markers,
      }),
    });

    if (!providerResponse.ok) {
      return NextResponse.json({
        signaturePresent: true,
        qualifiedSignatureStatus: 'review',
        provider: providerName,
        validatedAt: new Date().toISOString(),
        notes: `Providerul de validare a răspuns cu HTTP ${providerResponse.status}; necesită review.`,
        markers: local.markers,
      });
    }

    const providerData = await providerResponse.json();
    return NextResponse.json({
      signaturePresent: true,
      qualifiedSignatureStatus: normalizeProviderStatus(providerData),
      provider: providerName,
      validatedAt: new Date().toISOString(),
      notes: typeof providerData.summary === 'string' ? providerData.summary : 'Răspuns provider primit și normalizat.',
      markers: local.markers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Signature validation failed.',
        qualifiedSignatureStatus: 'review',
      },
      { status: 400 },
    );
  }
}
