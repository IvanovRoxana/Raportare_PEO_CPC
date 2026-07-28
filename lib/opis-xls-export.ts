import * as XLSX from 'xlsx';
import { getMonthName } from './app-utils.ts';
import type { Activity, Deliverable, Expert } from './types.ts';

export type OpisXlsInput = {
  experts: Expert[];
  activities: Activity[];
  month: number;
  year: number;
  projectCode?: string;
};

export function getUploadedDeliverableFileName(deliverable: Pick<Deliverable, 'originalFileName' | 'fileName'>) {
  return deliverable.originalFileName || deliverable.fileName || 'livrabil';
}

export function buildOpisRows({ experts, activities, month, year, projectCode = '302141' }: OpisXlsInput) {
  const expertById = new Map(experts.map((expert) => [expert.id, expert]));

  return activities.flatMap((activity) => {
    const expert = expertById.get(activity.expertId);
    return (activity.deliverables || []).map((deliverable, index) => ({
      Nr: index + 1,
      Expert: expert?.name || activity.expertName || activity.expertId,
      Rol: expert?.role || '',
      Categorie: expert?.category || '',
      Luna: `${getMonthName(month)} ${year}`,
      Proiect: deliverable.projectCode || activity.projectCode || projectCode,
      'Data activitate': activity.date,
      SA: deliverable.saCode || activity.saCode || '',
      'Titlu activitate': activity.title || activity.activityType,
      'Denumire fisier incarcat': getUploadedDeliverableFileName(deliverable),
      'Tip livrabil': deliverable.deliverableType || '',
      Stadiu: deliverable.stadiu || '',
      'Status titlu': deliverable.titleCheckStatus || (deliverable.titleMatch === false ? 'mismatch' : deliverable.titleMatch ? 'matched' : ''),
      'Status AI/verificare': deliverable.aiStatus || deliverable.eligibilityCheck?.status || '',
      'Observatii PM': activity.pmNotes || '',
    }));
  });
}

export function buildOpisXlsxBuffer(input: OpisXlsInput) {
  const workbook = XLSX.utils.book_new();
  const rows = buildOpisRows(input);
  const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{
    Expert: '',
    Luna: `${getMonthName(input.month)} ${input.year}`,
    'Denumire fisier incarcat': 'Nu exista livrabile pentru perioada selectata',
  }]);
  sheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 42 },
    { wch: 48 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'OPIS livrabile');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
}

export function buildOpisXlsxBlob(input: OpisXlsInput) {
  const buffer = buildOpisXlsxBuffer(input);
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function buildOpisXlsxFilename(expertName: string | null, month: number, year: number) {
  const scope = expertName ? `OPIS_${expertName}` : 'OPIS_total';
  return `${scope}_${getMonthName(month)}_${year}.xlsx`.replace(/[\\/:*?"<>|]+/g, '_');
}
