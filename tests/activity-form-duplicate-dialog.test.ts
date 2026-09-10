import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activityFormSource = readFileSync(
  new URL('../components/expert/activity-form.tsx', import.meta.url),
  'utf8',
);

test('dialogul de duplicat dezactiveaza activitatile incompatibile', () => {
  assert.match(activityFormSource, /disabled=\{!choice\.isCompatible\}/);
  assert.match(activityFormSource, /Incompatibila cu activitatea curenta/);
});

test('confirmarea duplicatului ramane blocata fara o selectie compatibila', () => {
  assert.match(
    activityFormSource,
    /choice\.id === monthlyDeliverableDuplicateConfirmation\.sourceActivityId && choice\.isCompatible/,
  );
});

test('handlerul revalideaza compatibilitatea inainte de grupare', () => {
  assert.match(
    activityFormSource,
    /const selectedDuplicateChoice = duplicateChoices\.find[\s\S]*if \(!selectedDuplicateChoice\?\.isCompatible\)/,
  );
});

test('observatiile de duplicat compara si documentele colegilor', () => {
  assert.match(
    activityFormSource,
    /const duplicateReferenceDocuments = useMemo\(\(\) => \{[\s\S]*\[\.\.\.documents, \.\.\.colleagueDocuments\]/,
  );
  assert.match(
    activityFormSource,
    /findDuplicateCandidates\(duplicateReferenceDocuments,/,
  );
});
