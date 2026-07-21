import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FOUNDATION_MODELS = new Set([
  "Expert",
  "Verification",
  "Neconformitate",
  "VerificationNote",
  "ConcurrentProject",
  "ConcurrentProjectTimesheetEntry",
  "ProcurementProject",
  "ProcurementDocument",
  "ProcurementLaunch",
  "ProcurementSupplier",
  "ProcurementOffer",
  "ProcurementEvaluation",
  "ProcurementContract",
  "ProcurementDeliverable",
  "ProcurementReception",
  "ProcurementInvoice",
  "ProcurementStatusHistory",
  "ProcurementChecklist",
  "HistoricalImportBatch",
  "MonthlyExpertReport",
  "UploadedReportingFile",
  "MonthlyActivityItem",
  "HistoricalTimesheetDayEntry",
  "AuditLog",
  "NotificationLog",
]);

const SOURCE_PATH = resolve("amplify/data/resource.ts");
const BACKUP_PATH = resolve(".staging-bootstrap/resource.ts.backup");

export function extractModelBlocks(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const schemaStart = normalized.indexOf("const schema = a.schema({");
  const bodyStart = normalized.indexOf("\n", schemaStart) + 1;
  const bodyEnd = normalized.indexOf("\n});", bodyStart);
  if (schemaStart < 0 || bodyStart <= 0 || bodyEnd < 0) {
    throw new Error("Unable to locate the Amplify schema definition.");
  }

  const body = normalized.slice(bodyStart, bodyEnd);
  const headings = [...body.matchAll(/^  ([A-Za-z][A-Za-z0-9]*): a$/gm)];
  if (headings.length < 2) {
    throw new Error("Unable to identify Amplify model blocks.");
  }

  const blocks = headings.map((heading, index) => ({
    name: heading[1],
    source: body.slice(heading.index, headings[index + 1]?.index ?? body.length).trimEnd(),
  }));

  return {
    prefix: normalized.slice(0, bodyStart),
    blocks,
    suffix: normalized.slice(bodyEnd),
  };
}

export function buildFoundationSchema(source) {
  const parsed = extractModelBlocks(source);
  const selected = parsed.blocks
    .filter((block) => FOUNDATION_MODELS.has(block.name))
    .map((block) => {
      if (block.name !== "Expert") return block;
      return {
        ...block,
        source: block.source
          .split("\n")
          .filter(
            (line) =>
              !line.includes('activities: a.hasMany("Activity"') &&
              !line.includes('reportingWorkBlocks: a.hasMany("ReportingWorkBlock"') &&
              !line.includes('grupTintaEntries: a.hasMany("GrupTintaEntry"'),
          )
          .join("\n"),
      };
    });

  if (selected.length !== FOUNDATION_MODELS.size) {
    const found = new Set(selected.map((block) => block.name));
    const missing = [...FOUNDATION_MODELS].filter((name) => !found.has(name));
    throw new Error(`Foundation schema is missing models: ${missing.join(", ")}`);
  }

  const selectedNames = new Set(selected.map((block) => block.name));
  for (const block of selected) {
    for (const match of block.source.matchAll(/a\.(?:hasMany|belongsTo)\("([^"]+)"/g)) {
      if (!selectedNames.has(match[1])) {
        throw new Error(`${block.name} references excluded model ${match[1]}.`);
      }
    }
  }

  return `${parsed.prefix}${selected.map((block) => block.source).join("\n\n")}\n${parsed.suffix}`;
}

function applyFoundationSchema() {
  if (existsSync(BACKUP_PATH)) {
    throw new Error(`Backup already exists at ${BACKUP_PATH}. Restore it first.`);
  }
  const source = readFileSync(SOURCE_PATH, "utf8");
  const transformed = buildFoundationSchema(source);
  mkdirSync(dirname(BACKUP_PATH), { recursive: true });
  writeFileSync(BACKUP_PATH, source, { encoding: "utf8", flag: "wx" });
  writeFileSync(SOURCE_PATH, transformed, "utf8");
  process.stdout.write(`Prepared ${FOUNDATION_MODELS.size}-model staging foundation schema.\n`);
}

function restoreFullSchema() {
  if (!existsSync(BACKUP_PATH)) {
    throw new Error(`No staging bootstrap backup found at ${BACKUP_PATH}.`);
  }
  writeFileSync(SOURCE_PATH, readFileSync(BACKUP_PATH, "utf8"), "utf8");
  rmSync(dirname(BACKUP_PATH), { recursive: true, force: true });
  process.stdout.write("Restored the full Amplify schema.\n");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "apply") applyFoundationSchema();
  else if (command === "restore") restoreFullSchema();
  else throw new Error("Usage: node scripts/staging-bootstrap-schema.mjs <apply|restore>");
}
