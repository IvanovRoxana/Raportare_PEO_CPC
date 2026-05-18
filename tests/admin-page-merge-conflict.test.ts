import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminPageSource = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('pagina admin nu contine markere de conflict Git', () => {
  assert.doesNotMatch(adminPageSource, /^<<<<<<< /m);
  assert.doesNotMatch(adminPageSource, /^=======\s*$/m);
  assert.doesNotMatch(adminPageSource, /^>>>>>>> /m);
});

test('pagina admin pastreaza componenta ViewAsExpertPanel dupa rezolvarea conflictelor', () => {
  assert.match(adminPageSource, /import \{ ViewAsExpertPanel \} from '@\/components\/admin\/view-as-expert-panel';/);
  assert.match(adminPageSource, /<ViewAsExpertPanel experts=\{experts as Expert\[\]\} \/>/);
});
