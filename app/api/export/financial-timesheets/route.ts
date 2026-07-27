import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { markTestFilename } from '@/lib/runtime-environment';

export const runtime = 'nodejs';

const MONTH_NAMES = [
  'IANUARIE', 'FEBRUARIE', 'MARTIE', 'APRILIE', 'MAI', 'IUNIE',
  'IULIE', 'AUGUST', 'SEPTEMBRIE', 'OCTOMBRIE', 'NOIEMBRIE', 'DECEMBRIE',
];

const TIMESHEET_HEADERS = [
  'SALARIAT',
  'POZITIA DE BAZA (CONCORDIA)',
  'ORE LUCRATE CONCORDIA',
  'ORE CO CONCORDIA',
  'FUNCTIA IN PEO',
  'ORE LUCRATE PEO',
  'ORE CO PEO',
  'FUNCTIA IN GOODWORKS4ALL',
  'ORE LUCRATE GOODWORKS4ALL',
  'TOTAL ORE LUCRATE',
  'TOTAL ORE CO',
  'TOTAL ORE LUNA',
];

type ExportRow = {
  name?: string;
  role?: string;
  basePosition?: string;
  peoFunction?: string;
  goodworksFunction?: string;
  appNorm?: string;
  workbookNorm?: string;
  peoWorked?: number;
  peoLeave?: number;
  medicalLeave?: number;
  concordiaWorked?: number;
  concordiaLeave?: number;
  goodworksWorked?: number;
  totalWorked?: number;
  totalLeave?: number;
  totalMonth?: number;
  workbookPeoWorked?: number;
  peoNorm?: string;
  cimNorm?: string;
  peoRemaining?: number;
  cimRemaining?: number;
  leaveEntries?: Array<{ date?: string; type?: string; totalHours?: number; peoHours?: number; cpcHours?: number; source?: string; status?: string; automaticSplit?: boolean; justification?: string }>;
  conflicts?: Array<{ code?: string; severity?: string; message?: string }>;
};

function formatEmployeeName(name: string | undefined) {
  return (name ?? '').toLocaleUpperCase('ro-RO');
}

function buildTimesheetSheet(rows: ExportRow[], month: number, year: number) {
  const dataRows = rows.map((row) => [
    formatEmployeeName(row.name),
    row.basePosition ?? '',
    Number(row.concordiaWorked) || 0,
    Number(row.concordiaLeave) || 0,
    row.peoFunction ?? row.role ?? '',
    Number(row.peoWorked) || 0,
    Number(row.peoLeave) || 0,
    row.goodworksFunction ?? '',
    Number(row.goodworksWorked) || 0,
    null,
    null,
    null,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([
    [`${MONTH_NAMES[month]} ${year} - ALOCARE ORE SALARIATI (ACTIVITATE CURENTA SI PROIECTE)`],
    TIMESHEET_HEADERS,
    ...dataRows,
  ]);

  for (let index = 0; index < rows.length; index += 1) {
    const excelRow = index + 3;
    sheet[`J${excelRow}`] = { t: 'n', f: `C${excelRow}+F${excelRow}+I${excelRow}` };
    sheet[`K${excelRow}`] = { t: 'n', f: `D${excelRow}+G${excelRow}` };
    sheet[`L${excelRow}`] = { t: 'n', f: `J${excelRow}+K${excelRow}` };
  }

  sheet['!cols'] = [
    { wch: 18.29 }, { wch: 27.57 }, { wch: 14.57 }, { wch: 13 },
    { wch: 31 }, { wch: 12.86 }, { wch: 9.14 }, { wch: 19.43 },
    { wch: 18.57 }, { wch: 12.29 }, { wch: 10.57 }, { wch: 12.86 },
  ];
  sheet['!rows'] = [{ hpt: 19 }, { hpt: 24 }];
  sheet['!autofilter'] = { ref: `A2:L${rows.length + 2}` };
  return sheet;
}

function buildLeaveSheet(rows: ExportRow[]) {
  const centralRows = rows.flatMap((row) => {
    const leaves = row.leaveEntries?.length ? row.leaveEntries : [undefined];
    return leaves.map((leave) => ({
      Expert: row.name ?? '',
      Data: leave?.date ?? '',
      Tip: leave?.type ?? 'CO/CM istoric',
      Norma_PEO: row.peoNorm ?? row.appNorm ?? '',
      Norma_CIM: row.cimNorm ?? '',
      CO_total: Number(leave?.totalHours ?? row.totalLeave) || 0,
      CO_PEO: Number(leave?.peoHours ?? row.peoLeave) || 0,
      CO_CPC: Number(leave?.cpcHours ?? row.concordiaLeave) || 0,
      Sold_PEO: Number(row.peoRemaining) || 0,
      Sold_CIM: Number(row.cimRemaining) || 0,
      Sursa: leave?.source ?? 'ISTORIC',
      Stare: leave?.status ?? 'MIGRAT',
      Repartizare: leave?.automaticSplit === false ? 'MANUALA' : 'AUTOMATA',
      Justificare: leave?.justification ?? '',
      Conflicte: (row.conflicts ?? []).map((conflict) => conflict.message).filter(Boolean).join(' | '),
    }));
  });
  const sheet = XLSX.utils.json_to_sheet(centralRows);
  sheet['!cols'] = [{ wch: 26 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 70 }];
  return sheet;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { month?: number; year?: number; mode?: string; rows?: ExportRow[] };
    const month = Number(payload.month);
    const year = Number(payload.year);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!Number.isInteger(month) || month < 0 || month > 11 || !year || rows.length === 0) return NextResponse.json({ error: 'Lipsesc datele centralizatorului.' }, { status: 400 });

    const workbook = XLSX.utils.book_new();
    const centralSheet = payload.mode === 'leave' ? buildLeaveSheet(rows) : buildTimesheetSheet(rows, month, year);
    XLSX.utils.book_append_sheet(workbook, centralSheet, payload.mode === 'leave' ? 'Concedii' : 'Centralizator');

    const checks = rows.flatMap((row) => (row.conflicts ?? []).map((conflict) => ({
      Mediu: 'TEST', Expert: row.name ?? '', Severitate: conflict.severity ?? 'warning',
      Cod: conflict.code ?? '', Verificare: conflict.message ?? '',
    })));
    checks.unshift({
      Mediu: 'TEST', Expert: '', Severitate: 'info', Cod: 'absolute_source',
      Verificare: `Modulul Raportare este sursa de adevăr. Perioada exportată: ${String(month + 1).padStart(2, '0')}/${year}.`,
    });
    const checksSheet = XLSX.utils.json_to_sheet(checks);
    checksSheet['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 28 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, checksSheet, 'Verificări');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
    const section = payload.mode === 'leave' ? 'Concedii' : 'Pontaje';
    const filename = markTestFilename(`${section}_centralizat_${year}-${String(month + 1).padStart(2, '0')}.xlsx`);
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
