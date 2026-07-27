import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import {
  insertWorksheetRows,
  readXlsx,
  setCell,
  setFullCalcOnLoad,
  writeXlsx,
} from '@/lib/pontaj-excel-export';
import { markTestFilename } from '@/lib/runtime-environment';

export const runtime = 'nodejs';

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'templates', 'centralizator-pontaje-template.xlsx');
const WORKSHEET_PATH = 'xl/worksheets/sheet1.xml';
const DATA_START_ROW = 3;
const TEMPLATE_LAST_DATA_ROW = 27;
const MONTH_NAMES = [
  'IANUARIE',
  'FEBRUARIE',
  'MARTIE',
  'APRILIE',
  'MAI',
  'IUNIE',
  'IULIE',
  'AUGUST',
  'SEPTEMBRIE',
  'OCTOMBRIE',
  'NOIEMBRIE',
  'DECEMBRIE',
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
  leaveEntries?: Array<{
    date?: string;
    type?: string;
    totalHours?: number;
    peoHours?: number;
    cpcHours?: number;
    source?: string;
    status?: string;
    automaticSplit?: boolean;
    justification?: string;
  }>;
  conflicts?: Array<{ code?: string; severity?: string; message?: string }>;
};

function formatEmployeeName(name: string | undefined) {
  return (name ?? '').toLocaleUpperCase('ro-RO');
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function textValue(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

async function buildTimesheetBuffer(rows: ExportRow[], month: number, year: number) {
  const templateBuffer = await readFile(TEMPLATE_PATH);
  const template = readXlsx(templateBuffer);
  let sheetXml = template.files.get(WORKSHEET_PATH)?.toString('utf8');
  if (!sheetXml) {
    throw new Error('Template-ul centralizatorului nu contine Sheet1.');
  }

  const requiredLastRow = DATA_START_ROW + rows.length - 1;
  if (requiredLastRow > TEMPLATE_LAST_DATA_ROW) {
    sheetXml = insertWorksheetRows(sheetXml, TEMPLATE_LAST_DATA_ROW + 1, requiredLastRow - TEMPLATE_LAST_DATA_ROW);
  }

  sheetXml = setCell(sheetXml, 'A1', `${MONTH_NAMES[month]} ${year} - ALOCARE ORE SALARIATI (ACTIVITATE CURENTA SI PROIECTE)`);
  for (let rowIndex = 0; rowIndex < Math.max(rows.length, TEMPLATE_LAST_DATA_ROW - DATA_START_ROW + 1); rowIndex += 1) {
    const excelRow = DATA_START_ROW + rowIndex;
    const row = rows[rowIndex];
    sheetXml = setCell(sheetXml, `A${excelRow}`, row ? formatEmployeeName(row.name) : null);
    sheetXml = setCell(sheetXml, `B${excelRow}`, row ? textValue(row.basePosition) : null);
    sheetXml = setCell(sheetXml, `C${excelRow}`, row ? numberValue(row.concordiaWorked) : null);
    sheetXml = setCell(sheetXml, `D${excelRow}`, row ? numberValue(row.concordiaLeave) : null);
    sheetXml = setCell(sheetXml, `E${excelRow}`, row ? textValue(row.peoFunction ?? row.role) : null);
    sheetXml = setCell(sheetXml, `F${excelRow}`, row ? numberValue(row.peoWorked) : null);
    sheetXml = setCell(sheetXml, `G${excelRow}`, row ? numberValue(row.peoLeave) + numberValue(row.medicalLeave) : null);
    sheetXml = setCell(sheetXml, `H${excelRow}`, row ? textValue(row.goodworksFunction) : null);
    sheetXml = setCell(sheetXml, `I${excelRow}`, row ? numberValue(row.goodworksWorked) : null);
    sheetXml = setCell(sheetXml, `J${excelRow}`, row ? { formula: `C${excelRow}+F${excelRow}+I${excelRow}` } : null);
    sheetXml = setCell(sheetXml, `K${excelRow}`, row ? { formula: `D${excelRow}+G${excelRow}` } : null);
    sheetXml = setCell(sheetXml, `L${excelRow}`, row ? { formula: `J${excelRow}+K${excelRow}` } : null);
  }

  template.files.set(WORKSHEET_PATH, Buffer.from(updateWorksheetDimension(sheetXml, requiredLastRow), 'utf8'));
  const workbookXml = template.files.get('xl/workbook.xml')?.toString('utf8');
  if (workbookXml) {
    template.files.set('xl/workbook.xml', Buffer.from(setFullCalcOnLoad(workbookXml), 'utf8'));
  }
  return writeXlsx(template.entries, template.files);
}

function updateWorksheetDimension(sheetXml: string, lastRow: number) {
  const ref = `A1:L${Math.max(lastRow, TEMPLATE_LAST_DATA_ROW)}`;
  if (sheetXml.includes('<dimension')) {
    return sheetXml.replace(/<dimension\b[^>]*\/>/, `<dimension ref="${ref}"/>`);
  }
  return sheetXml.replace('<sheetViews>', `<dimension ref="${ref}"/><sheetViews>`);
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

function buildLeaveWorkbook(rows: ExportRow[], month: number, year: number) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildLeaveSheet(rows), 'Concedii');
  appendChecksSheet(workbook, rows, month, year);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

function appendChecksSheet(workbook: XLSX.WorkBook, rows: ExportRow[], month: number, year: number) {
  const checks = rows.flatMap((row) => (row.conflicts ?? []).map((conflict) => ({
    Mediu: 'TEST',
    Expert: row.name ?? '',
    Severitate: conflict.severity ?? 'warning',
    Cod: conflict.code ?? '',
    Verificare: conflict.message ?? '',
  })));
  checks.unshift({
    Mediu: 'TEST',
    Expert: '',
    Severitate: 'info',
    Cod: 'absolute_source',
    Verificare: `Modulul Raportare este sursa de adevar. Perioada exportata: ${String(month + 1).padStart(2, '0')}/${year}.`,
  });
  const checksSheet = XLSX.utils.json_to_sheet(checks);
  checksSheet['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 14 }, { wch: 28 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, checksSheet, 'Verificari');
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { month?: number; year?: number; mode?: string; rows?: ExportRow[] };
    const month = Number(payload.month);
    const year = Number(payload.year);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!Number.isInteger(month) || month < 0 || month > 11 || !year || rows.length === 0) {
      return NextResponse.json({ error: 'Lipsesc datele centralizatorului.' }, { status: 400 });
    }

    const isLeave = payload.mode === 'leave';
    const buffer = isLeave
      ? buildLeaveWorkbook(rows, month, year)
      : await buildTimesheetBuffer(rows, month, year);
    const section = isLeave ? 'Concedii' : 'Pontaje';
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
