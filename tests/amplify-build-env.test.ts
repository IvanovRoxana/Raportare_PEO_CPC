import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const amplifyYaml = readFileSync('amplify.yml', 'utf8');

test('Amplify deploys the Gen 2 backend before building the frontend', () => {
  const backendDeploy = 'npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID';
  assert.match(amplifyYaml, /^backend:/m);
  assert.ok(amplifyYaml.includes(backendDeploy));
  assert.ok(amplifyYaml.indexOf(backendDeploy) < amplifyYaml.indexOf('npm run build'));
});

test('Amplify build forwards required feature and environment flags', () => {
  for (const flag of [
    'NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS',
    'NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX',
    'APP_ENV',
    'NEXT_PUBLIC_APP_ENV',
    'NEXT_PUBLIC_ENABLE_FINANCIAL_TIMESHEETS',
    'NEXT_PUBLIC_ENABLE_FINANCIAL_LEAVE',
  ]) {
    assert.ok(amplifyYaml.includes('printf "' + flag + '=%s\\n" "$' + flag + '" >> .env.production'));
  }
});
