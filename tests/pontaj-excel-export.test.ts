import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { generatePontajExcel } from '../lib/pontaj-excel-export.ts';

describe('export pontaj Excel', () => {
  it('pastreaza formulele GOODWORKS4ALL si curata valorile ramase din template', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-1', name: 'Expert Test', role: 'Expert PEO', category: 'Expert', oreZi: 8 },
      activities: [
        {
          date: '2026-05-04',
          hours: 4,
          activityType: 'A3',
          saCode: 'SA3.4',
          title: 'Activitate PEO',
          description: 'Descriere PEO',
          status: 'approved',
        },
      ],
      concurrentProjects: [
        {
          id: 'gw',
          projectName: 'GOODWORKS4ALL',
          projectCode: 'GW4ALL',
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          dailyHours: 2,
          isActive: true,
        },
      ],
      concurrentTimesheetEntries: [
        {
          id: 'gw-1',
          concurrentProjectId: 'gw',
          expertId: 'expert-1',
          date: '2026-05-05',
          month: 4,
          year: 2026,
          wp: 'WP1',
          hours: 2,
          taskName: 'Linie GOODWORKS4ALL',
          relevantDeliverable: 'Livrabil GW',
          dayType: 'lucratoare',
          status: 'draft',
          source: 'expert_manual',
        },
      ],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'B16'), /TRANSPOSE\(IF\(E49:E79="","",E49:E79\)\)/);
    assert.match(cellXml(sheet, 'E53'), /<v>2<\/v>/);
    assert.match(cellXml(sheet, 'F53'), /Linie GOODWORKS4ALL/);
    assert.match(cellXml(sheet, 'AG53'), /Livrabil GW/);
    assert.equal(cellXml(sheet, 'F59'), '<c r="F59" s="529"/>');
  });

  it('opreste exportul daca proiectele paralele au ore in zile nelucratoare', async () => {
    await assert.rejects(
      () =>
        generatePontajExcel({
          kind: 'consolidated',
          month: 4,
          year: 2026,
          expert: { id: 'expert-1', name: 'Expert Test', role: 'Expert PEO', category: 'Expert', oreZi: 8 },
          activities: [],
          concurrentProjects: [{ id: 'gw', projectName: 'GOODWORKS4ALL', projectCode: 'GW4ALL', dailyHours: 2, startDate: '2026-05-01', isActive: true }],
          concurrentTimesheetEntries: [{ concurrentProjectId: 'gw', expertId: 'expert-1', date: '2026-05-01', month: 4, year: 2026, hours: 2 }],
        }),
      /proiecte paralele pontate in zile nelucratoare/,
    );
  });

  it('foloseste template-ul fara GOODWORKS4ALL si exporta detaliile PEO pe activitate', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-2', name: 'Simona Khamissi', role: 'Expert Protectia Datelor', category: 'Expert', oreZi: 8, saCodes: ['SA1.1'] },
      activities: [
        {
          date: '2026-05-21',
          hours: 4,
          activityType: 'Informare, recrutare, selectie grup tinta',
          saCode: 'SA1.1',
          title: 'Titlu ignorat cand exista activityType',
          description: 'Activitate PEO pe 21 mai',
          status: 'approved',
        },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'A16'), /PEO_Expert Protectia Datelor/);
    assert.doesNotMatch(cellXml(sheet, 'A16'), /GOODWORKS4ALL/);
    assert.match(cellXml(sheet, 'V16'), /\$AL\$58:\$AL\$88/);
    assert.match(cellXml(sheet, 'B78'), /A1/);
    assert.match(cellXml(sheet, 'D78'), /SA1\.1 Informare, recrutare, selectie grup tinta/);
    assert.match(cellXml(sheet, 'AL78'), /<v>4<\/v>/);
    assert.match(cellXml(sheet, 'AO78'), /<v>46163<\/v>/);
    assert.match(cellXml(sheet, 'AP78'), /LEFT\(D78,6\)/);
  });

  it('adauga rand separat cand exista mai multe activitati PEO in aceeasi zi', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-3', name: 'Expert Test', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA1.1', 'SA2.1'] },
      activities: [
        { date: '2026-05-21', hours: 2, activityType: 'Activitate unu', saCode: 'SA1.1', description: 'Prima activitate', status: 'approved' },
        { date: '2026-05-21', hours: 2, activityType: 'Activitate doi', saCode: 'SA2.1', description: 'A doua activitate', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'V16'), /\$AL\$58:\$AL\$89/);
    assert.match(cellXml(sheet, 'A78'), /<v>46163<\/v>/);
    assert.match(cellXml(sheet, 'A79'), /<v>46163<\/v>/);
    assert.match(cellXml(sheet, 'B78'), /A1/);
    assert.match(cellXml(sheet, 'B79'), /A2/);
    assert.match(cellXml(sheet, 'D79'), /SA2\.1 Activitate doi/);
    assert.match(cellXml(sheet, 'AL78'), /<v>2<\/v>/);
    assert.match(cellXml(sheet, 'AL79'), /<v>2<\/v>/);
    assert.match(cellXml(sheet, 'AM79'), /COUNTIF\(AO:AO,A79\)/);
  });

  it('completeaza Nr activitate doar din mappingul oficial pentru SA-uri eligibile expertului', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-4', name: 'Expert Test', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA3.2'] },
      activities: [
        { date: '2026-05-21', hours: 2, activityType: 'Activitate eligibila', saCode: 'SA 3.2', status: 'approved' },
        { date: '2026-05-22', hours: 2, activityType: 'Activitate neeligibila', saCode: 'SA5.1', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'B78'), /A3/);
    assert.doesNotMatch(cellXml(sheet, 'B79'), /A5|Activitate neeligibila/);
    assert.match(cellXml(sheet, 'D79'), /SA5\.1 Activitate neeligibila/);
  });
});

function readXlsx(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  const eocd = findEocd(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataOffset, dataOffset + compressedSize);
    entries.set(name, method === 8 ? Buffer.from(inflateRawSync(data)) : Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEocd(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('EOCD lipsa');
}

function cellXml(xml: string, ref: string) {
  return xml.match(new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*?(?:/>|>[\\s\\S]*?</c>)`))?.[0] ?? '';
}
