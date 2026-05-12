'use client';

import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, HeadingLevel } from 'docx';
import type { Activity, Expert } from './types';

interface OpisRow {
  nr: number;
  dataDocument: string;
  numarDocument: string;
  titluDocument: string;
  nrPagini: string;
  observatii: string;
}

export async function generateOpisDocument(
  expert: Expert,
  activities: Activity[],
  month: number,
  year: number,
  projectCode: string = 'PEO',
  projectTitle: string = 'Program de Educație și Ocupare'
): Promise<Blob> {
  const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
  const monthName = MONTHS[month];

  // Build OPIS rows from activities
  const opisRows: OpisRow[] = [];
  let nr = 1;

  // Sort activities by date
  const sortedActivities = [...activities].sort((a, b) => a.date.localeCompare(b.date));

  for (const activity of sortedActivities) {
    if (activity.deliverables && activity.deliverables.length > 0) {
      for (const deliv of activity.deliverables) {
        const dt = new Date(activity.date);
        const dataStr = isNaN(dt.getTime()) ? activity.date : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        opisRows.push({
          nr: nr++,
          dataDocument: dataStr,
          numarDocument: '-',
          titluDocument: deliv.fileName || 'Document fără titlu',
          nrPagini: '-',
          observatii: activity.activityType || '',
        });
      }
    }
  }

  // Create table rows
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      createHeaderCell('Nr. crt.', 800),
      createHeaderCell('Data document', 1500),
      createHeaderCell('Nr. document', 1200),
      createHeaderCell('Titlul documentului', 4000),
      createHeaderCell('Nr. pagini', 1000),
      createHeaderCell('Observații', 1500),
    ],
  });

  const dataRows = opisRows.map(row => new TableRow({
    children: [
      createDataCell(String(row.nr)),
      createDataCell(row.dataDocument),
      createDataCell(row.numarDocument),
      createDataCell(row.titluDocument),
      createDataCell(row.nrPagini),
      createDataCell(row.observatii),
    ],
  }));

  // Create document
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Header
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: 'OPIS DOCUMENTE',
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `${monthName} ${year}`,
              size: 24,
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Proiect: ', bold: true, size: 22 }),
            new TextRun({ text: `${projectCode} - ${projectTitle}`, size: 22 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ text: 'Expert: ', bold: true, size: 22 }),
            new TextRun({ text: `${expert.name} (${expert.role})`, size: 22 }),
          ],
        }),

        // Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows],
        }),

        // Footer
        new Paragraph({
          spacing: { before: 400 },
          children: [
            new TextRun({
              text: `Total documente: ${opisRows.length}`,
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 400 },
          children: [
            new TextRun({
              text: 'Întocmit de: ___________________________',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 200 },
          children: [
            new TextRun({
              text: 'Data: _______________',
              size: 22,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 200 },
          children: [
            new TextRun({
              text: 'Semnătura: _______________',
              size: 22,
            }),
          ],
        }),
      ],
    }],
  });

  return await Packer.toBlob(doc);
}

function createHeaderCell(text: string, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { fill: '1B2B4B' },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold: true,
            color: 'FFFFFF',
            size: 20,
          }),
        ],
      }),
    ],
  });
}

function createDataCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 20,
          }),
        ],
      }),
    ],
  });
}

// Download OPIS
export function downloadOpis(blob: Blob, expert: Expert, month: number, year: number) {
  const MONTHS = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const filename = `OPIS_${expert.name.replace(/\s+/g, '_')}_${MONTHS[month]}_${year}.docx`;
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
