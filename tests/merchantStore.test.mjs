import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import { storeDraft, prepareMerchantStore, readMerchantStore, writeMerchantStore, restoreMerchantStoreIntent } from '../src/merchantStore.ts'

const current = () => ({ merchantId: 'merchant-a', configured: true, open: true, acceptingOrders: true,
  timezone: 'Africa/Lome', openStatus: 'OPEN', updatedAt: '2026-11-08T09:00:00Z', canAcceptOrders: true,
  openingHours: [], temporaryExceptions: [], temporaryClosure: null, closureReason: null, history: [] })
const intent = () => { const state = current(); return prepareMerchantStore('merchant-a', state, { ...storeDraft(state), reason: 'Close for maintenance', open: false }, 'retry-store-1') }

test('unconfigured store keeps unknown timezone and hours, with explicit legacy ordering draft', () => {
  const draft = storeDraft({ ...current(), configured: false, timezone: null, open: false, acceptingOrders: false })
  assert.equal(draft.timezone, '')
  assert.equal(draft.open, true)
  assert.equal(draft.weeklyEnabled, false)
  assert.ok(draft.openingHours.every(d => d.opensAt === '' && d.closesAt === ''))
})

test('Vue reactive drafts produce detached complete retry intent and preserve existing exception IDs', () => {
  const state = current()
  state.temporaryExceptions.push({ id: 'existing-day', date: '2026-12-25', closed: true, opensAt: null, closesAt: null, reason: 'Holiday' })
  const draft = reactive({ ...storeDraft(reactive(state)), reason: 'Reviewed holiday' })
  const prepared = prepareMerchantStore('merchant-a', state, draft, 'retry-store-2')
  draft.temporaryExceptions[0].reason = 'Later edit'
  assert.equal(prepared.body.temporaryExceptions[0].id, 'existing-day')
  assert.equal(prepared.body.temporaryExceptions[0].reason, 'Holiday')
  assert.equal(prepared.body.expectedUpdatedAt, state.updatedAt)
  assert.deepEqual(restoreMerchantStoreIntent(JSON.parse(JSON.stringify(prepared)), 'merchant-a'), prepared)
  assert.equal(restoreMerchantStoreIntent(prepared, 'another-merchant'), null)
})

test('weekly validation rejects incomplete or overnight hours and normalizes explicit closed days', () => {
  const state = current(); const draft = { ...storeDraft(state), reason: 'Weekly schedule', weeklyEnabled: true }
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /HH:mm/)
  draft.openingHours.forEach(d => { d.opensAt = '08:00'; d.closesAt = '18:00' })
  draft.openingHours[0].opensAt = '22:00'; draft.openingHours[0].closesAt = '06:00'
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /same day/)
  draft.openingHours[0].closed = true
  const prepared = prepareMerchantStore('merchant-a', state, draft)
  assert.equal(prepared.body.openingHours[0].opensAt, '')
  assert.equal(prepared.body.openingHours[0].closesAt, '')
  draft.openingHours.pop()
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /seven days/)
})

test('reason, timezone, actual exception dates and temporary closure ranges are validated', () => {
  const state = current(); const draft = storeDraft(state)
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /reason/)
  draft.reason = 'Operator review'; draft.timezone = ''
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /timezone/)
  draft.timezone = 'Africa/Lome'
  draft.temporaryExceptions = [{ id: null, date: '2026-02-31', closed: true, opensAt: null, closesAt: null, reason: null }]
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /valid date/)
  draft.temporaryExceptions[0].date = '2026-12-25'
  draft.temporaryExceptions.push({ ...draft.temporaryExceptions[0] })
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /one exception/)
  draft.temporaryExceptions = []; draft.closureEnabled = true
  draft.temporaryClosure = { id: null, startsAt: '2026-11-08T12:00:00Z', endsAt: '2026-11-08T10:00:00Z', reason: null }
  assert.throws(() => prepareMerchantStore('merchant-a', state, draft), /end after start/)
})

test('scope/malformed read fails closed and save keeps exact body then verifies canonical history', async () => {
  await assert.rejects(readMerchantStore('merchant-a', async () => ({ ...current(), merchantId: 'merchant-b' })), /another merchant/)
  await assert.rejects(readMerchantStore('merchant-a', async () => ({ ...current(), configured: undefined })), /unavailable/)
  const pending = intent(); let acknowledged = false; const calls = []
  const changed = { ...current(), open: false, openStatus: 'PAUSED', canAcceptOrders: false, history: [{ id: 'event', action: 'SET_STORE_SETTINGS', actorUserId: 'admin', reason: pending.body.reason, idempotencyKey: pending.body.idempotencyKey, createdAt: '2026-11-08T10:00:00Z' }] }
  const fresh = await writeMerchantStore(pending, async (path, retry, method = 'GET', body) => {
    calls.push([path, method])
    if (method === 'PUT') { assert.deepEqual(body, pending.body); return { record: changed, operation: changed.history[0] } }
    return changed
  }, () => { acknowledged = true })
  assert.equal(acknowledged, true)
  assert.equal(fresh.open, false)
  assert.deepEqual(calls.map(c => c[1]), ['PUT', 'GET'])
})

test('an acknowledged save with failed or missing-history readback stays uncertain', async () => {
  const pending = intent(); let acknowledged = false
  await assert.rejects(writeMerchantStore(pending, async (_, __, method = 'GET') => {
    if (method === 'PUT') return { record: current(), operation: { idempotencyKey: pending.body.idempotencyKey } }
    throw new Error('Offline after write')
  }, () => { acknowledged = true }), /Offline after write/)
  assert.equal(acknowledged, true)
  await assert.rejects(writeMerchantStore(pending, async (_, __, method = 'GET') => method === 'PUT' ? { record: current(), operation: { idempotencyKey: pending.body.idempotencyKey } } : current(), () => {}), /history could not be confirmed/)
})

test('nested malformed legacy rows and extra saved-intent fields are rejected without defaults', async () => {
  for (const patch of [
    { open: 'true' },
    { openingHours: [null] },
    { temporaryExceptions: [{ id: 'date-one', date: '2026-12-25', closed: 'false', opensAt: null, closesAt: null, reason: null }] },
    { temporaryClosure: { id: 'closure', startsAt: null, endsAt: '2026-12-25T10:00:00Z', reason: null } },
    { history: [{ id: 'event', createdAt: '2026-12-25T10:00:00Z', reason: null }] },
  ]) await assert.rejects(readMerchantStore('merchant-a', async () => ({ ...current(), ...patch })), /unavailable/)
  const saved = intent()
  assert.equal(restoreMerchantStoreIntent({ ...saved, unexpected: true }, 'merchant-a'), null)
  assert.equal(restoreMerchantStoreIntent({ ...saved, body: { ...saved.body, customerId: 'forged' } }, 'merchant-a'), null)
  assert.equal(restoreMerchantStoreIntent({ ...saved, body: { ...saved.body, acceptingOrders: 'false' } }, 'merchant-a'), null)
})
