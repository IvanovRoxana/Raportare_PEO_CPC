import type { ActivityCatalog } from '@/lib/types';

export const ACTIVITY_CATALOG_EXPORT_HEADERS = [
  'ID catalog',
  'Categorie expert',
  'Subactivitate',
  'Nr. activitate',
  'Nume activitate',
  'Categorie serviciu',
  'Este eveniment',
  'Activ',
  'Descriere',
  'Obiective',
  'Componenta serviciu',
  'Beneficiari',
  'Rezultate asteptate',
  'Livrabile asteptate',
  'Indicatori',
] as const;

export type ActivityCatalogImportAction = 'create' | 'update' | 'unchanged';

export interface ActivityCatalogImportRow {
  rowNumber: number;
  source: Record<(typeof ACTIVITY_CATALOG_EXPORT_HEADERS)[number], string>;
  draft: Omit<ActivityCatalog, 'id' | 'createdAt'>;
  id?: string;
  stableKey: string;
}

export interface ActivityCatalogImportDiff {
  action: ActivityCatalogImportAction;
  row: ActivityCatalogImportRow;
  existing?: ActivityCatalog;
  changedFields: Array<keyof Omit<ActivityCatalog, 'id' | 'createdAt'>>;
}

export interface ActivityCatalogImportPlan {
  rows: ActivityCatalogImportRow[];
  diffs: ActivityCatalogImportDiff[];
  errors: string[];
  warnings: string[];
}

const REQUIRED_HEADER_SET = new Set<string>(ACTIVITY_CATALOG_EXPORT_HEADERS);

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim();
}

