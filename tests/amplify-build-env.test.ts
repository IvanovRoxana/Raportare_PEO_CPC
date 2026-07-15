import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const amplifyYaml = readFileSync('amplify.yml', 'utf8');

test('Amplify build forwards deterministic Anexa 10 DOCX flag into Next.js build env', () => {
  assert.match(amplifyYaml, /NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX/);
  assert.match(
    amplifyYaml,
    /printf "NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX=%s\\n" "\$NEXT_PUBLIC_ENABLE_ANEXA10_DETERMINISTIC_DOCX" >> \.env\.production/,
  );
});
