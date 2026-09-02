import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { dedupeOrganizations, normalizeOrganizationImportRows } from '../lib/grup-tinta/import.ts';
import { computeGTIndicators } from '../lib/grup-tinta/indicators.ts';
import { canCreateGTEntityFromOrganization, getChildOrganizations, getCpcAffiliatedOrganizations, getGTEntityForOrganization } from '../lib/grup-tinta/directory.ts';
import { canValidatePerson } from '../lib/grup-tinta/workflow.ts';
import type { GTDocument, GTEntity, GTPerson, Organization } from '../lib/grup-tinta/types.ts';

test('normalizarea importului pastreaza ierarhia federatie -> organizatie -> companie si deduplica pe CUI', () => {
  const rows = normalizeOrganizationImportRows([
    {
      sheetName: 'Date brut',
      rows: [
        {
          Compania: 'ACME SRL',
          CUI: 'RO123',
          'Număr salariați Inspecția Muncii': '25',
          'Organizația Patronală': 'OP Test',
          'Federația Patronală': 'Fed Test',
        },
        {
          Compania: 'ACME S.R.L.',
          CUI: '123',
          'Număr salariați Inspecția Muncii': '25',
          'Organizația Patronală': 'OP Test',
          'Federația Patronală': 'Fed Test',
        },
      ],
    },
  ]);

  const { organizations, duplicates } = dedupeOrganizations(rows);
  const company = organizations.find((item) => item.kind === 'companie');
  const patronal = organizations.find((item) => item.kind === 'organizatie_patronala');
  const federation = organizations.find((item) => item.kind === 'federatie');

  assert.equal(organizations.filter((item) => item.kind === 'companie').length, 1);
  assert.equal(duplicates.length, 3);
  assert.equal(company?.cui, '123');
  assert.equal(company?.parentOrganizationId, patronal?.id);
  assert.equal(patronal?.parentOrganizationId, federation?.id);
});

