import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDayCluster, normalizeDayClusterInput } from '../lib/activity-report/day-cluster.ts';

test('formateaza o singura zi fara ore', () => {
  assert.equal(formatDayCluster(['2026-06-02'], 'iunie', 2026), 'în 2 iunie 2026');
});

test('formateaza o singura zi cu o ora', () => {
  assert.equal(formatDayCluster([{ date: '2026-06-02', hours: 1 }], 'iunie', 2026), 'în data de 2 iunie 2026, o oră');
});

test('formateaza o singura zi cu doua ore', () => {
  assert.equal(formatDayCluster([{ date: '2026-06-02', hours: 2 }], 'iunie', 2026), 'în data de 2 iunie 2026, 2 ore');
});

test('formateaza o singura zi cu ore zecimale', () => {
  assert.equal(formatDayCluster([{ date: '2026-06-02', hours: 1.5 }], 'iunie', 2026), 'în data de 2 iunie 2026, 1,5 ore');
});

test('grupeaza zile consecutive fara ore', () => {
  assert.equal(formatDayCluster(['2026-06-10', '2026-06-11', '2026-06-12'], 'iunie', 2026), 'în 10-12 iunie 2026');
});

test('pastreaza zile neconsecutive cu separator final si', () => {
  assert.equal(formatDayCluster(['2026-06-02', '2026-06-05', '2026-06-10'], 'iunie', 2026), 'în 2, 5 și 10 iunie 2026');
});

test('combina intervale consecutive si zile izolate', () => {
  assert.equal(formatDayCluster(['2026-06-02', '2026-06-03', '2026-06-07', '2026-06-10', '2026-06-11'], 'iunie', 2026), 'în 2-3, 7 și 10-11 iunie 2026');
});

test('sorteaza zilele indiferent de ordinea inputului', () => {
  assert.equal(formatDayCluster(['2026-06-10', '2026-06-02', '2026-06-05'], 'iunie', 2026), 'în 2, 5 și 10 iunie 2026');
});

test('deduplica zilele fara ore', () => {
  assert.equal(formatDayCluster(['2026-06-02', '2026-06-02', '2026-06-03'], 'iunie', 2026), 'în 2-3 iunie 2026');
});

test('sumeaza orele pentru aceeasi data', () => {
  const entries = normalizeDayClusterInput([
    { date: '2026-06-02', hours: 1 },
    { date: '2026-06-02', hours: 2 },
  ]);

  assert.deepEqual(entries, [{ date: '2026-06-02', day: 2, hours: 3 }]);
});

test('formateaza mai multe zile cu ore egale', () => {
  assert.equal(formatDayCluster([
    { date: '2026-06-02', hours: 2 },
    { date: '2026-06-05', hours: 2 },
  ], 'iunie', 2026), 'în zilele de 2 și 5 iunie 2026, câte 2 ore pe zi');
});

test('formateaza mai multe zile consecutive cu ore egale', () => {
  assert.equal(formatDayCluster([
    { date: '2026-06-10', hours: 4 },
    { date: '2026-06-11', hours: 4 },
    { date: '2026-06-12', hours: 4 },
  ], 'iunie', 2026), 'în zilele de 10-12 iunie 2026, câte 4 ore pe zi');
});

test('formateaza mai multe zile cu ore inegale', () => {
  assert.equal(formatDayCluster([
    { date: '2026-06-02', hours: 1 },
    { date: '2026-06-05', hours: 2 },
  ], 'iunie', 2026), 'în zilele de 2 și 5 iunie 2026, cu următoarea distribuție: 2 iunie: o oră; 5 iunie: 2 ore');
});

test('formateaza luni romanesti cu diacritice', () => {
  assert.equal(formatDayCluster(['2026-03-08', '2026-03-09'], 'martie', 2026), 'în 8-9 martie 2026');
  assert.equal(formatDayCluster(['2026-08-01'], 'august', 2026), 'în 1 august 2026');
});

test('returneaza string gol pentru input gol', () => {
  assert.equal(formatDayCluster([], 'iunie', 2026), '');
});
