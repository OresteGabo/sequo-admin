import assert from 'node:assert/strict'
import test from 'node:test'
import { commissionIntentRecorded, commissionPercentToBps, commissionWritesSupported, createCommissionIntent, readCommission, writeCommissionIntent } from '../src/commissionOverrides.ts'

const current = { merchantId: 'merchant:1', commissionRateBps: 1250, override: null, defaultRateBps: 1250, minRateBps: 600, maxRateBps: 1400, revision: 'server-initial', operationId: null, history: [] }
const intent = () => createCommissionIntent(current, 'admin-1', 'SET', '7.25', ' Agreed commercial terms ', 'stable-intent-1')
const audit = value => ({ id: 'audit-1', action: value.action, actorUserId: value.actorId, beforeRateBps: value.beforeRateBps, afterRateBps: value.afterRateBps,
  beforeOverridePresent: false, afterOverridePresent: value.action === 'SET', reason: value.body.reason, createdAt: '2026-11-08T12:00:00Z', idempotencyKey: value.body.idempotencyKey, revision: 'server-after' })

test('server policy and opaque revision control a frozen proposal, including reset to actual default', () => {
  const value = intent()
  assert.deepEqual(value.body, { commissionRateBps: 725, reason: 'Agreed commercial terms', expectedRevision: 'server-initial', idempotencyKey: 'stable-intent-1' })
  assert.equal(Object.isFrozen(value.body), true)
  assert.equal(createCommissionIntent(current, 'admin-1', 'RESET', '', 'Restore approved default', 'reset-intent').afterRateBps, 1250)
  assert.throws(() => createCommissionIntent(current, 'admin-1', 'SET', '5.00', 'Below actual policy', 'bad'), /outside the server policy/)
  assert.throws(() => createCommissionIntent(current, 'admin-1', 'SET', '14.01', 'Above actual policy', 'bad'), /outside the server policy/)
  assert.equal(commissionPercentToBps('7.25'), 725)
  assert.throws(() => commissionPercentToBps('7.255'), /two decimal places/)
  assert.throws(() => commissionPercentToBps('1e2'), /two decimal places/)
})

test('older rate reads remain readable while missing policy/revision/history prevent writes', async () => {
  const legacy = { merchantId: 'merchant:1', commissionRateBps: 1500, override: null }
  assert.deepEqual(await readCommission('merchant:1', async path => { assert.equal(path, '/api/commissions/merchant-overrides/merchant%3A1'); return legacy }), legacy)
  assert.equal(commissionWritesSupported(legacy), false)
  assert.throws(() => createCommissionIntent(legacy, 'admin-1', 'SET', '10', 'Reason', 'key'), /Server policy/)
  await assert.rejects(readCommission('merchant:1', async () => ({ ...legacy, merchantId: 'foreign' })), /does not match/)
})

test('write success requires exact audit readback and never trusts the mutation response rate', async () => {
  const value = intent(); const calls = []; let acknowledged = 0
  const actual = { ...current, commissionRateBps: 725, revision: 'server-after', operationId: 'audit-1', history: [audit(value)] }
  const result = await writeCommissionIntent(value, async (path, retry, method = 'GET', body) => {
    calls.push({ path, method, body })
    return method === 'PUT' ? { commissionRateBps: 9999 } : actual
  }, () => { acknowledged++ })
  assert.equal(result.commissionRateBps, 725)
  assert.equal(current.commissionRateBps, 1250)
  assert.equal(acknowledged, 1)
  assert.deepEqual(calls.map(call => call.method), ['PUT', 'GET'])
  assert.deepEqual(calls[0].body, value.body)
})

test('a failed readback or stale response keeps the same replay payload and cannot report success', async () => {
  const value = intent(); const bodies = []; let acknowledged = 0
  const request = async (path, retry, method = 'GET', body) => {
    if (method === 'PUT') { bodies.push(body); return {} }
    throw new Error('readback_unavailable')
  }
  await assert.rejects(writeCommissionIntent(value, request, () => { acknowledged++ }), /readback_unavailable/)
  await assert.rejects(writeCommissionIntent(value, request, () => { acknowledged++ }), /readback_unavailable/)
  assert.equal(acknowledged, 2); assert.deepEqual(bodies, [value.body, value.body])
  await assert.rejects(writeCommissionIntent(value, async () => { throw new Error('Commission changed; refresh before writing') }, () => assert.fail('stale write was not acknowledged')), /refresh before writing/)
  await assert.rejects(writeCommissionIntent(value, async (path, retry, method = 'GET') => method === 'PUT' ? {} : { ...current, commissionRateBps: 725 }, () => {}), /audit has not confirmed/)
})

test('matching a rate alone, another actor, or changed intent cannot confirm this audit', () => {
  const value = intent(); const entry = audit(value)
  assert.equal(commissionIntentRecorded({ ...current, history: [entry] }, value), true)
  for (const changed of [{ actorUserId: 'another-admin' }, { idempotencyKey: 'other-key' }, { action: 'RESET' }, { afterRateBps: 800 }, { reason: 'Other reason' }, { id: '' }, { revision: '' }]) {
    assert.equal(commissionIntentRecorded({ ...current, history: [{ ...entry, ...changed }] }, value), false)
  }
})

test('reset uses DELETE with guarded reason and reads back the server default and audit', async () => {
  const value = createCommissionIntent({ ...current, commissionRateBps: 725 }, 'admin-1', 'RESET', '', 'Restore default', 'reset-key')
  const calls = []
  const result = await writeCommissionIntent(value, async (path, retry, method = 'GET', body) => {
    calls.push(method)
    if (method === 'DELETE') { assert.equal(body.expectedRevision, 'server-initial'); assert.equal(body.reason, 'Restore default'); assert.equal(body.commissionRateBps, undefined); return undefined }
    return { ...current, revision: 'reset-after', history: [audit(value)] }
  }, () => {})
  assert.equal(result.commissionRateBps, 1250); assert.deepEqual(calls, ['DELETE', 'GET'])
})
