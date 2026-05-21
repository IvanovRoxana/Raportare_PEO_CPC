import { NextResponse } from 'next/server';
import { generatePontajExcel, type ExportPayload } from '@/lib/pontaj-excel-export';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/expert?export=pontaj', getRequestOrigin(request)), {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  const host = request.headers.get('host');
  if (host && !host.startsWith('localhost')) return `https://${host}`;

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ExportPayload;
    const workbook = await generatePontajExcel(payload);

    return new NextResponse(new Uint8Array(workbook.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(workbook.filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Exportul pontajului a esuat.',
      },
      { status: 400 },
    );
  }
}
