import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeAuthenticatedUploadPath } from '../lib/authenticated-storage.ts';

const storageResource = readFileSync('amplify/storage/resource.ts', 'utf8');
const authenticatedStorageSource = readFileSync('lib/authenticated-storage.ts', 'utf8');
const clientUploadSources = [
  'app/gt/page.tsx',
  'components/admin/historical-import-panel.tsx',
  'components/expert/activity-form.tsx',
  'components/expert/monthly-evidence-panel.tsx',
  'components/expert/monthly-report-export.tsx',
].map((filePath) => [filePath, readFileSync(filePath, 'utf8')] as const);

test('project storage uses one non-overlapping access path', () => {
  assert.match(storageResource, /"projects\/\*"/);
  assert.match(storageResource, /"projects\/\{project_id\}\/documents\/\*"/);
  assert.doesNotMatch(storageResource, /"projects\/\{entity_id\}\//);
  assert.doesNotMatch(storageResource, /"documents\/\*"/);
});

test('project storage retains existing authenticated and admin permissions', () => {
  const projectRule = storageResource.match(/"projects\/\*": \[([\s\S]*?)\n    \],/)?.[1] ?? '';
  const projectDocumentsRule = storageResource.match(/"projects\/\{project_id\}\/documents\/\*": \[([\s\S]*?)\n    \],/)?.[1] ?? '';
  assert.match(projectRule, /allow\.authenticated\.to\(\["read", "write"\]\)/);
  assert.match(projectRule, /allow\.groups\(\["pm", "admin"\]\)\.to\(\["read", "write", "delete"\]\)/);
  assert.match(projectDocumentsRule, /allow\.authenticated\.to\(\["read", "write"\]\)/);
  assert.match(projectDocumentsRule, /allow\.groups\(\["pm", "admin"\]\)\.to\(\["read", "write", "delete"\]\)/);
});

test('client uploads refresh authenticated storage credentials before PutObject', () => {
  assert.match(authenticatedStorageSource, /fetchAuthSession\(\{ forceRefresh: true \}\)/);
  assert.match(authenticatedStorageSource, /!session\.tokens \|\| !session\.credentials/);
  assert.match(authenticatedStorageSource, /normalizeAuthenticatedUploadPath\(input\.path, session\.identityId\)/);
  assert.match(authenticatedStorageSource, /uploadData\(normalizedInput as any\)\.result/);

  for (const [filePath, source] of clientUploadSources) {
    assert.match(source, /uploadAuthenticatedData/);
    assert.doesNotMatch(source, /import \{ uploadData \} from 'aws-amplify\/storage'/, filePath);
  }
});

test('authenticated upload wrapper rewrites legacy deliverable paths under identity', () => {
  assert.equal(
    normalizeAuthenticatedUploadPath(
      'deliverables/doc_deliv_1788169055883_1zu0x03q4/file.jpeg',
      'eu-north-1:identity-123',
    ),
    'deliverables/eu-north-1:identity-123/doc_deliv_1788169055883_1zu0x03q4/file.jpeg',
  );

  assert.equal(
    normalizeAuthenticatedUploadPath(
      'deliverables/eu-north-1:identity-123/documents/doc_1/file.jpeg',
      'eu-north-1:identity-123',
    ),
    'deliverables/eu-north-1:identity-123/documents/doc_1/file.jpeg',
  );

  assert.equal(
    normalizeAuthenticatedUploadPath('projects/302141/documents/doc_1/file.jpeg', 'eu-north-1:identity-123'),
    'projects/302141/documents/doc_1/file.jpeg',
  );
});

test('expert deliverable uploads use identity-scoped storage paths', () => {
  const activityFormSource = readFileSync('components/expert/activity-form.tsx', 'utf8');
  assert.match(activityFormSource, /getAuthenticatedStorageIdentityId/);
  assert.match(activityFormSource, /buildIdentityDocumentS3Key/);
  assert.doesNotMatch(activityFormSource, /buildDocumentS3Key/);
});
