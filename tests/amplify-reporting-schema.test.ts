import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schemaSource = readFileSync(new URL('../amplify/data/resource.ts', import.meta.url), 'utf8');

test('schema adauga modelele reporting work-block fara sa elimine relatia legacy Activity-Deliverable', () => {
  assert.match(schemaSource, /ReportingWorkBlock:\s*a\s*\n\s*\.model/);
  assert.match(schemaSource, /WorkBlockActivityLink:\s*a\s*\n\s*\.model/);
  assert.match(schemaSource, /WorkBlockDeliverableLink:\s*a\s*\n\s*\.model/);
  assert.match(schemaSource, /ActivityMapping:\s*a\s*\n\s*\.model/);
  assert.match(schemaSource, /activityId:\s*a\.id\(\)\.required\(\)/);
  assert.match(schemaSource, /deliverables:\s*a\.hasMany\("Deliverable",\s*"activityId"\)/);
});

test('schema extinde livrabilele pentru sumarizare fara sa dubleze campurile document existente', () => {
  assert.match(schemaSource, /extractedSummary:\s*a\.json\(\)/);
  assert.match(schemaSource, /confirmedReportingData:\s*a\.json\(\)/);
  assert.match(schemaSource, /summaryStatus:\s*a\.string\(\)/);
  assert.match(schemaSource, /summaryVersion:\s*a\.integer\(\)/);
  assert.match(schemaSource, /summaryGeneratedAt:\s*a\.datetime\(\)/);
  assert.match(schemaSource, /workBlockLinks:\s*a\.hasMany\("WorkBlockDeliverableLink",\s*"deliverableId"\)/);
});
