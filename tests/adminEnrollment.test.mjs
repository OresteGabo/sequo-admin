import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEnrollmentSnapshot, prepareEnrollment, readEnrollment, restoreEnrollment, submitEnrollment, enrollmentStorageKey } from '../src/adminEnrollment.ts'
const at = '2026-11-08T10:00:00.123456Z'
const base = (roles = ['MERCHANT_OWNER']) => ({ user: { id: 'owner-fixture', email: 'owner@fixture.invalid', displayName: 'Fixture owner', active: true, status: 'ACTIVE', roles, updatedAt: at }, merchants: [], courier: null, history: [] })
const draft = { userId: 'owner-fixture', name: 'Fixture merchant', workforceType: 'Freelancer', vehicleType: 'Moto', reason: 'Approved local enrollment' }
const intent = () => prepareEnrollment('merchant', 'admin-fixture', draft, base(), 'stable-fixture-key')
const complete = () => ({ ...base(), merchants: [{ id: 'new-merchant', name: draft.name, status: 'ACTIVE', createdAt: at, updatedAt: at }], history: [{ id: 'one-operation', kind: 'MERCHANT', userId: draft.userId, entityId: 'new-merchant', actorUserId: 'admin-fixture', reason: draft.reason, idempotencyKey: 'stable-fixture-key', createdAt: at, recordedName: draft.name, workforceType: null, vehicleType: null }] })
test('exact own account, timestamps and history are validated without invented defaults', async () => {
  const record = await readEnrollment(async path => { assert.equal(path, '/api/admin/web/enrollment/users/owner-fixture'); return base() }, draft.userId)
  assert.equal(record.user.updatedAt, at); assert.equal(record.courier, null)
  assert.throws(() => parseEnrollmentSnapshot(base(), 'foreign-user'))
  assert.throws(() => parseEnrollmentSnapshot({ ...base(), history: [{ ...complete().history[0], userId: 'foreign' }] }, draft.userId))
  assert.throws(() => parseEnrollmentSnapshot({ ...base(), merchants: {} }, draft.userId))
  await assert.rejects(() => readEnrollment(async () => base(), '..'))
})
test('review requires an active separately authorized identity, clear fields and exact revision', () => {
  const frozen = intent(); assert.equal(frozen.body.expectedUserUpdatedAt, at)
  assert.deepEqual(Object.keys(frozen.body).sort(), ['expectedUserUpdatedAt', 'idempotencyKey', 'name', 'reason', 'userId'])
  assert.throws(() => prepareEnrollment('merchant', 'admin-fixture', draft, base(['CUSTOMER']), 'key'))
  assert.throws(() => prepareEnrollment('merchant', draft.userId, draft, base(), 'key'))
  assert.throws(() => prepareEnrollment('merchant', 'admin-fixture', { ...draft, name: '' }, base(), 'key'))
  assert.throws(() => prepareEnrollment('merchant', 'admin-fixture', draft, { ...base(), user: { ...base().user, active: false } }, 'key'))
  assert.throws(() => prepareEnrollment('merchant', 'admin-fixture', draft, complete(), 'key'))
})
test('rider review preserves exact supported workforce and vehicle without wallet amounts', () => {
  for (const workforceType of ['SequoSalaried', 'Freelancer']) {
    const frozen = prepareEnrollment('courier', 'admin-fixture', { ...draft, workforceType }, base(['COURIER']), 'key')
    assert.equal(frozen.body.workforceType, workforceType); assert.equal(frozen.body.vehicleType, 'Moto'); assert.equal(frozen.body.name, undefined)
  }
  assert.throws(() => prepareEnrollment('courier', 'admin-fixture', { ...draft, vehicleType: 'Foot' }, base(['COURIER']), 'key'))
  assert.throws(() => prepareEnrollment('courier', 'admin-fixture', draft, { ...base(['COURIER']), courier: { id: 'old-courier' } }, 'key'))
})
test('saved retries are bound to actor, kind and a bounded exact body', () => {
  const frozen = intent(); assert.deepEqual(restoreEnrollment(JSON.stringify(frozen), 'admin-fixture', 'merchant'), frozen)
  assert.equal(enrollmentStorageKey('admin-fixture', 'merchant'), 'sequo_admin_enrollment_pending:admin-fixture:merchant')
  assert.throws(() => restoreEnrollment(JSON.stringify(frozen), 'other-admin', 'merchant'))
  assert.throws(() => restoreEnrollment(JSON.stringify(frozen), 'admin-fixture', 'courier'))
  assert.throws(() => restoreEnrollment(JSON.stringify({ ...frozen, body: { ...frozen.body, roles: ['ADMIN'] } }), 'admin-fixture', 'merchant'))
})
test('write requires canonical server history after exact preflight and never retries automatically', async () => {
  const calls = []; let created = false
  const result = await submitEnrollment(async (path, retry, method = 'GET', body) => {
    calls.push({ path, retry, method, body })
    if (method === 'POST') { assert.deepEqual(body, intent().body); assert.equal(retry, false); created = true; return { ignored: 'acknowledgement alone is insufficient' } }
    return created ? complete() : base()
  }, intent())
  assert.equal(result.operation.entityId, 'new-merchant'); assert.deepEqual(calls.map(c => c.method), ['GET', 'POST', 'GET'])
})
test('lost acknowledgement or reload confirms already persisted history without another POST', async () => {
  let created = false, writes = 0
  const request = async (_path, _retry, method = 'GET') => { if (method === 'POST') { writes++; created = true; throw Error('Local interrupted acknowledgement') } return created ? complete() : base() }
  await assert.rejects(() => submitEnrollment(request, intent()), /interrupted/)
  const restored = restoreEnrollment(JSON.stringify(intent()), 'admin-fixture', 'merchant')
  const result = await submitEnrollment(request, restored)
  assert.equal(writes, 1); assert.equal(result.operation.id, 'one-operation')
})
test('conflicting or incomplete history never presents enrollment as confirmed', async () => {
  await assert.rejects(() => submitEnrollment(async () => ({ ...complete(), history: [{ ...complete().history[0], actorUserId: 'other-admin' }] }), intent()), /conflicts/)
  await assert.rejects(() => submitEnrollment(async () => ({ ...complete(), merchants: [] }), intent()), /disagree/)
  let writes = 0
  await assert.rejects(() => submitEnrollment(async (_p, _r, method = 'GET') => { if (method === 'POST') writes++; return base() }, intent()), /not confirmed/)
  assert.equal(writes, 1)
})
