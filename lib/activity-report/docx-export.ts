import type { Anexa10ReportModel, Anexa10SaSection, Anexa10TableRow } from './build-report-model.ts';

const PAGE = {
  width: 15840,
  height: 12240,
  margins: {
    top: 1360,
    right: 850,
    bottom: 620,
    left: 430,
  },
};

const TABLE_WIDTHS = [600, 2400, 3600, 2600, 2800, 1400, 800];

export async function buildAnexa10DocxBlob(model: Anexa10ReportModel): Promise<Blob> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    PageOrientation,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalMergeType,
    WidthType,
  } = await import('docx');

  const docx = {
    AlignmentType,
    BorderStyle,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalMergeType,
    WidthType,
  };

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 20,
          },
          paragraph: {
            spacing: { after: 80 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE.width,
              height: PAGE.height,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: PAGE.margins,
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
  return [
    paragraph('ANEXA 10 Raport de Activitate', docx, { alignment: docx.AlignmentType.RIGHT }),
    paragraph('Raport de Activitate', docx, { alignment: docx.AlignmentType.CENTER, bold: true, size: 28 }),
    paragraph(`${model.header.month} ${model.header.year}`, docx, { alignment: docx.AlignmentType.CENTER, bold: true, size: 28 }),
    spacer(docx),
    labelValue('Program: ', 'Programul Operational Educatie si Ocupare 2021-2027', docx),
    labelValue('Codul proiectului: ', model.header.projectCode, docx),
    labelValue('Titlul proiectului: ', model.header.projectTitle || 'Consolidarea capacitatii Concordia pentru dialog social', docx),
    labelValue('Beneficiar: ', model.header.beneficiary || 'Confederatia Patronala Concordia', docx),
    labelValue('Numele si prenumele expertului: ', model.header.expertName, docx, { boldLabel: true }),
    labelValue('Pozitia in cadrul proiectului: ', model.header.position || '', docx),
    labelValue('Nr. si tipul contractului: ', model.header.contract || '', docx),
    labelValue('Categorie expert: ', model.header.category || '', docx),
    spacer(docx),
    sectionTitle('1. Prezentare succinta a activitatii prestate in perioada de raportare', docx),
    buildTable(model.tableRows, model.totalHours, docx),
    spacer(docx),
    sectionTitle('2. Detalierea activitatilor realizate si a rezultatelor obtinute', docx),
    ...model.saSections.flatMap((section) => buildSaSection(section, docx)),
    paragraph(
      buildTotalHoursSentence(model),
      docx,
      { italic: true, alignment: docx.AlignmentType.JUSTIFIED },
    ),
    spacer(docx),
    sectionTitle('3. Intarzieri/probleme intampinate in realizarea sarcinilor specifice', docx),
    paragraph('Nu este cazul', docx, { italic: true, alignment: docx.AlignmentType.JUSTIFIED }),
    spacer(docx),
    labelValue('Numele Expertului: ', model.signature.expertName, docx, { boldLabel: true }),
    paragraph('Semnatura:', docx, { bold: true, alignment: docx.AlignmentType.JUSTIFIED }),
    labelValue('Data: ', formatSignatureDate(model.signature.date), docx, { boldLabel: true }),
  ];
}

function buildTable(rows: Anexa10TableRow[], totalHours: number, docx: Record<string, any>) {
  const { BorderStyle, Table, TableRow, WidthType } = docx;
  let deliverableNumber = 1;
  const dataRows = rows.map((row, index) => {
    const isFirstDataRow = index === 0;
    const formattedDeliverables = formatDeliverables(row.resultsAndDeliverables, deliverableNumber);
    deliverableNumber += countNumberedDeliverables(row.resultsAndDeliverables);

    return new TableRow({
      children: [
        bodyCell(`${index + 1}.`, docx, TABLE_WIDTHS[0]),
        bodyCell(isFirstDataRow ? row.officialActivityTitle : '', docx, TABLE_WIDTHS[1], {
          verticalMerge: isFirstDataRow ? docx.VerticalMergeType.RESTART : docx.VerticalMergeType.CONTINUE,
        }),
        bodyCell(isFirstDataRow ? row.responsibilities : '', docx, TABLE_WIDTHS[2], {
          verticalMerge: isFirstDataRow ? docx.VerticalMergeType.RESTART : docx.VerticalMergeType.CONTINUE,
        }),
        bodyCell(row.performedActivity, docx, TABLE_WIDTHS[3]),
        bodyCell(formattedDeliverables, docx, TABLE_WIDTHS[4]),
        bodyCell(row.commonDeliverable, docx, TABLE_WIDTHS[5]),
        bodyCell(String(row.hours), docx, TABLE_WIDTHS[6], { alignment: docx.AlignmentType.CENTER }),
      ],
    });
  });
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Nr. crt.', docx, TABLE_WIDTHS[0]),
        headerCell('Nr. / titlul activitatii conform cererii de finantare', docx, TABLE_WIDTHS[1]),
        headerCell('Responsabilitati si sarcini conform contractului / fisei postului', docx, TABLE_WIDTHS[2]),
        headerCell('Activitate prestata', docx, TABLE_WIDTHS[3]),
        headerCell('Rezultate obtinute / materiale elaborate / livrabile', docx, TABLE_WIDTHS[4]),
        headerCell('Livrabil comun, realizat in colaborare cu alti experti (Da/Nu)', docx, TABLE_WIDTHS[5]),
        headerCell('Nr. ore lucrate', docx, TABLE_WIDTHS[6]),
      ],
    }),
    ...dataRows,
    new TableRow({
      children: [
        bodyCell('', docx, TABLE_WIDTHS[0], { bold: true }),
        bodyCell('TOTAL', docx, TABLE_WIDTHS[1], { bold: true, alignment: docx.AlignmentType.CENTER }),
        bodyCell('TOTAL', docx, TABLE_WIDTHS[2], { bold: true, alignment: docx.AlignmentType.CENTER }),
        bodyCell('TOTAL', docx, TABLE_WIDTHS[3], { bold: true, alignment: docx.AlignmentType.CENTER }),
        bodyCell('TOTAL', docx, TABLE_WIDTHS[4], { bold: true, alignment: docx.AlignmentType.CENTER }),
        bodyCell('TOTAL', docx, TABLE_WIDTHS[5], { bold: true, alignment: docx.AlignmentType.CENTER }),
        bodyCell(String(totalHours), docx, TABLE_WIDTHS[6], { bold: true, alignment: docx.AlignmentType.CENTER }),
      ],
    }),
  ];

  return new Table({
    width: { size: TABLE_WIDTHS.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    rows: tableRows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    },
  });
}

