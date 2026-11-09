import test from 'node:test'
import assert from 'node:assert/strict'
import { hasAdminAccess, canManagePersonnel, canManageAccount, grantableRoles, adminTierLabel, hasAdminRole } from '../src/adminPermissions.ts'
const person = { id: 'person', roles: ['COURIER', 'CUSTOMER'] }
test('three tiers merge support into operations without promoting legacy support', () => {
  assert.equal(adminTierLabel(['ADMIN']), 'Operations · support included')
  assert.equal(adminTierLabel(['STAFF_MANAGER']), 'Staff manager')
  assert.equal(adminTierLabel(['SUPER_ADMIN']), 'Owner')
  assert.equal(hasAdminAccess(['STAFF_MANAGER']), true)
  assert.equal(hasAdminAccess(['SUPPORT_AGENT']), false)
  assert.equal(canManagePersonnel(['ADMIN']), false)
  assert.equal(hasAdminRole(['STAFF_MANAGER'], 'ADMIN'), true)
})
test('operations cannot grant roles or manage account access', () => {
  assert.deepEqual(grantableRoles(['ADMIN']), [])
  assert.equal(canManageAccount(['ADMIN'], 'operator', person), false)
})
test('staff managers only manage other operational personnel', () => {
  assert.equal(canManageAccount(['STAFF_MANAGER'], 'manager', person, true), true)
  assert.equal(canManageAccount(['STAFF_MANAGER'], 'manager', { id: 'customer', roles: ['CUSTOMER'] }, true), false)
  assert.equal(canManageAccount(['STAFF_MANAGER'], 'manager', { id: 'customer', roles: ['CUSTOMER'] }), true)
  for (const role of ['ADMIN', 'STAFF_MANAGER', 'SUPER_ADMIN', 'SUPPORT_AGENT']) {
    assert.equal(grantableRoles(['STAFF_MANAGER']).includes(role), false)
    assert.equal(canManageAccount(['STAFF_MANAGER'], 'manager', { id: 'other', roles: [role, 'COURIER'] }), false)
  }
})
test('owners may appoint administrators but self changes stay disabled', () => {
  assert.equal(grantableRoles(['SUPER_ADMIN']).includes('STAFF_MANAGER'), true)
  assert.equal(canManageAccount(['SUPER_ADMIN'], 'owner', { id: 'other', roles: ['SUPER_ADMIN'] }), true)
  for (const roles of [['STAFF_MANAGER'], ['SUPER_ADMIN']]) {
    assert.equal(canManageAccount(roles, 'self', { id: 'self', roles }), false)
    assert.equal(canManageAccount(roles, 'self', null), false)
  }
})
