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
