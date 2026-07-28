import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildOpisRows, buildOpisXlsxBuffer } from '../lib/opis-xls-export.ts';
import type { Activity, Expert } from '../lib/types.ts';

const expert = {
  id: 'e1',
  name: 'Expert Test',
  role: 'Expert',
  category: 'gt',
  isActive: true,
} as Expert;

const activities = [{
  id: 'a1',
  expertId: 'e1',
  expertName: 'Expert Test',
  date: '2026-07-10',
  title: 'Analiza livrabile',
  activityType: 'Analiza',
  hours: 4,
  saCode: 'SA1.1',
  deliverables: [{
    id: 'd1',
    fileName: 'nume-generat.pdf',
    originalFileName: 'Proces verbal incarcat.pdf',
    fileType: 'application/pdf',
    fileSize: 100,
    declaredTitle: 'Titlul primei pagini',
    titleCheckStatus: 'mismatch',
  }],
}] as Activity[];

test('OPIS XLS foloseste denumirea fisierului incarcat ca valoare principala', () => {
  const rows = buildOpisRows({ experts: [expert], activities, month: 6, year: 2026 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Denumire fisier incarcat'], 'Proces verbal incarcat.pdf');
  assert.equal(rows[0]['Titlu activitate'], 'Analiza livrabile');
});

test('OPIS XLS genereaza workbook valid cu randurile livrabilelor', () => {
  const buffer = buildOpisXlsxBuffer({ experts: [expert], activities, month: 6, year: 2026 });
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets['OPIS livrabile'];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

  assert.ok(sheet);
  assert.equal(rows[0]['Expert'], 'Expert Test');
  assert.equal(rows[0]['Denumire fisier incarcat'], 'Proces verbal incarcat.pdf');
});
