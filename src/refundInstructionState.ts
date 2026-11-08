export type RefundInstructionRecord = {
  status: string
  refundInstructionState?: string | null
  refundInstruction?: { id: string; amountCfa: number; status: string; paymentStatus: string } | null
}
export type RefundInstructionState = 'REQUESTED' | 'LEGACY_REVIEW_REQUIRED' | 'NOT_INSTRUCTED' | 'UNKNOWN'

export function refundInstructionState(record: RefundInstructionRecord): RefundInstructionState {
  const state = record.refundInstructionState
  if (state === 'REQUESTED' || state === 'LEGACY_REVIEW_REQUIRED') return state
  if (state != null && state !== 'NOT_INSTRUCTED') return 'UNKNOWN'
  if (record.refundInstruction) return state === 'NOT_INSTRUCTED' ? 'UNKNOWN' : 'REQUESTED'
  if (record.status === 'RefundPending') return state === 'NOT_INSTRUCTED' ? 'UNKNOWN' : 'LEGACY_REVIEW_REQUIRED'
  return 'NOT_INSTRUCTED'
}

export function canRecordRefundInstruction(record: RefundInstructionRecord): boolean {
  return refundInstructionState(record) === 'NOT_INSTRUCTED' && !record.refundInstruction
}

export function refundInstructionConfirmed(record: RefundInstructionRecord, intendedAmount: unknown): boolean {
  const instruction = record.refundInstruction
  return refundInstructionState(record) === 'REQUESTED' && Boolean(instruction?.id) &&
    instruction?.status === 'REQUESTED' && instruction.amountCfa === intendedAmount
}
