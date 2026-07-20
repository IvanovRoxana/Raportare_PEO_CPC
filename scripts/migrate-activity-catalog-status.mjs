#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const profile = process.env.AWS_PROFILE || 'raportarepeo';
const region = process.env.AWS_REGION || 'eu-north-1';
const aws = process.env.AWS_CLI || 'aws';
const awsArgs = (...args) => [...args, '--profile', profile, '--region', region, '--output', 'json'];
const run = (...args) => execFileSync(aws, awsArgs(...args), { encoding: 'utf8' });

const tables = JSON.parse(run('dynamodb', 'list-tables')).TableNames || [];
const matches = tables.filter((name) => name.includes('ActivityCatalog'));
if (matches.length !== 1) {
  throw new Error(`Expected exactly one ActivityCatalog table, found ${matches.length}: ${matches.join(', ')}`);
}

const tableName = matches[0];
let lastKey;
let migrated = 0;

do {
  const args = ['dynamodb', 'scan', '--table-name', tableName, '--projection-expression', 'id,isActive'];
  if (lastKey) args.push('--exclusive-start-key', JSON.stringify(lastKey));
  const page = JSON.parse(run(...args));
  for (const item of page.Items || []) {
    if (item.isActive) continue;
    run(
      'dynamodb', 'update-item',
      '--table-name', tableName,
      '--key', JSON.stringify({ id: item.id }),
      '--update-expression', 'SET isActive = :active, updatedAt = :updatedAt',
      '--expression-attribute-values', JSON.stringify({
        ':active': { BOOL: true },
        ':updatedAt': { S: new Date().toISOString() },
      }),
    );
    migrated += 1;
  }
  lastKey = page.LastEvaluatedKey;
} while (lastKey);

console.log(`Migration complete: ${migrated} ActivityCatalog rows marked active in ${tableName}.`);
