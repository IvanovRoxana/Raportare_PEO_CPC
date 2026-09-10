import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const awsStoreSource = readFileSync(new URL('../lib/aws-store.ts', import.meta.url), 'utf8');

function getActivityUpdateSource() {
  const startMarker = 'async update(id: string, updates: Partial<Activity>): Promise<void>';
  const endMarker = 'async delete(id: string): Promise<void>';
  const start = awsStoreSource.indexOf(startMarker);
  const end = awsStoreSource.indexOf(endMarker, start);

  assert.notEqual(start, -1, 'Nu a fost gasita metoda activitiesService.update');
  assert.notEqual(end, -1, 'Nu a fost gasita limita metodei activitiesService.update');
  return awsStoreSource.slice(start, end);
}

function getActivityMethodSource(startMarker: string, endMarker: string) {
  const start = awsStoreSource.indexOf(startMarker);
  const end = awsStoreSource.indexOf(endMarker, start);

  assert.notEqual(start, -1, `Nu a fost gasita metoda ${startMarker}`);
  assert.notEqual(end, -1, `Nu a fost gasita limita metodei ${startMarker}`);
  return awsStoreSource.slice(start, end);
}

test('CRUD-ul livrabilelor din update citeste starea existenta prin indexul activityId', () => {
  const updateSource = getActivityUpdateSource();

  assert.match(updateSource, /planDeliverableSync\(/);
  assert.match(updateSource, /listDeliverablesByActivityId<any>\(client\.models\.Deliverable, id\)/);
  assert.doesNotMatch(
    updateSource,
    /listModel<any>\(client\.models\.Deliverable, \{ activityId:/,
  );
});

test('payloadurile Document si Deliverable omit campurile undefined la scriere', () => {
  const documentMetadataSource = getActivityMethodSource(
    'async function createDocumentMetadataForDeliverable(',
    'function mapBusinessHubEntityDirectoryEntry',
  );
  const deliverablePayloadSource = getActivityMethodSource(
    'function buildDeliverableWritePayload(',
    'function withSupportedActivityShareFields',
  );

  assert.match(documentMetadataSource, /const payload = omitUndefinedFields\(\{/);
  assert.match(documentMetadataSource, /client\.models\.Document\.create\(payload\)/);
  assert.match(deliverablePayloadSource, /return omitUndefinedFields\(withSupportedDeliverableFields\(\{/);
});

test('payloadurile Document si Deliverable limiteaza textul extras persistat', () => {
  const documentMetadataSource = getActivityMethodSource(
    'async function createDocumentMetadataForDeliverable(',
    'function mapBusinessHubEntityDirectoryEntry',
  );
  const deliverableFieldsSource = getActivityMethodSource(
    'function withSupportedDeliverableFields(',
    'function buildDeliverableWritePayload(',
  );

  assert.match(awsStoreSource, /const MAX_PERSISTED_DOCUMENT_TEXT_CHARS = 12000/);
  assert.match(awsStoreSource, /const MAX_PERSISTED_FIRST_PAGE_TEXT_CHARS = 5000/);
  assert.match(documentMetadataSource, /docText: trimPersistedDocumentText\(deliverable\.docText\)/);
  assert.match(documentMetadataSource, /firstPageText: trimPersistedDocumentText\(deliverable\.firstPageText, MAX_PERSISTED_FIRST_PAGE_TEXT_CHARS\)/);
  assert.match(deliverableFieldsSource, /docText: trimPersistedDocumentText\(deliverable\.docText\)/);
  assert.match(deliverableFieldsSource, /firstPageText: trimPersistedDocumentText\(deliverable\.firstPageText, MAX_PERSISTED_FIRST_PAGE_TEXT_CHARS\)/);
});

test('diagnosticul pentru upload pending este persistat pe livrabil', () => {
  const deliverableFieldsSource = getActivityMethodSource(
    'function withSupportedDeliverableFields(',
    'function buildDeliverableWritePayload(',
  );
  const mapDeliverableSource = getActivityMethodSource(
    'function mapDeliverable(',
    'function mapDocument(',
  );

  assert.match(deliverableFieldsSource, /uploadError: deliverable\.uploadError/);
  assert.match(mapDeliverableSource, /uploadError: item\.uploadError \?\? undefined/);
});

test('scrierile activitatilor verifica autorizarea Expert/PM inainte de sincronizarea livrabilelor', () => {
  const createSource = getActivityMethodSource(
    "async create(activity: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Activity>",
    "async createBatch(activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Activity[]>",
  );
  const createBatchSource = getActivityMethodSource(
    "async createBatch(activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Activity[]>",
    'async createWithAdminOverride(',
  );
  const updateSource = getActivityUpdateSource();
  const deleteSource = getActivityMethodSource(
    'async delete(id: string): Promise<void>',
    'async deleteByDates(expertId: string, dates: string[]): Promise<void>',
  );

  assert.match(createSource, /await assertCanAccessExpert\(client, activity\.expertId\)/);
  assert.match(createBatchSource, /activities\.map\(\(activity\) => assertCanAccessExpert\(client, activity\.expertId\)\)/);

  assert.match(updateSource, /await assertCanAccessExpert\(client, existing\.data\.expertId\)/);
  assert.match(updateSource, /updates\.expertId && updates\.expertId !== existing\.data\.expertId/);
  assert.match(updateSource, /await assertCanAccessExpert\(client, updates\.expertId\)/);
  assert.ok(
    updateSource.indexOf('await assertCanAccessExpert(client, existing.data.expertId)')
      < updateSource.indexOf('if (preparedUpdates.deliverables)'),
    'update trebuie sa valideze accesul la activitate inainte de CRUD pe livrabile',
  );

  assert.match(deleteSource, /await assertCanAccessExpert\(client, existing\.data\.expertId\)/);
  assert.ok(
    deleteSource.indexOf('await assertCanAccessExpert(client, existing.data.expertId)')
      < deleteSource.indexOf('client.models.Activity.delete'),
    'delete trebuie sa valideze accesul inainte de stergere',
  );
});

test('verificarea accesului accepta acelasi expert identificat prin email', () => {
  const startMarker = 'async function assertCanAccessExpert(client: any, expertId?: string | null)';
  const endMarker = 'async function getGTRegistryAccess(client: any)';
  const start = awsStoreSource.indexOf(startMarker);
  const end = awsStoreSource.indexOf(endMarker, start);

  assert.notEqual(start, -1, 'Nu a fost gasit helper-ul assertCanAccessExpert');
  assert.notEqual(end, -1, 'Nu a fost gasita limita helper-ului assertCanAccessExpert');
  const accessSource = awsStoreSource.slice(start, end);

  assert.match(accessSource, /client\.models\.Expert\.get\(\{ id: expertId \}\)/);
  assert.match(accessSource, /const targetExpert = mapExpert\(result\.data\)/);
  assert.match(accessSource, /currentEmail && currentEmail === targetEmail/);
  assert.doesNotMatch(accessSource, /currentName && currentName === targetName/);
  assert.ok(
    accessSource.indexOf('if (currentEmail && currentEmail === targetEmail)')
      < accessSource.indexOf('throw new Error(ACCESS_DENIED_MESSAGE)'),
    'identitatea echivalenta prin email trebuie acceptata inainte de refuzul accesului',
  );
});

test('createBatch trateaza throttling-ul inainte si dupa prima scriere fara retry automat pe batch partial', () => {
  const createBatchSource = getActivityMethodSource(
    "async createBatch(activities: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Activity[]>",
    'async createWithAdminOverride(',
  );

  assert.match(awsStoreSource, /function isAwsThrottlingError\(error: unknown\)/);
  assert.match(awsStoreSource, /function buildActivityBatchThrottleError\(createdCount: number, totalCount: number\)/);
  assert.match(awsStoreSource, /createdCount === 0/);
  assert.match(awsStoreSource, /dupa \$\{createdCount\}\/\$\{totalCount\} activitati create/);

  assert.match(createBatchSource, /catch \(error\)/);
  assert.match(createBatchSource, /isAwsThrottlingError\(error\)/);
  assert.match(createBatchSource, /buildActivityBatchThrottleError\(created\.length, preparedActivities\.length\)/);
  assert.doesNotMatch(createBatchSource, /setTimeout|retry|Retry|while\s*\(/);
});

test('createActivityUnchecked pastreaza activitatea creata daca sincronizarea copiilor esueaza', () => {
  const createUncheckedSource = getActivityMethodSource(
    'async function createActivityUnchecked(',
    'export const expertsService',
  );

  assert.ok(
    createUncheckedSource.indexOf('const activityId = created.data.id')
      < createUncheckedSource.indexOf('await syncSharedActivitySuggestions(client, activity, activityId)'),
    'sincronizarea copiilor trebuie sa ruleze dupa crearea activitatii',
  );
  assert.match(createUncheckedSource, /assertNoErrors\(result, 'AWS create deliverable'\)/);
  assert.doesNotMatch(createUncheckedSource, /Activity\.delete\(\{ id: activityId \}\)/);
  assert.doesNotMatch(createUncheckedSource, /rollback activity after child sync failure/);
});

test('verificarea ConditionalCheckFailedException nu apeleaza includes pe JSON.stringify(undefined)', () => {
  assert.match(
    awsStoreSource,
    /String\(JSON\.stringify\(errors\) \?\? ''\)\.includes\('ConditionalCheckFailedException'\)/,
  );
  assert.doesNotMatch(
    awsStoreSource,
    /JSON\.stringify\(errors\)\.includes\('ConditionalCheckFailedException'\)/,
  );
});

test('fluxurile pentru livrabil existent sau comun nu scaneaza Deliverable dupa activityId', () => {
  assert.match(
    awsStoreSource,
    /listDeliverablesByActivityId<any>\(client\.models\.Deliverable, targetActivity\.id\)/,
  );
  assert.match(
    awsStoreSource,
    /listDeliverablesByActivityId<any>\(client\.models\.Deliverable, activity\.id\)/,
  );
  assert.doesNotMatch(
    awsStoreSource,
    /listModel<any>\(client\.models\.Deliverable, \{ activityId:/,
  );
});
