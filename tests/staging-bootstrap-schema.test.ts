import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildFoundationSchema,
  extractModelBlocks,
  FOUNDATION_MODELS,
} from "../scripts/staging-bootstrap-schema.mjs";

const fullSchema = readFileSync("amplify/data/resource.ts", "utf8");

test("staging foundation schema contains the expected closed model set", () => {
  const foundation = buildFoundationSchema(fullSchema);
  const parsed = extractModelBlocks(foundation);
  assert.equal(parsed.blocks.length, FOUNDATION_MODELS.size);
  assert.deepEqual(new Set(parsed.blocks.map((block) => block.name)), FOUNDATION_MODELS);
});

test("staging foundation removes only Expert relations whose models arrive later", () => {
  const foundation = buildFoundationSchema(fullSchema);
  assert.doesNotMatch(foundation, /activities: a\.hasMany\("Activity"/);
  assert.doesNotMatch(foundation, /reportingWorkBlocks: a\.hasMany\("ReportingWorkBlock"/);
  assert.doesNotMatch(foundation, /grupTintaEntries: a\.hasMany\("GrupTintaEntry"/);
  assert.doesNotMatch(foundation, /financialPersonLinks: a\.hasMany\("FinancialPersonLink"/);
  assert.match(foundation, /historicalReports: a\.hasMany\("MonthlyExpertReport"/);
});
