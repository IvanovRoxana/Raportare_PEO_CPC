import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import xlsx from "xlsx";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "data", "import");
const utf8Decoder = new TextDecoder("utf-8");
const cp1252SpecialBytes = new Map([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

const sourceFiles = {
  catalog:
    process.env.PEO_CATALOG_FILE ||
    "C:\\Users\\RoxanaIvanov\\Confederatia Concordia\\PEO 2024-2028 - Documents\\General\\RAPORTARE_TEHNICA\\SA1.1_Grup Tinta\\IVANOV ROXANA\\Robotei\\Etapa 2\\PEO_Catalog_Activitati v2.xlsx",
  timesheet:
    process.env.PEO_PONTAJ_FILE ||
    "C:\\Users\\RoxanaIvanov\\Confederatia Concordia\\PEO 2024-2028 - Documents\\General\\RAPORTARE_TEHNICA\\SA1.1_Grup Tinta\\IVANOV ROXANA\\Robotei\\Etapa 2\\Pontaj.xlsx",
  activities:
    process.env.PEO_ACTIVITIES_FILE ||
    "C:\\Users\\RoxanaIvanov\\Confederatia Concordia\\PEO 2024-2028 - Documents\\General\\RAPORTARE_TEHNICA\\SA1.1_Grup Tinta\\IVANOV ROXANA\\Robotei\\Etapa 1\\PEO_Formular_Activitate_noua.csv",
  workingGroups:
    process.env.PEO_WORKING_GROUPS_FILE ||
    "C:\\Users\\RoxanaIvanov\\Confederatia Concordia\\PEO 2024-2028 - Documents\\General\\RAPORTARE_TEHNICA\\SA1.1_Grup Tinta\\IVANOV ROXANA\\Robotei\\Etapa 1\\PEO_Grupuri_Lucru (1).csv",
  targetGroups:
    process.env.PEO_TARGET_GROUPS_FILE ||
    "C:\\Users\\RoxanaIvanov\\Confederatia Concordia\\PEO 2024-2028 - Documents\\General\\RAPORTARE_TEHNICA\\SA1.1_Grup Tinta\\IVANOV ROXANA\\Robotei\\Etapa 1\\PEO_GT.csv",
  reportStatus:
    process.env.PEO_REPORT_STATUS_FILE ||
    "C:\\Users\\RoxanaIvanov\\Confederatia Concordia\\PEO 2024-2028 - Documents\\General\\RAPORTARE_TEHNICA\\SA1.1_Grup Tinta\\IVANOV ROXANA\\Robotei\\Etapa 1\\PEO_Status_RA.csv",
};

function clean(value) {
  if (value === undefined || value === null) return undefined;
  const text = repairMojibake(String(value)).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function repairMojibake(value) {
  if (!/[ÃÂÄÈâ]/.test(value)) return value;

  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    const mapped = cp1252SpecialBytes.get(char);
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    return value;
  }

  const decoded = utf8Decoder.decode(Uint8Array.from(bytes));
  const originalMarkers = (value.match(/[ÃÂÄÈâ]/g) || []).length;
  const decodedMarkers = (decoded.match(/[ÃÂÄÈâ]/g) || []).length;
  return decodedMarkers < originalMarkers ? decoded : value;
}

function numberValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function intValue(value) {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function dateValue(value) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = clean(value);
  if (!text) return undefined;
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function idFor(prefix, values) {
  const hash = crypto
    .createHash("sha1")
    .update(values.filter(Boolean).join("|").toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `${prefix}_${hash}`;
}

function normalizeCategory(value) {
  const text = clean(value)?.toLowerCase();
  if (!text) return "peo";
  if (text.includes("politici") || text === "pa") return "ap";
  if (text.includes("com")) return "com";
  if (text.includes("beneficiar") || text === "bh") return "bh";
  if (text.includes("grup") || text === "gt") return "gt";
  if (text.includes("gdpr")) return "gdpr";
  if (text.includes("recrut") || text === "cr") return "cr";
  return text;
}

function extractSaCode(...values) {
  const text = values.map((value) => clean(value)).filter(Boolean).join(" ");
  const match = text.match(/SA\s*\d+(?:\.\d+)?/i);
  return match ? match[0].replace(/\s+/g, "").toUpperCase() : undefined;
}

function rowsFromWorkbook(filePath, preferredSheet) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Nu gasesc fisierul: ${filePath}`);
  }

  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    raw: false,
  });
  const sheetName =
    preferredSheet && workbook.Sheets[preferredSheet]
      ? preferredSheet
      : workbook.SheetNames[0];

  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    blankrows: false,
  });
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function prepareCatalog() {
  const rows = rowsFromWorkbook(sourceFiles.catalog, "PEO_Catalog_Activitati");

  return dedupeById(
    rows
      .map((row) => {
        const activityName = clean(row["Nume Activitate"]);
        const saCode = extractSaCode(row["Subactivitate"], row["Denumire Subactivitate"]);
        if (!activityName || !saCode) return undefined;

        return {
          id: idFor("catalog", [saCode, row["Nr."], activityName]),
          category: normalizeCategory(row["Categorie"]),
          saCode,
          serviceCategory: clean(row["Categorie Serviciu"]),
          activityNumber: intValue(row["Nr."]),
          activityName,
          description: clean(row["Descriere"]),
          objectives: clean(row["Obiective"]),
          serviceComponent: clean(row["Componenta Serviciului"]),
          beneficiaries: clean(row["Beneficiari"]),
          expectedResults: clean(row["Rezultate Asteptate"]),
          deliverables: clean(row["Livrabile"]),
          indicators: clean(row["Indicatori"]),
        };
      })
      .filter(Boolean),
  );
}

function prepareWorkingGroups() {
  const rows = rowsFromWorkbook(sourceFiles.workingGroups);

  return dedupeById(
    rows
      .map((row) => {
        const name = clean(row["Nume"]);
        if (!name) return undefined;

        return {
          id: idFor("wg", [name, row["SA"]]),
          name,
          type: clean(row["Tip"]) || "grup_lucru",
          isActive: clean(row["Activ"])?.toLowerCase() !== "nu",
          saCode: extractSaCode(row["SA"]),
          notes: clean(row["Observatii"]),
        };
      })
      .filter(Boolean),
  );
}

function prepareActivities() {
  const rows = rowsFromWorkbook(sourceFiles.activities);

  return rows
    .map((row) => {
      const date = dateValue(row["Data"]);
      const expertEmail = clean(row["ExpertId"]);
      const title = clean(row["Activitate"]);
      if (!date || !expertEmail || !title) return undefined;

      return {
        id: idFor("activity", [expertEmail, date, title, row["Ore"], row["CatalogActivitateId"]]),
        expertEmail,
        expertName: clean(row["ExpertNume"]),
        year: intValue(row["An"]),
        month: intValue(row["Luna"]),
        date,
        saCode: extractSaCode(row["SA"]),
        title,
        catalogActivityId: clean(row["CatalogActivitateId"]),
        hours: numberValue(row["Ore"]),
        dayType: clean(row["TipZi"]),
        description: clean(row["Descriere"]),
        workingGroupName: clean(row["GL_Selectat"]),
        status: clean(row["StatusRA"]) || "draft",
        pmNotes: clean(row["ObservatiiPM"]),
        deliverables: clean(row["Livrabile"]),
      };
    })
    .filter(Boolean);
}

function prepareTargetGroups() {
  const rows = rowsFromWorkbook(sourceFiles.targetGroups);

  return rows
    .map((row) => {
      const date = dateValue(row["Data"]);
      const expertEmail = clean(row["ExpertId"]);
      if (!date || !expertEmail) return undefined;

      return {
        id: idFor("gt", [expertEmail, date, row["TipActivitate"], row["Organizatii"]]),
        expertEmail,
        expertName: clean(row["ExpertNume"]),
        year: intValue(row["An"]),
        month: intValue(row["Luna"]),
        date,
        activityType: clean(row["TipActivitate"]) || "grup_tinta",
        organizations: clean(row["Organizatii"])
          ?.split(/[;,]/)
          .map((value) => clean(value))
          .filter(Boolean),
        participantsCount: intValue(row["NrParticipanti"]) || 0,
        notes: clean(row["Notite"]),
      };
    })
    .filter(Boolean);
}

function prepareReportStatuses() {
  const rows = rowsFromWorkbook(sourceFiles.reportStatus);

  return rows
    .map((row) => {
      const expertEmail = clean(row["ExpertId"]);
      const year = intValue(row["An"]);
      const month = intValue(row["Luna"]);
      if (!expertEmail || !year || !month) return undefined;

      return {
        id: idFor("status", [expertEmail, year, month]),
        expertEmail,
        expertName: clean(row["ExpertNume"]),
        year,
        month,
        status: clean(row["Status"]) || "draft",
        sentDate: dateValue(row["DataTrimiteri"]),
        approvalDate: dateValue(row["DataAprobarii"]),
        pmNotes: clean(row["ObservatiiPM"]),
      };
    })
    .filter(Boolean);
}

function writeJson(fileName, data) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const datasets = {
  activityCatalog: prepareCatalog(),
  workingGroups: prepareWorkingGroups(),
  sampleActivities: prepareActivities(),
  targetGroups: prepareTargetGroups(),
  reportStatuses: prepareReportStatuses(),
};

writeJson("activity-catalog.json", datasets.activityCatalog);
writeJson("working-groups.json", datasets.workingGroups);
writeJson("sample-activities.json", datasets.sampleActivities);
writeJson("target-groups.json", datasets.targetGroups);
writeJson("report-statuses.json", datasets.reportStatuses);

const summary = Object.fromEntries(
  Object.entries(datasets).map(([key, value]) => [key, value.length]),
);

writeJson("import-summary.json", {
  generatedAt: new Date().toISOString(),
  sourceFiles,
  counts: summary,
  notes: [
    "activityCatalog si workingGroups pot fi importate direct in DynamoDB.",
    "sampleActivities, targetGroups si reportStatuses trebuie legate de Expert.id inainte de importul final.",
  ],
});

console.log("Date pregatite in data/import:");
console.table(summary);