function normalizeKeyPart(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function getActivityCatalogStableKey(item: Pick<ActivityCatalog, 'category' | 'saCode' | 'activityName'>) {
  return [
    normalizeKeyPart(item.category),
    normalizeKeyPart(item.saCode).toUpperCase(),
    normalizeKeyPart(item.activityName),
  ].join('|');
}

function parseActive(value: string) {
  const normalized = normalizeKeyPart(value);
  if (!normalized || ['da', 'yes', 'true', '1', 'activ', 'active'].includes(normalized)) return true;
  if (['nu', 'no', 'false', '0', 'inactiv', 'inactive'].includes(normalized)) return false;
  return null;
}

function parseOptionalBoolean(value: string) {
  const normalized = normalizeKeyPart(value);
  if (!normalized) return undefined;
  if (['da', 'yes', 'true', '1', 'activ', 'active'].includes(normalized)) return true;
  if (['nu', 'no', 'false', '0', 'inactiv', 'inactive'].includes(normalized)) return false;
  return null;
}

function normalizeDraft(row: Record<(typeof ACTIVITY_CATALOG_EXPORT_HEADERS)[number], string>): Omit<ActivityCatalog, 'id' | 'createdAt'> | null {
  const isActive = parseActive(row.Activ);
  const isEvent = parseOptionalBoolean(row['Este eveniment']);
  if (isActive === null || isEvent === null) return null;

  return {
    category: row['Categorie expert'].trim().toLowerCase(),
    saCode: row.Subactivitate.trim().toUpperCase(),
    activityNumber: Number(row['Nr. activitate']) || 0,
    activityName: row['Nume activitate'].trim(),
    serviceCategory: row['Categorie serviciu'].trim(),
    isEvent,
    isActive,
    description: row.Descriere.trim(),
    objectives: row.Obiective.trim(),
    serviceComponent: row['Componenta serviciu'].trim(),
    beneficiaries: row.Beneficiari.trim(),
    expectedResults: row['Rezultate asteptate'].trim(),
    deliverables: row['Livrabile asteptate'].trim(),
    indicators: row.Indicatori.trim(),
  };
}

export function exportActivityCatalogCsv(catalog: ActivityCatalog[]) {
  const rows = catalog.map((item) => [
    item.id,
    item.category,
    item.saCode,
    item.activityNumber,
    item.activityName,
    item.serviceCategory,
    item.isEvent === undefined ? '' : item.isEvent ? 'Da' : 'Nu',
    item.isActive === false ? 'Nu' : 'Da',
    item.description,
    item.objectives,
    item.serviceComponent,
    item.beneficiaries,
    item.expectedResults,
    item.deliverables,
    item.indicators,
  ]);

  return [
    ACTIVITY_CATALOG_EXPORT_HEADERS.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\r\n');
}

export function buildActivityCatalogImportPlan(csv: string, existingCatalog: ActivityCatalog[]): ActivityCatalogImportPlan {
  const parsedRows = parseCsvRows(csv);
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ActivityCatalogImportRow[] = [];

  if (parsedRows.length === 0) {
    return { rows, diffs: [], errors: ['Fisierul importat nu contine randuri.'], warnings };
  }

  const headers = parsedRows[0].map(normalizeHeader);
  const missingHeaders = ACTIVITY_CATALOG_EXPORT_HEADERS.filter((header) => !headers.includes(header));
  const unknownHeaders = headers.filter((header) => header && !REQUIRED_HEADER_SET.has(header));
  if (missingHeaders.length > 0) errors.push(`Lipsesc coloane obligatorii: ${missingHeaders.join(', ')}.`);
  if (unknownHeaders.length > 0) errors.push(`Fisierul contine coloane necunoscute: ${unknownHeaders.join(', ')}.`);
  if (errors.length > 0) return { rows, diffs: [], errors, warnings };

  const existingById = new Map(existingCatalog.map((item) => [item.id, item]));
  const existingByStableKey = new Map<string, ActivityCatalog>();
  const duplicateExistingKeys = new Set<string>();
  existingCatalog.forEach((item) => {
    const key = getActivityCatalogStableKey(item);
    if (existingByStableKey.has(key)) duplicateExistingKeys.add(key);
    existingByStableKey.set(key, item);
  });

  const seenImportKeys = new Set<string>();
  parsedRows.slice(1).forEach((values, index) => {
    const source = Object.fromEntries(
      ACTIVITY_CATALOG_EXPORT_HEADERS.map((header) => [header, values[headers.indexOf(header)]?.trim() ?? '']),
    ) as Record<(typeof ACTIVITY_CATALOG_EXPORT_HEADERS)[number], string>;
    const draft = normalizeDraft(source);
    const rowNumber = index + 2;

    if (!draft) {
      errors.push(`Randul ${rowNumber}: valoarea din coloana Activ trebuie sa fie Da/Nu.`);
      return;
    }
    if (!draft.category || !draft.saCode || !draft.activityName) {
      errors.push(`Randul ${rowNumber}: categoria, subactivitatea si numele activitatii sunt obligatorii.`);
      return;
    }

    const stableKey = getActivityCatalogStableKey(draft);
    if (seenImportKeys.has(stableKey)) {
      errors.push(`Randul ${rowNumber}: activitate duplicata in import pentru ${draft.saCode} / ${draft.activityName}.`);
      return;
    }
    if (duplicateExistingKeys.has(stableKey) && !source['ID catalog']) {
      errors.push(`Randul ${rowNumber}: cheia ${draft.saCode} / ${draft.activityName} exista de mai multe ori in catalog; pastreaza ID catalog.`);
      return;
    }

    seenImportKeys.add(stableKey);
    rows.push({ rowNumber, source, draft, id: source['ID catalog'] || undefined, stableKey });
  });

  if (errors.length > 0) return { rows, diffs: [], errors, warnings };

  const diffFields: Array<keyof Omit<ActivityCatalog, 'id' | 'createdAt'>> = [
    'category',
    'saCode',
    'activityNumber',
    'activityName',
    'serviceCategory',
    'isEvent',
    'isActive',
    'description',
    'objectives',
    'serviceComponent',
    'beneficiaries',
    'expectedResults',
    'deliverables',
    'indicators',
  ];

  const diffs = rows.map((row): ActivityCatalogImportDiff => {
    const existing = row.id ? existingById.get(row.id) : existingByStableKey.get(row.stableKey);
    if (!existing) return { action: 'create', row, changedFields: diffFields };

    const changedFields = diffFields.filter((field) => {
      const left = row.draft[field];
      const right = existing[field];
      return String(left ?? '') !== String(right ?? '');
    });

    return {
      action: changedFields.length > 0 ? 'update' : 'unchanged',
      row,
      existing,
      changedFields,
    };
  });

  const omittedCount = Math.max(0, existingCatalog.length - diffs.filter((diff) => diff.existing).length);
  if (omittedCount > 0) {
    warnings.push(`${omittedCount} activitati existente nu apar in fisier si nu vor fi sterse.`);
  }

  return { rows, diffs, errors, warnings };
}
