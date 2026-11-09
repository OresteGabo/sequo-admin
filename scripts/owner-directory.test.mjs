import test from 'node:test'
import assert from 'node:assert/strict'
import { adminControlsFor, buildAdminControlRequest } from '../src/adminControls.ts'
test('only Owners see account creation and directory lifecycle forms', () => {
  const ownerIds = ['owner-create-personnel', 'owner-accounts', 'owner-merchants', 'owner-couriers', 'owner-hubs']
  const visible = roles => ['users','merchants','riders','relay'].flatMap(group => adminControlsFor(group, roles)).map(item => item.id)
  for (const roles of [['ADMIN'],['STAFF_MANAGER'],['SUPPORT_AGENT'],[]]) assert.equal(visible(roles).some(id => ownerIds.includes(id)), false)
  for (const id of ownerIds) assert.ok(visible(['SUPER_ADMIN']).includes(id))
  assert.ok(visible(['ADMIN']).includes('couriers'))
})
test('archive submits the exact reviewed revision and retry identity and keeps readback', () => {
  const request = buildAdminControlRequest('owner-couriers', 'archive', { courierId: 'courier-fixture', expectedUpdatedAt: '2026-11-09T16:00:00.123456Z', reason: 'Reviewed departure', idempotencyKey: 'fixed-archive-retry' })
  assert.equal(request.method, 'DELETE')
  assert.equal(request.path, '/api/admin/web/directory/couriers/courier-fixture')
  assert.equal(request.body.expectedUpdatedAt, '2026-11-09T16:00:00.123456Z')
  assert.equal(request.body.idempotencyKey, 'fixed-archive-retry')
  assert.equal(request.body.reason, 'Reviewed departure')
  assert.equal('status' in request.body, false)
})
test('account creation needs a selected approved role and cannot silently default to Owner', () => {
  const values = { email: 'person@fixture.invalid', displayName: 'Person', reason: 'Approved hire', idempotencyKey: 'create-retry' }
  assert.throws(() => buildAdminControlRequest('owner-create-personnel', 'create', values))
  const request = buildAdminControlRequest('owner-create-personnel', 'create', { ...values, roleCode: 'COURIER' })
  assert.equal(request.body.roleCode, 'COURIER')
  assert.equal(request.body.email, 'person@fixture.invalid')
  assert.equal(request.body.idempotencyKey, 'create-retry')
})
