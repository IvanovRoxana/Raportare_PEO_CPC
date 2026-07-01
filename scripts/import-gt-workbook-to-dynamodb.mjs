import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import XLSX from 'xlsx';

const DEFAULT_WORKBOOK =
  'C:/Users/RoxanaIvanov/OneDrive - Confederatia Patronala Concordia/PEO 2024-2028 - Documents/General/RAPORTARE_TEHNICA/SA1.1_Grup Tinta/IVANOV ROXANA/Monitorizare/Date membrii CPC.xlsx';

const args = parseArgs(process.argv.slice(2));
const workbookPath = path.resolve(args.workbook ?? DEFAULT_WORKBOOK);
const profile = args.profile ?? 'raportarepeo';
const region = args.region ?? 'eu-north-1';
const awsExe = args.aws ?? 'aws';
const dryRun = Boolean(args['dry-run']);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function clean(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCui(value) {
  const text = clean(value);
  if (!text) return undefined;
  const digits = text.replace(/^RO/i, '').replace(/\D/g, '');
  return digits || undefined;
}

function numberValue(value) {
  const text = clean(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function idFor(prefix, values) {
  const hash = crypto
    .createHash('sha1')
    .update(values.map((value) => normalizeText(value)).filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 16);
  return `${prefix}_${hash}`;
}

function getValue(row, ...names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const target = normalizeText(name);
    const match = entries.find(([key]) => normalizeText(key) === target);
    if (match) return match[1];
  }
  return undefined;
}

function organizationKindFromLegalForm(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('federatie')) return 'federatie';
  if (normalized.includes('organizatie')) return 'organizatie_patronala';
  if (normalized.includes('patronat')) return 'organizatie_patronala';
  return 'necunoscut';
}

function inferGTStatusFromCpcAllText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return 'draft';
  if (normalized.includes('nevalid')) return 'in_verificare';
  if (normalized.includes('da') || normalized.includes('inscris')) return 'dosar_depus';
  return 'draft';
}

function directCpcRows(sheetName, rows) {
  return rows
    .map((row, index) => {
      const name = clean(getValue(row, 'DENUMIRE'));
      if (!name) return undefined;
      const legalForm = clean(getValue(row, 'FORMA DE ORGANIZARE'));
      return {
        id: idFor('org', ['cpc-all', name]),
        name,
        normalizedName: normalizeText(name),
        kind: organizationKindFromLegalForm(legalForm),
        legalForm,
        status: 'active',
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
        gtSourceStatusText: clean(getValue(row, 'Inscrisi in GT')),
        peoOtherProjectsText: clean(getValue(row, 'Inscriere alte proiecte PEO')),
        informationSessionText: clean(getValue(row, 'Sedinta de informare')),
      };
    })
    .filter(Boolean);
}

function memberRows(sheetName, rows) {
  const output = [];

  rows.forEach((row, index) => {
    const companyName = clean(getValue(row, 'Compania'));
    const patronalOrganizationName = clean(getValue(row, 'Organizatia Patronala', 'Organizația Patronală'));
    const federationName = clean(getValue(row, 'Federatia Patronala', 'Federația Patronală'));
    const cui = normalizeCui(getValue(row, 'CUI'));
    const employeeCount = numberValue(getValue(row, 'Numar salariati Inspectia Muncii', 'Număr salariați Inspecția Muncii'));

    if (federationName) {
      output.push({
        id: idFor('org', ['federatie', federationName]),
        name: federationName,
        normalizedName: normalizeText(federationName),
        kind: 'federatie',
        status: 'active',
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
      });
    }

    if (patronalOrganizationName) {
      output.push({
        id: idFor('org', ['organizatie_patronala', patronalOrganizationName]),
        name: patronalOrganizationName,
        normalizedName: normalizeText(patronalOrganizationName),
        kind: 'organizatie_patronala',
        status: 'active',
        parentOrganizationId: federationName ? idFor('org', ['federatie', federationName]) : undefined,
        federationName,
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
      });
    }

    if (companyName) {
      output.push({
        id: cui ? idFor('org', ['cui', cui]) : idFor('org', ['companie', companyName, patronalOrganizationName, federationName]),
        name: companyName,
        normalizedName: normalizeText(companyName),
        kind: 'companie',
        status: 'active',
        cui,
        parentOrganizationId: patronalOrganizationName
          ? idFor('org', ['organizatie_patronala', patronalOrganizationName])
          : federationName
            ? idFor('org', ['federatie', federationName])
            : undefined,
        federationName,
        patronalOrganizationName,
        employeeCount,
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
      });
    }
  });

  return output;
}

function dedupeOrganizations(rows) {
  const byKey = new Map();
  const duplicates = [];

  for (const row of rows) {
    const key = row.cui ? `cui:${row.cui}` : `name:${row.kind}:${row.normalizedName}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    duplicates.push(row);
    byKey.set(key, {
      ...existing,
      parentOrganizationId: existing.parentOrganizationId ?? row.parentOrganizationId,
      federationName: existing.federationName ?? row.federationName,
      patronalOrganizationName: existing.patronalOrganizationName ?? row.patronalOrganizationName,
      employeeCount: existing.employeeCount ?? row.employeeCount,
      gtSourceStatusText: existing.gtSourceStatusText ?? row.gtSourceStatusText,
      peoOtherProjectsText: existing.peoOtherProjectsText ?? row.peoOtherProjectsText,
      informationSessionText: existing.informationSessionText ?? row.informationSessionText,
    });
  }

  return {
    organizations: Array.from(byKey.values()),
    duplicates,
  };
}

function toDdbAttribute(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return { BOOL: value };
  if (typeof value === 'number') return { N: String(value) };
  if (Array.isArray(value)) return { L: value.map(toDdbAttribute).filter(Boolean) };
  return { S: String(value) };
}

function toDdbItem(record, now) {
  const item = {
    createdAt: { S: record.createdAt ?? now },
    updatedAt: { S: now },
  };

  for (const [key, value] of Object.entries(record)) {
    const attribute = toDdbAttribute(value);
    if (attribute) item[key] = attribute;
  }

  return item;
}

function runAws(args, inputFile) {
  const result = spawnSync(awsExe, args, {
    stdio: inputFile ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`AWS command failed: ${awsExe} ${args.join(' ')}\n${result.stderr ?? ''}`);
  }
  return result.stdout;
}

function findTable(tableNames, modelName) {
  const matches = tableNames.filter((name) => name.startsWith(`${modelName}-`));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one DynamoDB table for ${modelName}, found: ${matches.join(', ') || 'none'}`);
  }
  return matches[0];
}

