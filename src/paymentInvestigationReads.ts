export type PaymentReadRequest = <T>(path: string) => Promise<T>
export type PaymentCheckout = {
  checkoutId: string; paymentProvider: string; paymentReference: string; providerReference: string | null
  amountCfa: number; currency?: string; status: string; createdAt: string; updatedAt: string
  completedAt: string | null; orderId: string | null; orderStatus: string | null
}
export type PaymentEvent = {
  id: string; provider: string; eventId: string; checkoutId: string; paymentReference: string
  providerReference: string | null; amountCfa: number; status: string; occurredAt: string; receivedAt: string
  reconciliationStatus?: string | null; reconciliationReason?: string | null; reconciledAt?: string | null
}
export type PaymentInvestigation = { checkout: PaymentCheckout; events: PaymentEvent[] }

export async function readPaymentCheckoutQueue(request: PaymentReadRequest): Promise<PaymentCheckout[]> {
  const data = await request<{ checkouts?: PaymentCheckout[] }>('/api/admin/web/payments')
  if (!Array.isArray(data.checkouts)) throw new Error('Checkout investigation is unavailable on this API version.')
  return data.checkouts
}

export async function readPaymentCheckout(checkoutId: string, request: PaymentReadRequest): Promise<PaymentInvestigation> {
  const id = checkoutId.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error('Enter a valid checkout ID of at most 128 characters.')
  const data = await request<PaymentInvestigation>(`/api/admin/web/payments/checkouts/${encodeURIComponent(id)}`)
  if (data.checkout?.checkoutId !== id || !Array.isArray(data.events) || data.events.some(event => event.checkoutId !== id)) {
    throw new Error('The response does not match this checkout. Refresh to verify the record.')
  }
  return data
}

const reconciliationLabels: Record<string, string> = {
  PENDING: 'Reconciliation pending', FULFILLED: 'Fulfillment recorded', IGNORED: 'No state change',
  REVIEW_REQUIRED: 'Operator review required', ERROR: 'Processing failed', LEGACY_REVIEW_REQUIRED: 'Legacy outcome requires review',
}
export const reconciliationLabel = (status: string | null | undefined) => reconciliationLabels[status ?? ''] ?? 'Outcome unavailable'
