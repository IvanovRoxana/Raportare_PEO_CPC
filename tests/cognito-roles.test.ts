import test from 'node:test';
import assert from 'node:assert/strict';
import { cognitoGroupsForRole } from '../lib/cognito-roles.ts';

test('mapeaza rolurile aplicatiei la grupurile Cognito gestionate', () => {
  assert.deepEqual(cognitoGroupsForRole('Expert'), ['expert']);
  assert.deepEqual(cognitoGroupsForRole('PM'), ['pm']);
  assert.deepEqual(cognitoGroupsForRole('Expert/PM'), ['expert', 'pm']);
  assert.deepEqual(cognitoGroupsForRole('Admin'), ['pm', 'admin']);
  assert.deepEqual(cognitoGroupsForRole('Expert/PM/Admin'), ['expert', 'pm', 'admin']);
});

test('hasPmAccess pastreaza grupul pm cand rolul de proiect ramane nemodificat', () => {
  assert.deepEqual(cognitoGroupsForRole('Expert', true), ['expert', 'pm']);
  assert.deepEqual(cognitoGroupsForRole('Manager Proiect', true), ['pm']);
});
