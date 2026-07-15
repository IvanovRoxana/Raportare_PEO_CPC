import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const amplifyYaml = readFileSync('amplify.yml', 'utf8');

test('Amplify build forwards experimental reporting flags into Next.js build env', () => {
  for (const flag of [
    'NEXT_PUBLIC_ENABLE_REPORTING_WORK_BLOCKS',
    'NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX',
  ]) {
    assert.match(amplifyYaml, new RegExp(flag));
    assert.match(
      amplifyYaml,
      new RegExp(`printf "${flag}=%s\\\\n" "\\$${flag}" >> \\.env\\.production`),
    );
  }
});
