import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(authenticatedStorageSource, /uploadData\(input as any\)\.result/);

  for (const [filePath, source] of clientUploadSources) {
    assert.match(source, /uploadAuthenticatedData/);
    assert.doesNotMatch(source, /import \{ uploadData \} from 'aws-amplify\/storage'/, filePath);
  }
});
