import type { Anexa10ReportModel, Anexa10SaSection, Anexa10TableRow } from './build-report-model.ts';

export async function buildAnexa10DocxBlob(model: Anexa10ReportModel): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx');

  const docx = {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  };

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: buildAnexa10DocxChildren(model, docx),
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function buildAnexa10DocxFilename(model: Pick<Anexa10ReportModel, 'header'>) {
  return safeFilename(`Anexa_10_${model.header.expertName}_${model.header.month}_${model.header.year}.docx`);
}

function buildAnexa10DocxChildren(model: Anexa10ReportModel, docx: Record<string, any>) {
  const { HeadingLevel, Paragraph, TextRun } = docx;

  return [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: docx.AlignmentType.CENTER,
      children: [new TextRun({ text: 'Raport de Activitate - Anexa 10', bold: true })],
    }),
    paragraph(`Luna: ${model.header.month} ${model.header.year}`, docx),
    paragraph(`Expert: ${model.header.expertName}`, docx),
    paragraph(`Pozitie: ${model.header.position || '-'}`, docx),
    paragraph(`Contract: ${model.header.contract || '-'}`, docx),
    paragraph(`Proiect: ${model.header.projectCode}${model.header.projectTitle ? ` - ${model.header.projectTitle}` : ''}`, docx),
    paragraph(`Beneficiar: ${model.header.beneficiary || '-'}`, docx),
    spacer(docx),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '1. Tabel activitati', bold: true })],
    }),
    buildTable(model.tableRows, docx),
    spacer(docx),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '2. Descriere detaliata pe subactivitati', bold: true })],
    }),
    ...model.saSections.flatMap((section) => buildSaSection(section, docx)),
    spacer(docx),
    paragraph(`Total ore raportate: ${model.totalHours}`, docx, { bold: true }),
    ...(model.warnings.length > 0 ? [
      spacer(docx),
      paragraph('Avertizari de verificare:', docx, { bold: true }),
      ...model.warnings.map((warning) => paragraph(`- ${warning}`, docx)),
    ] : []),
    spacer(docx),
    paragraph(`Data semnaturii: ${model.signature.date || '-'}`, docx),
    paragraph(`Semnatura expert: ${model.signature.expertName}`, docx),
  ];
}

function buildTable(rows: Anexa10TableRow[], docx: Record<string, any>) {
  const { BorderStyle, Table, TableCell, TableRow, WidthType } = docx;
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Nr.', docx, 700),
        headerCell('SA', docx, 1100),
        headerCell('Perioada', docx, 2300),
        headerCell('Activitate', docx, 2800),
        headerCell('Rezultate / livrabile', docx, 3300),
        headerCell('Ore', docx, 800),
        headerCell('Observatii', docx, 1500),
      ],
    }),
    ...rows.map((row, index) => new TableRow({
      children: [
        bodyCell(String(index + 1), docx, 700),
        bodyCell(row.saCode, docx, 1100),
        bodyCell(row.period, docx, 2300),
        bodyCell(row.activityTitle, docx, 2800),
        bodyCell(formatDeliverables(row.resultsAndDeliverables), docx, 3300),
        bodyCell(String(row.hours), docx, 800),
        bodyCell(row.flowType, docx, 1500),
      ],
    })),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    },
  });
}

function buildSaSection(section: Anexa10SaSection, docx: Record<string, any>) {
  const { HeadingLevel, Paragraph, TextRun } = docx;
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: `${section.saCode} - ${section.totalHours} ore`, bold: true })],
    }),
    ...section.paragraphs.map((item) => paragraph(item, docx)),
  ];
}

function headerCell(text: string, docx: Record<string, any>, width: number) {
  return cell(text, docx, width, { bold: true, shading: 'E5E7EB' });
}

function bodyCell(text: string, docx: Record<string, any>, width: number) {
  return cell(text, docx, width);
}

function cell(text: string, docx: Record<string, any>, width: number, options: { bold?: boolean; shading?: string } = {}) {
  const { Paragraph, TableCell, TextRun, WidthType } = docx;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.shading ? { fill: options.shading } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: options.bold })],
      }),
    ],
  });
}

function paragraph(text: string, docx: Record<string, any>, options: { bold?: boolean } = {}) {
  const { Paragraph, TextRun } = docx;
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: options.bold })],
  });
}

function spacer(docx: Record<string, any>) {
  return new docx.Paragraph({ text: '' });
}

function formatDeliverables(items: string[]) {
  if (items.length <= 1) return items[0] ?? '-';
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function safeFilename(value: string) {
  return value
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}
