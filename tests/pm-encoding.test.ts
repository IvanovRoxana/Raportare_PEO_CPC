import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const scanRoots = [
  'app/pm',
  'components/pm',
  'lib/opis-generator.ts',
];

const mojibakeFragments = [
  'Ã',
  'Ä',
  'È',
  'Å',
  '�',
  'â€”',
  'â€“',
  'â€',
  'âœ',
  'â—',
];

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  const stats = statSync(path);
  if (stats.isDirectory()) {
    return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
  }
  return /\.(ts|tsx)$/.test(path) ? [path] : [];
}

test('componentele PM nu contin secvente mojibake evidente', () => {
  const offenders: string[] = [];

  scanRoots.flatMap(walk).forEach((file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (mojibakeFragments.some((fragment) => line.includes(fragment))) {
        offenders.push(`${file}:${index + 1}:${line.trim()}`);
      }
    });
  });

  assert.deepEqual(offenders, []);
});
