import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('app/api/activities/colleague-overview/route.ts', 'utf8');

test('newsletterul colegilor citeste activitatile lunare prin indexul year/month', () => {
  assert.match(source, /async function queryTable/);
  assert.match(source, /'Query'/);
  assert.match(source, /IndexName:\s*'activitiesByYearAndMonth'/);
  assert.match(source, /KeyConditionExpression:\s*'#year = :year AND #month = :month'/);
});

test('newsletterul colegilor citeste livrabilele prin indexul activityId', () => {
  assert.match(source, /IndexName:\s*'deliverablesByActivityId'/);
  assert.match(source, /KeyConditionExpression:\s*'activityId = :activityId'/);
  assert.doesNotMatch(
    source,
    /scanTable<RawItem>\('Deliverable'[\s\S]*FilterExpression:\s*'#year = :year AND #month = :month'/,
  );
});

test('newsletterul colegilor ascunde eroarea bruta AccessDenied de la DynamoDB', () => {
  assert.match(source, /function isDynamoAccessDenied/);
  assert.match(source, /AccessDeniedException\|not authorized to perform\|access denied/);
  assert.match(source, /DYNAMO_ACCESS_DENIED_MESSAGE/);
  assert.match(source, /COGNITO_SYNC_AWS_\*/);
});
