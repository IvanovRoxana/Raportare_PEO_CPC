import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "outputs/eligibility-architecture/arhitectura-catalog-livrabile-eligibilitate.xlsx";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "sheet",
  maxChars: 3000,
});
console.log(sheets.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "imported workbook formula error scan",
});
console.log(errors.ndjson);
