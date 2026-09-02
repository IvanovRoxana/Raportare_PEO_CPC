import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clarificationsPageSource = readFileSync(
  new URL('../app/expert/clarificari/page.tsx', import.meta.url),
  'utf8',
);

test('pagina de clarificari lunare foloseste flow-ul curent de redeschidere PM', () => {
  assert.match(clarificationsPageSource, /isReportOpenForCorrection/);
  assert.match(clarificationsPageSource, /Corectează pontajul, apoi folosește butonul „Retrimite după corecții” din pontaj\./);
  assert.match(clarificationsPageSource, /Corectează în pontaj/);
  assert.match(clarificationsPageSource, /Acces editare închis/);
  assert.doesNotMatch(clarificationsPageSource, /Retrimite din pontaj/);
});

test('clarificarea lunara fara activitati punctuale are mesaj dedicat', () => {
  assert.match(clarificationsPageSource, /Clarificarea este lunară/);
  assert.match(clarificationsPageSource, /PM nu a marcat o activitate anume/);
});
