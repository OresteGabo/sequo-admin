import assert from 'node:assert/strict'
import test from 'node:test'
import { readPaymentCheckout, readPaymentCheckoutQueue, reconciliationLabel } from '../src/paymentInvestigationReads.ts'

const checkout = { checkoutId: 'checkout:1', paymentProvider: 'yas_togo', paymentReference: 'pay-1', providerReference: null,
  amountCfa: 4500, currency: 'XOF', status: 'AWAITING_WEBHOOK', createdAt: '2026-11-08T12:00:00Z', updatedAt: '2026-11-08T12:00:00Z', completedAt: null, orderId: null, orderStatus: null }

test('queue reads stored pending checkout even with no callback and distinguishes empty from unavailable', async () => {
  assert.deepEqual(await readPaymentCheckoutQueue(async path => {
    assert.equal(path, '/api/admin/web/payments'); return { checkouts: [checkout], webhookEvents: [] }
  }), [checkout])
  assert.deepEqual(await readPaymentCheckoutQueue(async () => ({ checkouts: [] })), [])
  await assert.rejects(readPaymentCheckoutQueue(async () => ({ webhookEvents: [] })), /unavailable on this API version/)
})

test('exact lookup reads only the requested persisted checkout with safe encoding', async () => {
  const detail = { checkout, events: [] }
  assert.deepEqual(await readPaymentCheckout(' checkout:1 ', async path => {
    assert.equal(path, '/api/admin/web/payments/checkouts/checkout%3A1'); return detail
  }), detail)
  let calls = 0
  for (const id of ['', '../another', 'x'.repeat(129)]) await assert.rejects(readPaymentCheckout(id, async () => { calls++; return detail }), /valid checkout ID/)
  assert.equal(calls, 0)
})

test('failed or mismatched detail cannot become a successful investigation', async () => {
  await assert.rejects(readPaymentCheckout('checkout:1', async () => { throw new Error('session_ended') }), /session_ended/)
  await assert.rejects(readPaymentCheckout('checkout:1', async () => ({ checkout: { ...checkout, checkoutId: 'foreign' }, events: [] })), /does not match/)
  await assert.rejects(readPaymentCheckout('checkout:1', async () => ({ checkout, events: [{ checkoutId: 'foreign' }] })), /does not match/)
})

test('callback receipt and fulfillment outcomes remain distinct without inferring a transfer', async () => {
  assert.equal(reconciliationLabel('PENDING'), 'Reconciliation pending')
  assert.equal(reconciliationLabel('FULFILLED'), 'Fulfillment recorded')
  assert.equal(reconciliationLabel('IGNORED'), 'No state change')
  assert.equal(reconciliationLabel('REVIEW_REQUIRED'), 'Operator review required')
  assert.equal(reconciliationLabel('ERROR'), 'Processing failed')
  assert.equal(reconciliationLabel('LEGACY_REVIEW_REQUIRED'), 'Legacy outcome requires review')
  assert.equal(reconciliationLabel(null), 'Outcome unavailable')
  assert.equal(reconciliationLabel('NEW_STATE'), 'Outcome unavailable')
})
