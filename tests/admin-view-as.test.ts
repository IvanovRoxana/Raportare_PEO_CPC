import assert from 'node:assert/strict';
import test from 'node:test';
import { buildViewAsUser, createAdminViewAsSession } from '../lib/admin-view-as.ts';
import type { Expert } from '../lib/types.ts';

const targetExpert = {
  id: 'expert-1',
  name: 'Expert Test',
  role: 'Expert',
  email: 'expert@test.ro',
  norma: 8,
  cognitoGroups: ['expert'],
} as Expert;

test('view-as creeaza sesiune pentru expertul selectat', () => {
  const session = createAdminViewAsSession(targetExpert);

  assert.equal(session.expertId, 'expert-1');
  assert.equal(session.expertEmail, 'expert@test.ro');
  assert.deepEqual(session.roles, ['expert']);
  assert.equal(session.returnPath, '/admin');
});

test('doar adminul real poate construi utilizator view-as', () => {
  const session = createAdminViewAsSession(targetExpert, { id: 'admin-1', email: 'admin@test.ro' });

  assert.equal(buildViewAsUser({ realUserRoles: ['pm'], session }), null);
  assert.equal(buildViewAsUser({ realUserRoles: ['admin'], realUserId: 'other-admin', session }), null);
  assert.deepEqual(buildViewAsUser({
    realUserRoles: ['admin'],
    realUserId: 'admin-1',
    realUserEmail: 'admin@test.ro',
    session,
  }), {
    id: 'expert-1',
    email: 'expert@test.ro',
    displayName: 'Expert Test',
    roles: ['expert'],
  });
});
