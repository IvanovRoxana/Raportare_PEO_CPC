import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { generatePontajExcel } from '../lib/pontaj-excel-export.ts';
import { buildPontajExportPayload } from '../lib/pontaj-export-payload.ts';

describe('export pontaj Excel', () => {
  it('pastreaza instructiunile PM/Admin in payload-ul exportului', () => {
    const payload = buildPontajExportPayload({
      kind: 'peo',
      month: 5,
      year: 2026,
      expert: {
        id: 'expert-instructions',
        name: 'Expert Instructiuni',
        role: 'Expert PEO',
        norma: 8,
        expertExperienceCategory: '< 5 ani',
        aiReportingInstructions: 'Exporta pontajul pe zile si pastreaza formatul template-ului.',
        hourlyRate: 135.75,
      },
      activities: [],
    });

    assert.equal(
      payload.expert.aiReportingInstructions,
      'Exporta pontajul pe zile si pastreaza formatul template-ului.',
    );
    assert.equal(payload.expert.expertExperienceCategory, '< 5 ani');
    assert.equal(payload.expert.hourlyRate, 135.75);
  });

  it('trimite separat norma PEO si plafonul CIM pentru exportul pontajului', async () => {
    const payload = buildPontajExportPayload({
      kind: 'peo',
      month: 5,
      year: 2026,
      expert: {
        id: 'gabriel-zvinca',
        name: 'Gabriel Zvinca',
        role: 'Responsabil Afaceri Publice',
        norma: 4,
        oreZi: 4,
        dailyHours: 4,
      },
      activities: [
        {
          id: 'activity-partial',
          expertId: 'gabriel-zvinca',
          date: '2026-06-02',
          hours: 3,
          activityType: 'A3',
          saCode: 'SA3.4',
          title: 'Activitate partiala',
          status: 'approved',
        },
      ],
    });

    assert.equal(payload.expert.oreZi, 4);
    assert.equal(payload.expert.dailyHours, 4);
    assert.equal(payload.expert.norma, 8);

    const workbook = await generatePontajExcel(payload);
    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'H15'), /<v>3<\/v>/);
    assert.match(cellXml(sheet, 'I15'), /<v>5<\/v>/);
  });

  it('exporturile PM trimit concediile financiare in payload-ul pontajului', () => {
    const pmPage = readFileSync(new URL('../app/pm/page.tsx', import.meta.url), 'utf8');
    const dossierModal = readFileSync(new URL('../components/pm/dosar-expert-modal.tsx', import.meta.url), 'utf8');

    assert.match(pmPage, /useLeaveEntries\(selectedMonth,\s*selectedYear\)/);
    assert.match(pmPage, /leaveEntries:\s*expertLeaveEntries/);
    assert.match(pmPage, /leaveEntries=\{allLeaveEntries\.filter/);
    assert.match(dossierModal, /leaveEntries = \[\]/);
    assert.match(dossierModal, /leaveEntries,/);
  });

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

    assert.match(cellXml(sheet, 'F16'), /SUMIFS\(\$E\$49:\$E\$\d+,\$A\$49:\$A\$\d+,&quot;=&quot;&amp;DATE\(2026,5,F13\)\)/);
    assert.match(cellXml(sheet, 'E53'), /<v>2<\/v>/);
    assert.match(cellXml(sheet, 'F53'), /Linie GOODWORKS4ALL/);
    assert.match(cellXml(sheet, 'AG53'), /Livrabil GW/);
    assert.equal(cellXml(sheet, 'F59'), '<c r="F59" s="529"/>');
    assert.match(cellXml(sheet, 'AG16'), /SUM\(B16:AF16\)\+COUNTIF\(B16:AF16,&quot;DE&quot;\)\*2/);
    assert.doesNotMatch(cellXml(sheet, 'AG16'), /<v>/);
    assert.match(cellXml(sheet, 'AG18'), /SUM\(AG15:AG17\)/);
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
      expert: { id: 'expert-2', name: 'Simona Khamissi', role: 'Expert Protectia Datelor', category: 'Expert', oreZi: 8, saCodes: ['SA1.1'], hourlyRate: 123.45 },
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
    assert.match(cellXml(sheet, 'D78'), /SA1\.1 Informare, recrutare, selectie GT/);
    assert.match(cellXml(sheet, 'AK78'), /<v>123.45<\/v>/);
    assert.match(cellXml(sheet, 'AL78'), /<v>4<\/v>/);
    assert.match(cellXml(sheet, 'AO78'), /<v>46163<\/v>/);
    assert.match(cellXml(sheet, 'AP78'), /LEFT\(D78,6\)/);
    assert.match(cellXml(sheet, 'AG16'), /SUM\(B16:AF16\)\+COUNTIF\(B16:AF16,&quot;DE&quot;\)\*8/);
    assert.doesNotMatch(cellXml(sheet, 'AG16'), /<v>71<\/v>/);
    assert.match(cellXml(sheet, 'AG17'), /SUM\(AG15:AG16\)/);
  });

  it('pastreaza CO in timesheet si totalizeaza orele de concediu separat', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-co', name: 'Expert CO', role: 'Expert GT', category: 'Expert', oreZi: 8, saCodes: ['SA1.1'] },
      activities: [
        { date: '2026-05-21', hours: 8, activityType: 'Activitate PEO', saCode: 'SA1.1', status: 'approved' },
        { date: '2026-05-22', hours: 0, activityType: 'CO - Concediu odihna', title: 'CO - Concediu odihna', dayType: 'CO', saCode: 'SA1.1', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'W16'), /CO/);
    assert.match(cellXml(sheet, 'W15'), /^<c r="W15"[^/]*\/>$/);
    assert.match(cellXml(sheet, 'AG16'), /COUNTIF\(B16:AF16,&quot;DE&quot;\)\*8/);
    assert.match(cellXml(sheet, 'AI16'), /COUNTIF\(B16:AF16,&quot;CO&quot;\)\*8/);
    assert.match(cellXml(sheet, 'AL79'), /CO/);
    assert.match(cellXml(sheet, 'AM79'), /<v>0<\/v>/);
  });

  it('scrie CO si in alte activitati cand concediul financiar acopera PEO si CPC', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-co-cpc', name: 'Expert CO CPC', role: 'Expert GT', category: 'Expert', oreZi: 6, norma: 8, saCodes: ['SA1.1'] },
      activities: [
        { date: '2026-05-22', hours: 0, activityType: 'CO - Concediu odihna', title: 'CO - Concediu odihna', dayType: 'CO', saCode: 'SA1.1', status: 'approved' },
      ],
      concurrentProjects: [
        { id: 'cpc-project', expertId: 'expert-co-cpc', projectName: 'CPC', dailyHours: 2, startDate: '2026-05-01', isActive: true },
      ],
      concurrentTimesheetEntries: [
        {
          id: 'cpc-co',
          concurrentProjectId: 'cpc-project',
          expertId: 'expert-co-cpc',
          date: '2026-05-22',
          month: 4,
          year: 2026,
          hours: 2,
          dayType: 'CO',
          status: 'verified',
          source: 'import',
        },
      ],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'W15'), /CO/);
    assert.match(cellXml(sheet, 'W16'), /CO/);
    assert.match(cellXml(sheet, 'AI15'), /COUNTIF\(B15:AF15,&quot;CO&quot;\)\*2/);
    assert.match(cellXml(sheet, 'AI16'), /COUNTIF\(B16:AF16,&quot;CO&quot;\)\*6/);
    assert.match(cellXml(sheet, 'AL79'), /CO/);
    assert.match(cellXml(sheet, 'AM79'), /CO/);
  });

  it('scrie CO in Pontaj_PEO simplu pentru ca formula lunara sa il totalizeze', async () => {
    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 4,
      year: 2026,
      expert: { id: 'expert-co', name: 'Expert CO', role: 'Expert GT', category: 'Expert', oreZi: 8, norma: 8, saCodes: ['SA1.1'], hourlyRate: 99 },
      activities: [
        { date: '2026-05-22', hours: 0, activityType: 'CO - Concediu odihna', title: 'CO - Concediu odihna', dayType: 'CO', saCode: 'SA1.1', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'H35'), /CO/);
    assert.match(cellXml(sheet, 'I35'), /<v>0<\/v>/);
    assert.match(cellXml(sheet, 'G35'), /<v>99<\/v>/);
    assert.match(cellXml(sheet, 'H45'), /<v>8<\/v>/);
  });

  it('foloseste split-ul CO validat financiar in Pontaj_PEO simplu', async () => {
    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 4,
      year: 2026,
      expert: { id: 'expert-co-financial', name: 'Expert CO Financiar', role: 'Expert GT', category: 'Expert', oreZi: 6, norma: 8, saCodes: ['SA1.1'] },
      activities: [
        { id: 'leave-entry:leave-fin-1', date: '2026-05-22', hours: 6, activityType: 'CO - Concediu odihna', title: 'CO (6 h PEO + 2 h CPC)', dayType: 'CO', saCode: 'SA1.1', status: 'draft' },
      ],
      leaveEntries: [
        {
          id: 'leave-fin-1',
          expertId: 'expert-co-financial',
          date: '2026-05-22',
          month: 4,
          year: 2026,
          type: 'CO',
          totalHours: 8,
          peoHours: 4,
          cpcHours: 4,
          source: 'FINANCIAL',
          status: 'DRAFT',
          lockedForExpert: true,
        },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'H35'), /CO/);
    assert.match(cellXml(sheet, 'I35'), /CO/);
    assert.match(cellXml(sheet, 'H45'), /<v>4<\/v>/);
    assert.match(cellXml(sheet, 'I45'), /<v>156<\/v>/);
  });

  it('blocheaza exportul cand CO introdus de expert nu este validat financiar', async () => {
    await assert.rejects(
      () =>
        generatePontajExcel({
          kind: 'peo',
          month: 4,
          year: 2026,
          expert: { id: 'expert-co-draft', name: 'Expert CO Draft', role: 'Expert GT', category: 'Expert', oreZi: 6, norma: 8, saCodes: ['SA1.1'] },
          activities: [
            { id: 'leave-entry:leave-draft-1', date: '2026-05-22', hours: 6, activityType: 'CO - Concediu odihna', title: 'CO draft', dayType: 'CO', saCode: 'SA1.1', status: 'draft' },
          ],
          leaveEntries: [
            {
              id: 'leave-draft-1',
              expertId: 'expert-co-draft',
              date: '2026-05-22',
              month: 4,
              year: 2026,
              type: 'CO',
              totalHours: 8,
              peoHours: 6,
              cpcHours: 2,
              source: 'EXPERT',
              status: 'DRAFT',
              lockedForExpert: false,
            },
          ],
          concurrentProjects: [],
          concurrentTimesheetEntries: [],
        }),
      /CO introdus de expert, dar nevalidat de Financiar/,
    );
  });

  it('scrie CO in alte activitati in Pontaj_PEO simplu cand exista CO CPC financiar', async () => {
    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 4,
      year: 2026,
      expert: { id: 'expert-co-cpc', name: 'Expert CO CPC', role: 'Expert GT', category: 'Expert', oreZi: 6, norma: 8, saCodes: ['SA1.1'] },
      activities: [
        { date: '2026-05-22', hours: 0, activityType: 'CO - Concediu odihna', title: 'CO - Concediu odihna', dayType: 'CO', saCode: 'SA1.1', status: 'approved' },
      ],
      concurrentProjects: [
        { id: 'cpc-project', expertId: 'expert-co-cpc', projectName: 'CPC', dailyHours: 2, startDate: '2026-05-01', isActive: true },
      ],
      concurrentTimesheetEntries: [
        {
          id: 'cpc-co',
          concurrentProjectId: 'cpc-project',
          expertId: 'expert-co-cpc',
          date: '2026-05-22',
          month: 4,
          year: 2026,
          hours: 2,
          dayType: 'CO',
          status: 'verified',
          source: 'import',
        },
      ],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'H35'), /CO/);
    assert.match(cellXml(sheet, 'I35'), /CO/);
    assert.match(cellXml(sheet, 'H45'), /<v>6<\/v>/);
    assert.match(cellXml(sheet, 'I45'), /<v>154<\/v>/);
  });

  it('calculeaza alte activitati ca norma CIM minus orele PEO pontate in zi', async () => {
    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 5,
      year: 2026,
      expert: { id: 'expert-partial', name: 'Expert Partial', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA3.4'] },
      activities: [
        { date: '2026-06-02', hours: 3, activityType: 'Activitate partiala', saCode: 'SA3.4', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'H15'), /<v>3<\/v>/);
    assert.match(cellXml(sheet, 'I15'), /<v>5<\/v>/);
  });

  it('agrega Pontaj_PEO simplu pe zile fara sa extinda template-ul cu randuri pe activitate', async () => {
    const workingDays = ['02', '03', '04', '05', '08', '09', '10', '11'];
    const activities = Array.from({ length: 24 }, (_item, index) => ({
      date: `2026-06-${workingDays[Math.floor(index / 3)]}`,
      hours: index % 3 === 0 ? 2 : 3,
      activityType: 'Activitate comunicare',
      saCode: index % 4 === 0 ? 'SA3.3' : 'SA3.4',
      status: 'approved' as const,
    }));

    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 5,
      year: 2026,
      expert: { id: 'expert-dense', name: 'Expert Dense', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA3.3', 'SA3.4'] },
      activities,
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');
    const sharedStrings = readSharedStrings(files);

    assert.match(cellXml(sheet, 'A44'), /NR\. TOTAL DE ORE/);
    assert.match(cellText(sheet, 'A45', sharedStrings), /Subsemnatul declar/);
    assert.equal(cellText(sheet, 'A47', sharedStrings), 'Numele expertului:');
    assert.equal(cellText(sheet, 'A48', sharedStrings), 'Semnătură:');
    assert.equal(cellText(sheet, 'A49', sharedStrings), 'Data:');
    assert.match(cellXml(sheet, 'D49'), /<v>\d+<\/v>/);
    assert.equal(cellText(sheet, 'A51', sharedStrings), 'Numele managerului de proiect:');
    assert.equal(cellText(sheet, 'D51', sharedStrings), 'MIHAELA GRIGORAS');
    assert.equal(cellText(sheet, 'A52', sharedStrings), 'Semnătură:');
    assert.equal(cellText(sheet, 'A53', sharedStrings), 'Data:');
    assert.match(cellXml(sheet, 'D53'), /<v>\d+<\/v>/);
    assert.match(cellXml(sheet, 'H15'), /<v>8<\/v>/);
    assert.match(cellXml(sheet, 'H16'), /<v>8<\/v>/);
    assert.match(cellXml(sheet, 'D15'), /SA3\.3 Realizarea unor campanii/);
    assert.match(cellXml(sheet, 'D15'), /SA3\.4 Dezvoltarea si derularea/);
    assert.match(cellXml(sheet, 'H44'), /<v>64<\/v>/);
    assert.equal(cellXml(sheet, 'A54'), '');
  });

  it('genereaza Pontaj_PEO valid pentru lunile cu 31 de zile', async () => {
    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 6,
      year: 2026,
      expert: { id: 'expert-july', name: 'Expert Iulie', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA3.4'] },
      activities: [
        { date: '2026-07-31', hours: 6, activityType: 'Activitate finala', saCode: 'SA3.4', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');
    const rowRefs = [...sheet.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((match) => match[1]);

    assert.equal(new Set(rowRefs).size, rowRefs.length);
    assert.ok(rowRefs.includes('54'));
    assert.match(cellXml(sheet, 'A44'), /<v>46234<\/v>/);
    assert.match(cellXml(sheet, 'H44'), /<v>6<\/v>/);
    assert.match(cellXml(sheet, 'A45'), /NR\. TOTAL DE ORE/);
    assert.match(cellXml(sheet, 'D50'), /<v>46234<\/v>/);
    assert.match(cellXml(sheet, 'D54'), /<v>46234<\/v>/);
    assert.doesNotMatch(rowXml(sheet, '45'), /\br="A46"/);
  });

  it('completeaza metadatele PEO din profil si data finala din ultima zi lucrata', async () => {
    const workbook = await generatePontajExcel({
      kind: 'peo',
      month: 4,
      year: 2026,
      expert: {
        id: 'expert-profile',
        name: 'Expert Profil',
        role: 'Rol fallback',
        category: 'com',
        norma: 8,
        oreZi: 4,
        positionInProject: 'Responsabil Informare si Comunicare',
        expertExperienceCategory: '< 5 ani',
        beneficiary: 'Organizatie Beneficiar Test',
        hourlyRate: 77.5,
        saCodes: ['SA1.1'],
      },
      activities: [
        { date: '2026-05-21', hours: 4, activityType: 'Activitate PEO', saCode: 'SA1.1', status: 'approved' },
        { date: '2026-05-29', hours: 2, activityType: 'Activitate PEO finala', saCode: 'SA1.1', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet1.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'G9'), /Responsabil Informare si Comunicare/);
    assert.match(cellXml(sheet, 'G10'), /&lt; 5 ani/);
    assert.match(cellXml(sheet, 'G11'), /Organizatie Beneficiar Test/);
    assert.match(cellXml(sheet, 'G34'), /<v>77.5<\/v>/);
    assert.match(cellXml(sheet, 'I34'), /<v>4<\/v>/);
    assert.match(cellXml(sheet, 'D50'), /<v>46171<\/v>/);
  });

  it('exporta descrierea extinsa a evenimentului in detaliile PEO consolidate', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-event', name: 'Expert Event', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA3.4'] },
      activities: [
        {
          date: '2026-05-21',
          hours: 6,
          activityType: 'Eveniment membri',
          saCode: 'SA3.4',
          description: 'Participare eveniment',
          eventDurationHours: 2,
          eventExtendedDescription: 'Pregatire, follow-up si centralizare materiale eveniment.',
          status: 'approved',
        },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'AN78'), /Participare eveniment/);
    assert.match(cellXml(sheet, 'AN78'), /Pregatire, follow-up si centralizare materiale eveniment/);
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
    assert.match(cellXml(sheet, 'D79'), /SA2\.1 Realizarea de analize cu privire la tendintele manifestate la nivel national/);
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

  it('foloseste denumirea oficiala a subactivitatii, nu titlul activitatii selectate', async () => {
    const workbook = await generatePontajExcel({
      kind: 'consolidated',
      month: 4,
      year: 2026,
      expert: { id: 'expert-5', name: 'Expert GT', role: 'Expert PEO', category: 'Expert', oreZi: 8, saCodes: ['SA1.1'] },
      activities: [
        { date: '2026-05-21', hours: 2, activityType: 'Monitorizare GT — entitati', saCode: 'SA1.1', status: 'approved' },
      ],
      concurrentProjects: [],
      concurrentTimesheetEntries: [],
    });

    const files = readXlsx(workbook.buffer);
    const sheet = files.get('xl/worksheets/sheet5.xml')!.toString('utf8');

    assert.match(cellXml(sheet, 'D78'), /SA1\.1 Informare, recrutare, selectie GT/);
    assert.doesNotMatch(cellXml(sheet, 'D78'), /Monitorizare GT/);
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

function rowXml(xml: string, ref: string) {
  return xml.match(new RegExp(`<row\\b(?=[^>]*\\br="${ref}")[^>]*>[\\s\\S]*?</row>`))?.[0] ?? '';
}

function readSharedStrings(files: Map<string, Buffer>) {
  const xml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  );
}

function cellText(xml: string, ref: string, sharedStrings: string[]) {
  const cell = cellXml(xml, ref);
  const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
  if (/\bt="s"/.test(cell)) return sharedStrings[Number(value)] ?? '';
  return value;
}
