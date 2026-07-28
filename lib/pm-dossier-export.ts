import { getMonthName } from './app-utils.ts';
import { getUploadedDeliverableFileName } from './opis-xls-export.ts';
import type { Activity, Expert, Neconformitate, PmClarificationThread, ReportStatus } from './types.ts';

function escapePdfText(value: string) {
  return value.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]+/g, ' ');
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '_');
}

function buildLines({
  expert,
  activities,
  neconformitati,
  clarifications,
  month,
  year,
  reportStatus,
}: {
  expert: Expert;
  activities: Activity[];
  neconformitati: Neconformitate[];
  clarifications: PmClarificationThread[];
  month: number;
  year: number;
  reportStatus?: ReportStatus | null;
}) {
  const lines = [
    `Dosar expert: ${expert.name}`,
    `Perioada: ${getMonthName(month)} ${year}`,
    `Status PM: ${reportStatus?.status || 'draft'}`,
    `Activitati: ${activities.length}`,
    `Ore: ${activities.reduce((sum, activity) => sum + (Number(activity.hours) || 0), 0)}`,
    `Livrabile: ${activities.reduce((sum, activity) => sum + (activity.deliverables?.length || 0), 0)}`,
    `Neconformitati deschise: ${neconformitati.filter((item) => !item.resolved).length}`,
    '',
    'Clarificari',
    ...(
      clarifications.length > 0
        ? clarifications.map((item) => `- ${item.status}: ${item.pmMessage}`)
        : ['- Nu exista clarificari inregistrate.']
    ),
    '',
    'Activitati si livrabile',
  ];

  activities.forEach((activity) => {
    lines.push(`- ${activity.date} / ${activity.saCode || 'SA'} / ${activity.hours}h / ${activity.title || activity.activityType}`);
    (activity.deliverables || []).forEach((deliverable) => {
      lines.push(`  * ${getUploadedDeliverableFileName(deliverable)}`);
    });
  });

  if (neconformitati.length > 0) {
    lines.push('', 'Neconformitati');
    neconformitati.forEach((item) => {
      lines.push(`- ${item.resolved ? 'rezolvata' : 'deschisa'}: ${item.description || item.type}`);
    });
  }

  return lines;
}

export function buildPmDossierPdfBlob(input: {
  expert: Expert;
  activities: Activity[];
  neconformitati: Neconformitate[];
  clarifications: PmClarificationThread[];
  month: number;
  year: number;
  reportStatus?: ReportStatus | null;
}) {
  const lines = buildLines(input).slice(0, 52);
  const contentLines = ['BT', '/F1 10 Tf', '50 790 Td'];
  lines.forEach((line, index) => {
    if (index > 0) contentLines.push('0 -14 Td');
    contentLines.push(`(${escapePdfText(line).slice(0, 115)}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let offset = '%PDF-1.4\n'.length;
  const xref = ['0000000000 65535 f '];
  objects.forEach((object) => {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n `);
    offset += object.length;
  });
  const body = `%PDF-1.4\n${objects.join('')}`;
  const trailer = `xref\n0 ${objects.length + 1}\n${xref.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
  return new Blob([body, trailer], { type: 'application/pdf' });
}

export function buildPmDossierPdfFilename(expert: Expert, month: number, year: number) {
  return safeFilename(`Dosar_${expert.name}_${getMonthName(month)}_${year}.pdf`);
}
