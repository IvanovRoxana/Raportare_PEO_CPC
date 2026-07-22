import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { markTestFilename } from '@/lib/runtime-environment';

export const runtime = 'nodejs';

type ExportRow = {
  name?: string;
  role?: string;
  appNorm?: string;
  workbookNorm?: string;
  peoWorked?: number;
  peoLeave?: number;
  medicalLeave?: number;
  concordiaWorked?: number;
  concordiaLeave?: number;
  goodworksWorked?: number;
  totalWorked?: number;
  workbookPeoWorked?: number;
  conflicts?: Array<{ code?: string; severity?: string; message?: string }>;
};

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { month?: number; year?: number; mode?: string; rows?: ExportRow[] };
    const month = Number(payload.month);
    const year = Number(payload.year);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!month || !year || rows.length === 0) return NextResponse.json({ error: 'Lipsesc datele centralizatorului.' }, { status: 400 });

    const workbook = XLSX.utils.book_new();
    const centralSheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      Expert: row.name ?? '',
      Functie_aplicatie: row.role ?? '',
      Norma_aplicatie: row.appNorm ?? '',
      Norma_Excel: row.workbookNorm ?? '',
      Ore_PEO_raportare: Number(row.peoWorked) || 0,
      CO_PEO: Number(row.peoLeave) || 0,
      CM_PEO: Number(row.medicalLeave) || 0,
      Ore_Concordia: Number(row.concordiaWorked) || 0,
      CO_CM_Concordia: Number(row.concordiaLeave) || 0,
      Ore_GOODWORKS4ALL: Number(row.goodworksWorked) || 0,
      Total_lucrat: Number(row.totalWorked) || 0,
      Ore_PEO_Excel: row.workbookPeoWorked ?? '',
      Diferente: (row.conflicts ?? []).map((conflict) => conflict.message).filter(Boolean).join(' | '),
    })));
    centralSheet['!cols'] = [
      { wch: 26 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 },
      { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 70 },
    ];
    XLSX.utils.book_append_sheet(workbook, centralSheet, payload.mode === 'leave' ? 'Concedii' : 'Centralizator');

    const checks = rows.flatMap((row) => (row.conflicts ?? []).map((conflict) => ({
      Mediu: 'TEST', Expert: row.name ?? '', Severitate: conflict.severity ?? 'warning',
      Cod: conflict.code ?? '', Verificare: conflict.message ?? '',
    })));
    checks.unshift({
      Mediu: 'TEST', Expert: '', Severitate: 'info', Cod: 'absolute_source',
      Verificare: `Modulul Raportare este sursa de adevăr. Perioada exportată: ${String(month).padStart(2, '0')}/${year}.`,
    });
    const checksSheet = XLSX.utils.json_to_sheet(checks);
    checksSheet['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 28 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, checksSheet, 'Verificări');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
    const section = payload.mode === 'leave' ? 'Concedii' : 'Pontaje';
    const filename = markTestFilename(`${section}_centralizat_${year}-${String(month).padStart(2, '0')}.xlsx`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Exportul nu a putut fi generat.' }, { status: 500 });
  }
}
