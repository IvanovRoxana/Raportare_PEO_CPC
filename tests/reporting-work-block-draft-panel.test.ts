import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const draftPanelSource = readFileSync(
  new URL('../components/expert/reporting-work-block-draft-panel.tsx', import.meta.url),
  'utf8',
);

test('draft work block panel prepares and persists controlled drafts', () => {
  assert.match(draftPanelSource, /export function ReportingWorkBlockDraftPanel/);
  assert.match(draftPanelSource, /useReportingWorkBlockActivityOptions/);
  assert.match(draftPanelSource, /useReportingWorkBlockDeliverableOptions/);
  assert.match(draftPanelSource, /useReportingWorkBlockDraft/);
  assert.match(draftPanelSource, /prepareDraft\(\{/);
  assert.match(draftPanelSource, /prepareSaveDraft\(\{/);
  assert.match(draftPanelSource, /saveDraft\(\{/);
  assert.match(draftPanelSource, /disabled=\{!isReadyForControlledSave \|\| isSavingDraft \|\| isWaitingForSelectedBundle\}/);
  assert.match(draftPanelSource, /controlledSaveLabel/);
  assert.doesNotMatch(draftPanelSource, /mutate\(|useSWR|\.create\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('draft work block panel exposes required Etapa 3 selection surfaces', () => {
  assert.match(draftPanelSource, /Activitati/);
  assert.match(draftPanelSource, /Livrabile/);
  assert.match(draftPanelSource, /Ore nealocate/);
  assert.match(draftPanelSource, /Livrabile neasociate/);
  assert.match(draftPanelSource, /selectedActivityIds/);
  assert.match(draftPanelSource, /selectedDeliverableIds/);
  assert.match(draftPanelSource, /allocatedHoursByActivityId/);
});

test('draft work block panel is framed as refinement after automatic activity form save', () => {
  assert.match(draftPanelSource, /Ajustare work block/);
  assert.match(draftPanelSource, /generate automat din formularul de activitate/);
  assert.match(draftPanelSource, /Work block pentru rafinare/);
  assert.match(draftPanelSource, /Ajustare manuala noua/);
  assert.match(draftPanelSource, /Corecteaza doar daca alocarea generata automat necesita ajustari/);
  assert.match(draftPanelSource, /Corecteaza doar daca livrabilele generate automat trebuie rafinate/);
});

test('draft work block panel confirms save and refreshes the persisted preview state', () => {
  assert.match(draftPanelSource, /const \[savedWorkBlockTitle, setSavedWorkBlockTitle\]/);
  assert.match(draftPanelSource, /const savedTitle = title\.trim\(\) \|\| 'Work block'/);
  assert.match(draftPanelSource, /setSelectedWorkBlockId\(savedBundle\.workBlock\.id \?\? 'new'\)/);
  assert.match(draftPanelSource, /Preview-ul se reimprospateaza din lista persistata/);
  assert.match(draftPanelSource, /Work block salvat in backend/);
});