function writeItems(tableName, records) {
  if (!records.length) return;
  const now = new Date().toISOString();
  for (let index = 0; index < records.length; index += 25) {
    const chunk = records.slice(index, index + 25);
    const request = {
      [tableName]: chunk.map((record) => ({
        PutRequest: {
          Item: toDdbItem(record, now),
        },
      })),
    };
    const tempFile = path.join(os.tmpdir(), `gt-import-${crypto.randomUUID()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(request), 'utf8');
    runAws([
      'dynamodb',
      'batch-write-item',
      '--request-items',
      `file://${tempFile}`,
      '--profile',
      profile,
      '--region',
      region,
      '--output',
      'json',
    ], tempFile);
    fs.rmSync(tempFile, { force: true });
    process.stdout.write(`Imported ${Math.min(index + chunk.length, records.length)} / ${records.length} into ${tableName}\n`);
  }
}

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`);
}

const workbook = XLSX.readFile(workbookPath, { cellDates: false });
const sheets = workbook.SheetNames.map((sheetName) => ({
  sheetName,
  rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }),
}));

const rawOrganizations = sheets.flatMap((sheet) => (
  normalizeText(sheet.sheetName) === 'cpc all'
    ? directCpcRows(sheet.sheetName, sheet.rows)
    : memberRows(sheet.sheetName, sheet.rows)
));
const { organizations, duplicates } = dedupeOrganizations(rawOrganizations);
const cpcAllOrganizations = directCpcRows('CPC ALL', sheets.find((sheet) => normalizeText(sheet.sheetName) === 'cpc all')?.rows ?? []);

const batchId = 'gt_import_date_membrii_cpc_initial';
const batch = {
  id: batchId,
  sourceFileName: path.basename(workbookPath),
  importedBy: 'codex-import',
  importedAt: new Date().toISOString(),
  status: duplicates.length ? 'imported_with_warnings' : 'imported',
  totalRows: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
  createdOrganizations: organizations.length,
  duplicateRows: duplicates.length,
  warningsJson: JSON.stringify({
    sheets: sheets.map((sheet) => ({ sheetName: sheet.sheetName, rows: sheet.rows.length })),
    duplicateRows: duplicates.length,
  }),
};

const organizationRecords = organizations.map((organization) => ({
  id: organization.id,
  name: organization.name,
  normalizedName: organization.normalizedName,
  kind: organization.kind,
  legalForm: organization.legalForm,
  cui: organization.cui,
  parentOrganizationId: organization.parentOrganizationId,
  federationName: organization.federationName,
  patronalOrganizationName: organization.patronalOrganizationName,
  employeeCount: organization.employeeCount,
  status: organization.status ?? 'active',
  sourceSheet: organization.sourceSheet,
  sourceRowNumber: organization.sourceRowNumber,
  importBatchId: batchId,
  gtNotes: [
    organization.gtSourceStatusText ? `GT: ${organization.gtSourceStatusText}` : undefined,
    organization.peoOtherProjectsText ? `PEO: ${organization.peoOtherProjectsText}` : undefined,
    organization.informationSessionText ? `Informare: ${organization.informationSessionText}` : undefined,
  ].filter(Boolean).join(' | ') || undefined,
}));

const entityRecords = cpcAllOrganizations.map((organization) => ({
  id: idFor('gt_entity', [organization.id]),
  organizationId: organization.id,
  organizationName: organization.name,
  status: inferGTStatusFromCpcAllText(organization.gtSourceStatusText),
  indicator5SO04: false,
  indicator5SR04: false,
  notes: [
    organization.peoOtherProjectsText ? `Inscriere alte proiecte PEO: ${organization.peoOtherProjectsText}` : undefined,
    organization.informationSessionText ? `Sedinta de informare: ${organization.informationSessionText}` : undefined,
  ].filter(Boolean).join(' | ') || undefined,
  sourceStatusText: organization.gtSourceStatusText,
}));

const summary = {
  workbookPath,
  sheets: sheets.map((sheet) => ({ sheetName: sheet.sheetName, rows: sheet.rows.length })),
  rawOrganizations: rawOrganizations.length,
  organizations: organizationRecords.length,
  duplicateRows: duplicates.length,
  gtEntities: entityRecords.length,
};
console.log(JSON.stringify(summary, null, 2));

if (dryRun) {
  process.exit(0);
}

const tables = JSON.parse(runAws([
  'dynamodb',
  'list-tables',
  '--profile',
  profile,
  '--region',
  region,
  '--output',
  'json',
])).TableNames;

writeItems(findTable(tables, 'GTImportBatch'), [batch]);
writeItems(findTable(tables, 'Organization'), organizationRecords);
writeItems(findTable(tables, 'GTEntity'), entityRecords);

console.log('GT workbook import completed.');
