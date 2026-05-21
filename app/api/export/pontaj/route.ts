import { NextResponse } from 'next/server';
import { generatePontajExcel, type ExportPayload } from '@/lib/pontaj-excel-export';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return NextResponse.redirect(new URL('/expert?export=pontaj', request.url), {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
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