function buildSaSection(section: Anexa10SaSection, docx: Record<string, any>) {
  return [
    paragraph(`Pentru subactivitatea ${section.title || section.saCode}:`, docx, {
      bold: true,
      italic: true,
      alignment: docx.AlignmentType.JUSTIFIED,
    }),
    ...section.items.map((item) => narrativeParagraph(item.timing, item.body, docx)),
  ];
}

function sectionTitle(text: string, docx: Record<string, any>) {
  return paragraph(text, docx, { bold: true, size: 22 });
}

function labelValue(label: string, value: string, docx: Record<string, any>, options: { boldLabel?: boolean } = {}) {
  const { Paragraph, TextRun } = docx;
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: label, bold: options.boldLabel }),
      new TextRun({ text: value, bold: Boolean(value) }),
    ],
  });
}

function headerCell(text: string, docx: Record<string, any>, width: number) {
  return cell(text, docx, width, { bold: true, alignment: docx.AlignmentType.CENTER });
}

function bodyCell(text: string, docx: Record<string, any>, width: number, options: { bold?: boolean; alignment?: any; verticalMerge?: any } = {}) {
  return cell(text, docx, width, options);
}

function cell(text: string, docx: Record<string, any>, width: number, options: { bold?: boolean; alignment?: any; verticalMerge?: any } = {}) {
  const { Paragraph, TableCell, TextRun, WidthType } = docx;
  const lines = String(text || '').split('\n').filter((line) => line.trim().length > 0);

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalMerge: options.verticalMerge,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    children: (lines.length > 0 ? lines : ['']).map((line) => new Paragraph({
      alignment: options.alignment,
      spacing: { after: 40 },
      children: [new TextRun({ text: line, bold: options.bold, size: 18 })],
    })),
  });
}

function narrativeParagraph(timing: string, body: string, docx: Record<string, any>) {
  const { Paragraph, TextRun } = docx;
  const intro = buildNarrativeIntro(timing);
  return new Paragraph({
    alignment: docx.AlignmentType.JUSTIFIED,
    spacing: { after: 80 },
    children: [
      new TextRun({ text: intro, bold: true, size: 20 }),
      new TextRun({ text: body ? `, ${lowercaseFirst(body)}` : '.', size: 20 }),
    ],
  });
}

function paragraph(
  text: string,
  docx: Record<string, any>,
  options: { bold?: boolean; italic?: boolean; alignment?: any; size?: number } = {},
) {
  const { Paragraph, TextRun } = docx;
  return new Paragraph({
    alignment: options.alignment,
    spacing: { after: 80 },
    children: [new TextRun({ text, bold: options.bold, italics: options.italic, size: options.size ?? 20 })],
  });
}

function spacer(docx: Record<string, any>) {
  return new docx.Paragraph({ text: '', spacing: { after: 80 } });
}

function formatDeliverables(items: string[], startIndex: number) {
  let current = startIndex;
  return items.map((item) => {
    if (!shouldNumberDeliverable(item)) return item;
    return `${current++}. ${item}`;
  }).join('\n');
}

function countNumberedDeliverables(items: string[]) {
  return items.filter(shouldNumberDeliverable).length;
}

function shouldNumberDeliverable(item: string) {
  return item.trim().toLocaleUpperCase('ro') !== 'N/A';
}

function buildNarrativeIntro(timing: string) {
  const normalizedTiming = timing.trim();
  const match = normalizedTiming.match(/^((?:in|în) data de .+?),\s*(\d+(?:[.,]\d+)?)\s*ore$/i);
  if (match) return `${uppercaseFirst(match[1])} (${match[2]} ore)`;
  return uppercaseFirst(normalizedTiming);
}

function buildTotalHoursSentence(model: Anexa10ReportModel) {
  const base = `In luna ${model.header.month.toLocaleLowerCase('ro')} ${model.header.year}, activitatea pontata in cadrul proiectului PEO ${model.header.projectCode} a fost de ${model.totalHours} ore`;
  if (model.reportPreparationHours > 0) {
    return `${base} din care ${model.reportPreparationHours} ore pentru elaborarea raportului de activitate.`;
  }
  return `${base}.`;
}

function uppercaseFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('ro') + value.slice(1);
}

function lowercaseFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase('ro') + value.slice(1);
}

function formatSignatureDate(value?: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function safeFilename(value: string) {
  return value
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}
