import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storageResource = readFileSync('amplify/storage/resource.ts', 'utf8');

test('project storage uses one non-overlapping access path', () => {
  assert.match(storageResource, /"projects\/\*"/);
  assert.match(storageResource, /"projects\/\*\/documents\/\*"/);
  assert.doesNotMatch(storageResource, /"projects\/\{entity_id\}\//);
});

test('project storage retains existing authenticated and admin permissions', () => {
  const projectRule = storageResource.match(/"projects\/\*": \[([\s\S]*?)\n    \],/)?.[1] ?? '';
  const projectDocumentsRule = storageResource.match(/"projects\/\*\/documents\/\*": \[([\s\S]*?)\n    \],/)?.[1] ?? '';
  assert.match(projectRule, /allow\.authenticated\.to\(\["read", "write"\]\)/);
  assert.match(projectRule, /allow\.groups\(\["pm", "admin"\]\)\.to\(\["read", "write", "delete"\]\)/);
  assert.match(projectDocumentsRule, /allow\.authenticated\.to\(\["read", "write"\]\)/);
  assert.match(projectDocumentsRule, /allow\.groups\(\["pm", "admin"\]\)\.to\(\["read", "write", "delete"\]\)/);
});
