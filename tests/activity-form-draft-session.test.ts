import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const expertPeoPageSource = readFileSync(
  new URL('../app/expert/peo/page.tsx', import.meta.url), 'utf8',
).replace(/\r\n/g, '\n');
const formKeySource = expertPeoPageSource.match(
  /const formKey = editingActivity[\s\S]*?;\n  const activityFormElement/,
)?.[0] ?? '';

test('formularul nou foloseste identitatea stabila a sesiunii de draft', () => {
  assert.match(expertPeoPageSource, /const \[draftSessionId, setDraftSessionId\] = useState\(0\);/);
  assert.match(formKeySource, /`new-\$\{draftSessionId\}-\$\{activityResolutionHint\?\.id \|\| 'manual'\}`/);
  assert.doesNotMatch(formKeySource, /selectedDates/);
});

test('editarea si precompletarea isi pastreaza identitatile de flux', () => {
  assert.match(formKeySource, /`edit-\$\{editingActivity\.id\}-\$\{activityResolutionHint\?\.id \|\| 'manual'\}`/);
  assert.match(
    formKeySource,
    /`prefill-\$\{pendingSharedActivityRelationIds\.join\('\|'\) \|\| pendingSharedActivityRelationId \|\| pendingSharedDeliverableRelationId \|\| draftSessionId\}`/,
  );
});

test('schimbarea datelor intr-un formular deschis nu incepe o sesiune noua', () => {
  const selectDatesSource = expertPeoPageSource.match(
    /const handleSelectDates = \([\s\S]*?\n  \};\n\n  const isLoading/,
  )?.[0] ?? '';

  assert.match(selectDatesSource, /if \(!showForm\) \{\s*setDraftSessionId\(\(current\) => current \+ 1\);\s*\}/);
  assert.doesNotMatch(selectDatesSource, /setDraftSessionId[\s\S]*syncSelectedDates/);
});
