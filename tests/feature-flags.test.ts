import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeliverableEligibilityCheckEnabled,
  isDeliverableEligibilityCheckEnabledClient,
} from '../lib/feature-flags.ts';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test('deliverable eligibility check is disabled by default', () => {
  const previousServer = process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  delete process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  delete process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  assert.equal(isDeliverableEligibilityCheckEnabled(), false);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), false);

  restoreEnv('ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousServer);
  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClient);
});

test('deliverable eligibility check only enables on explicit true flags', () => {
  const previousServer = process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';
  assert.equal(isDeliverableEligibilityCheckEnabled(), false);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), false);

  process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';
  assert.equal(isDeliverableEligibilityCheckEnabled(), true);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), true);

  restoreEnv('ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousServer);
  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClient);
});

test('server eligibility endpoint can be enabled from the public build flag', () => {
  const previousServer = process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;
  const previousClient = process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK;

  process.env.ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'false';
  process.env.NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK = 'true';

  assert.equal(isDeliverableEligibilityCheckEnabled(), true);
  assert.equal(isDeliverableEligibilityCheckEnabledClient(), true);

  restoreEnv('ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousServer);
  restoreEnv('NEXT_PUBLIC_ENABLE_DELIVERABLE_ELIGIBILITY_CHECK', previousClient);
});
