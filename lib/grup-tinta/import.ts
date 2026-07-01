import crypto from 'node:crypto';
import type { GTOrganizationKind, NormalizedOrganizationImportRow } from './types.ts';

type WorkbookRow = Record<string, unknown>;

export interface WorkbookSheetRows {
  sheetName: string;
  rows: WorkbookRow[];
}

function clean(value: unknown) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

export function normalizeText(value: unknown) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeCui(value: unknown) {
  const text = clean(value);
  if (!text) return undefined;
  const digits = text.replace(/^RO/i, '').replace(/\D/g, '');
  return digits || undefined;
}

function numberValue(value: unknown) {
  const text = clean(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function idFor(prefix: string, values: unknown[]) {
  const hash = crypto
    .createHash('sha1')
    .update(values.map((value) => normalizeText(value)).filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 16);
  return `${prefix}_${hash}`;
}

function getValue(row: WorkbookRow, ...names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const target = normalizeText(name);
    const match = entries.find(([key]) => normalizeText(key) === target);
    if (match) return match[1];
  }
  return undefined;
}

function organizationKindFromLegalForm(value: unknown): GTOrganizationKind {
  const normalized = normalizeText(value);
  if (normalized.includes('federatie')) return 'federatie';
  if (normalized.includes('organizatie')) return 'organizatie_patronala';
  return 'necunoscut';
}

function directCpcRows(sheetName: string, rows: WorkbookRow[]): NormalizedOrganizationImportRow[] {
  return rows
    .map((row, index) => {
      const name = clean(getValue(row, 'DENUMIRE'));
      if (!name) return undefined;
      const legalForm = clean(getValue(row, 'FORMA DE ORGANIZARE', 'FORMĂ DE ORGANIZARE'));
      return {
        id: idFor('org', ['cpc-all', name]),
        name,
        normalizedName: normalizeText(name),
        kind: organizationKindFromLegalForm(legalForm),
        legalForm,
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
        gtSourceStatusText: clean(getValue(row, 'Inscrisi in GT')),
        peoOtherProjectsText: clean(getValue(row, 'Inscriere alte proiecte PEO')),
        informationSessionText: clean(getValue(row, 'Sedinta de informare')),
      };
    })
    .filter(Boolean) as NormalizedOrganizationImportRow[];
}

function memberRows(sheetName: string, rows: WorkbookRow[]): NormalizedOrganizationImportRow[] {
  const output: NormalizedOrganizationImportRow[] = [];

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
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
      });
    }

    if (patronalOrganizationName) {
      const parentOrganizationId = federationName ? idFor('org', ['federatie', federationName]) : undefined;
      output.push({
        id: idFor('org', ['organizatie_patronala', patronalOrganizationName]),
        name: patronalOrganizationName,
        normalizedName: normalizeText(patronalOrganizationName),
        kind: 'organizatie_patronala',
        parentOrganizationId,
        federationName,
        sourceSheet: sheetName,
        sourceRowNumber: index + 2,
      });
    }

    if (companyName) {
      const parentOrganizationId = patronalOrganizationName
        ? idFor('org', ['organizatie_patronala', patronalOrganizationName])
        : federationName
          ? idFor('org', ['federatie', federationName])
          : undefined;
      output.push({
        id: cui ? idFor('org', ['cui', cui]) : idFor('org', ['companie', companyName, patronalOrganizationName, federationName]),
        name: companyName,
        normalizedName: normalizeText(companyName),
        kind: 'companie',
        cui,
        parentOrganizationId,
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

export function normalizeOrganizationImportRows(sheets: WorkbookSheetRows[]): NormalizedOrganizationImportRow[] {
  return sheets.flatMap((sheet) => {
    if (normalizeText(sheet.sheetName) === 'cpc all') return directCpcRows(sheet.sheetName, sheet.rows);
    return memberRows(sheet.sheetName, sheet.rows);
  });
}

export function dedupeOrganizations(rows: NormalizedOrganizationImportRow[]) {
  const byKey = new Map<string, NormalizedOrganizationImportRow>();
  const duplicates: NormalizedOrganizationImportRow[] = [];

  rows.forEach((row) => {
    const key = row.cui ? `cui:${row.cui}` : `name:${row.kind}:${row.normalizedName}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
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
  });

  return {
    organizations: Array.from(byKey.values()),
    duplicates,
  };
}

export function inferGTStatusFromCpcAllText(value?: string) {
  const normalized = normalizeText(value);
  if (!normalized) return 'draft';
  if (normalized.includes('nevalid')) return 'in_verificare';
  if (normalized.includes('da') || normalized.includes('inscris')) return 'dosar_depus';
  return 'draft';
}