test('CPC ALL produce entitati directe cu statusurile manuale pastrate pentru mapare GT', () => {
  const rows = normalizeOrganizationImportRows([
    {
      sheetName: 'CPC ALL',
      rows: [
        {
          'DENUMIRE ': 'Federatia Test',
          'FORMĂ DE ORGANIZARE ': 'Federație patronală',
          'Inscrisi in GT': 'DA',
          'Sedinta de informare': 'DA',
        },
      ],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'federatie');
  assert.equal(rows[0].gtSourceStatusText, 'DA');
  assert.equal(rows[0].informationSessionText, 'DA');
});

test('directorul GT afiseaza organizatiile CPC ca radacini si companiile ca detaliu copil', () => {
  const affiliate: Organization = {
    id: 'org_fpe',
    name: 'Federatia Patronala a Energiei (FPE)',
    normalizedName: 'federatia patronala a energiei fpe',
    kind: 'federatie',
    status: 'active',
    sourceSheet: 'CPC ALL',
  };
  const child: Organization = {
    id: 'org_company',
    name: 'AMROMCO ENERGY SRL',
    normalizedName: 'amromco energy srl',
    kind: 'companie',
    status: 'active',
    cui: '16354101',
    federationName: affiliate.name,
    sourceSheet: 'Date brut',
  };
  const unrelated: Organization = {
    id: 'org_other',
    name: 'Alta companie',
    normalizedName: 'alta companie',
    kind: 'companie',
    status: 'active',
    sourceSheet: 'Date brut',
  };

  assert.deepEqual(getCpcAffiliatedOrganizations([child, unrelated, affiliate]).map((item) => item.id), ['org_fpe']);
  assert.deepEqual(getChildOrganizations(affiliate, [child, unrelated, affiliate]).map((item) => item.id), ['org_company']);
});

test('inscrierea in GT este blocata daca organizatia are deja entitate GT', () => {
  const organization: Organization = {
    id: 'org_fpe',
    name: 'Federatia Patronala a Energiei',
    normalizedName: 'federatia patronala a energiei',
    kind: 'federatie',
    status: 'active',
    sourceSheet: 'CPC ALL',
  };
  const entity: GTEntity = {
    id: 'gt_org_fpe',
    organizationId: organization.id,
    organizationName: organization.name,
    status: 'dosar_depus',
  };

  assert.equal(getGTEntityForOrganization(organization.id, [entity])?.id, entity.id);
  assert.equal(canCreateGTEntityFromOrganization(organization, [entity]), false);
  assert.equal(canCreateGTEntityFromOrganization(organization, []), true);
});

test('validarea persoanei este blocata cand entitatea parinte nu este validata', () => {
  const entity: GTEntity = {
    id: 'e1',
    organizationId: 'o1',
    status: 'in_verificare',
  };
  const person: GTPerson = {
    id: 'p1',
    gtEntityId: 'e1',
    nume: 'Popescu',
    prenume: 'Ana',
    status: 'dosar_depus',
    consimtamantGDPRAt: '2026-07-01T10:00:00.000Z',
  };
  const documents = validPersonDocuments();

  const result = canValidatePerson(person, entity, documents);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Entitatea parinte nu este inca validata in GT.');
});

test('indicatorii GT respecta relatiile 5SR04 <= 5SO04 si 5SR01 <= 5SO01', () => {
  const indicators = computeGTIndicators(
    [
      { id: 'e1', organizationId: 'o1', status: 'in_operatiune', dataIntrareOperatiune: '2026-07-01', indicator5SR04: true },
      { id: 'e2', organizationId: 'o2', status: 'draft', indicator5SR04: true },
    ],
    [
      { id: 'p1', gtEntityId: 'e1', nume: 'A', prenume: 'B', status: 'in_operatiune', dataIntrareOperatiune: '2026-07-01', indicator5SR01: true },
      { id: 'p2', gtEntityId: 'e1', nume: 'C', prenume: 'D', status: 'draft', indicator5SR01: true },
    ],
  );

  assert.equal(indicators['5SO04'].value, 1);
  assert.equal(indicators['5SR04'].value, 2);
  assert.equal(indicators['5SR04'].valid, false);
  assert.equal(indicators['5SO01'].value, 1);
  assert.equal(indicators['5SR01'].value, 2);
  assert.equal(indicators['5SR01'].valid, false);
});

test('sincronizarea jurnalului GT din activitati ramane separata de registrul central', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib', 'aws-store.ts'), 'utf8');
  const createStart = source.indexOf('...(activity.grupTinta ?? []).map');
  const createEnd = source.indexOf('return attachActivityChildren(created.data);', createStart);
  const updateStart = source.indexOf('if (updates.grupTinta) {');
  const updateEnd = source.indexOf('async delete(id: string): Promise<void>', updateStart);
  assert.notEqual(createStart, -1);
  assert.notEqual(createEnd, -1);
  assert.notEqual(updateStart, -1);
  assert.notEqual(updateEnd, -1);

  const createSnippet = source.slice(createStart, createEnd);
  const updateSnippet = source.slice(updateStart, updateEnd);

  assert.match(createSnippet, /client\.models\.GrupTintaEntry\.create/);
  assert.match(updateSnippet, /client\.models\.GrupTintaEntry\.create/);
  assert.doesNotMatch(`${createSnippet}\n${updateSnippet}`, /client\.models\.(GTEntity|GTPerson)\.(create|update|delete)/);
});

test('workbookul Date membrii CPC poate fi normalizat fara duplicate CUI in directorul canonic', { skip: !fs.existsSync(workbookPath()) }, async () => {
  const xlsxModule = await import('xlsx');
  const xlsx = xlsxModule.default ?? xlsxModule;
  const workbook = xlsx.readFile(workbookPath());
  const sheets = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false }) as Record<string, unknown>[],
  }));

  const normalized = normalizeOrganizationImportRows(sheets);
  const { organizations, duplicates } = dedupeOrganizations(normalized);
  const cpcAllCount = normalized.filter((item) => item.sourceSheet === 'CPC ALL').length;
  const canonicalCuis = organizations.filter((item) => item.cui).map((item) => item.cui);

  assert.equal(cpcAllCount, 20);
  assert.equal(new Set(canonicalCuis).size, canonicalCuis.length);
  assert.ok(duplicates.length > 0);
  assert.ok(organizations.length >= 4241);
});

function validPersonDocuments(): GTDocument[] {
  return [
    'formular_inregistrare_gt',
    'carte_identitate',
    'declaratie_apartenenta_incompatibilitate',
    'cerere_inscriere_angajament',
    'consimtamant_gdpr',
    'declaratie_evitare_dubla_finantare',
    'adeverinta_salariat_reprezentare',
    'diploma_studii',
  ].map((documentType) => ({
    id: documentType,
    subjectType: 'person',
    gtPersonId: 'p1',
    documentType,
    status: 'validat',
  }));
}

function workbookPath() {
  return path.join(
    'C:',
    'Users',
    'RoxanaIvanov',
    'OneDrive - Confederatia Patronala Concordia',
    'PEO 2024-2028 - Documents',
    'General',
    'RAPORTARE_TEHNICA',
    'SA1.1_Grup Tinta',
    'IVANOV ROXANA',
    'Monitorizare',
    'Date membrii CPC.xlsx',
  );
}
