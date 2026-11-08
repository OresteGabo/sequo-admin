export type FinanceSourceType = 'DeliveryMission' | 'OrderItem'
export type FinanceRequest = <T>(path: string) => Promise<T>
export type FinanceLedgerEntry = {
  id: string; account: string; direction: string; amountCfa: number
  merchantId: string | null; courierId: string | null; relayPointId: string | null
  sourceType: string; sourceId: string; description: string; createdAt: string
  workforceType?: string | null
}
export type MerchantFinanceSnapshot = {
  id: string; orderId: string; merchantId: string; status: string
  itemSubtotalCfa?: number; commissionRateBps?: number; commissionCfa?: number; merchantNetCfa?: number
  updatedAt?: string
}
export type FinanceSourceRead = {
  sourceType: FinanceSourceType; sourceId: string; ledger: FinanceLedgerEntry[] | null
  snapshot: MerchantFinanceSnapshot | null; errors: string[]
}

export async function readFinanceSource(sourceType: FinanceSourceType, sourceId: string, request: FinanceRequest): Promise<FinanceSourceRead> {
  const id = sourceId.trim()
  if (!id || id.length > 128) throw new Error('Enter a persisted source ID of at most 128 characters.')
  const [ledger, snapshot] = await Promise.allSettled([
    request<FinanceLedgerEntry[]>(`/api/settlements/ledger?sourceType=${sourceType}&sourceId=${encodeURIComponent(id)}`),
    sourceType === 'OrderItem' ? request<MerchantFinanceSnapshot>(`/api/merchant/sub-orders/${encodeURIComponent(id)}`) : Promise.resolve(null),
  ])
  const result: FinanceSourceRead = { sourceType, sourceId: id, ledger: null, snapshot: null, errors: [] }
  if (ledger.status === 'fulfilled' && Array.isArray(ledger.value) && ledger.value.every(entry => entry.sourceId === id && entry.sourceType === sourceType)) result.ledger = ledger.value
  else result.errors.push('Posted ledger could not be read. Refresh to verify the recorded amounts.')
  if (snapshot.status === 'fulfilled' && (sourceType !== 'OrderItem' || snapshot.value?.id === id)) result.snapshot = snapshot.value
  else if (sourceType === 'OrderItem') result.errors.push('The frozen merchant sub-order snapshot is unavailable for this source. Any recorded ledger remains visible.')
  return result
}
