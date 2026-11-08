import assert from 'node:assert/strict'
import test from 'node:test'
import { canRecordRefundInstruction, refundInstructionConfirmed, refundInstructionState } from '../src/refundInstructionState.ts'

const instruction = { id: 'audited-instruction', amountCfa: 2500, status: 'REQUESTED', paymentStatus: 'NOT_SUBMITTED' }

test('legacy key projection requires review regardless of the return workflow status', () => {
  for (const status of ['Requested', 'ReceivedBySequo', 'RefundPending']) {
    const record = { status, refundInstructionState: 'LEGACY_REVIEW_REQUIRED', refundInstruction: null }
    assert.equal(refundInstructionState(record), 'LEGACY_REVIEW_REQUIRED')
    assert.equal(canRecordRefundInstruction(record), false)
    assert.equal(refundInstructionConfirmed(record, 2500), false)
  }
})

test('only an audited requested instruction with the same amount confirms a frozen refund intent', () => {
  const record = { status: 'RefundPending', refundInstructionState: 'REQUESTED', refundInstruction: instruction }
  assert.equal(refundInstructionConfirmed(record, 2500), true)
  assert.equal(refundInstructionConfirmed(record, 3000), false)
  assert.equal(refundInstructionConfirmed({ ...record, refundInstruction: { ...instruction, id: '' } }, 2500), false)
  assert.equal(refundInstructionConfirmed({ ...record, refundInstruction: { ...instruction, status: 'UNKNOWN' } }, 2500), false)
  assert.equal(canRecordRefundInstruction(record), false)
  assert.equal(record.refundInstruction.paymentStatus, 'NOT_SUBMITTED')
})

test('status alone or incomplete audit details cannot clear the saved retry key', () => {
  assert.equal(refundInstructionConfirmed({ status: 'RefundPending' }, 2500), false)
  assert.equal(refundInstructionConfirmed({ status: 'RefundPending', refundInstructionState: 'REQUESTED' }, 2500), false)
  assert.equal(canRecordRefundInstruction({ status: 'ReceivedBySequo', refundInstructionState: 'REQUESTED' }), false)
})

test('supported older responses use their durable object or legacy workflow fallback', () => {
  assert.equal(refundInstructionState({ status: 'RefundPending', refundInstruction: instruction }), 'REQUESTED')
  assert.equal(refundInstructionConfirmed({ status: 'RefundPending', refundInstruction: instruction }, 2500), true)
  assert.equal(refundInstructionState({ status: 'RefundPending' }), 'LEGACY_REVIEW_REQUIRED')
  assert.equal(canRecordRefundInstruction({ status: 'ReceivedBySequo' }), true)
})

test('unknown or contradictory server states do not permit another refund instruction', () => {
  for (const record of [
    { status: 'ReceivedBySequo', refundInstructionState: 'NEW_STATE' },
    { status: 'ReceivedBySequo', refundInstructionState: 'NOT_INSTRUCTED', refundInstruction: instruction },
    { status: 'RefundPending', refundInstructionState: 'NOT_INSTRUCTED' },
  ]) {
    assert.equal(refundInstructionState(record), 'UNKNOWN')
    assert.equal(canRecordRefundInstruction(record), false)
    assert.equal(refundInstructionConfirmed(record, 2500), false)
  }
})
