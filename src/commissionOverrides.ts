export type CommissionRequest = <T>(path: string, retryAfterRefresh?: boolean, method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<T>
export type CommissionHistory = {
  id: string; action: 'SET' | 'RESET'; actorUserId: string | null; beforeRateBps: number; afterRateBps: number
  beforeOverridePresent: boolean; afterOverridePresent: boolean; reason: string | null; createdAt: string
  idempotencyKey: string | null; revision: string
}
export type CommissionRead = {
  merchantId: string; commissionRateBps: number
  override?: { commissionRateBps: number; reason: string | null; updatedByUserId: string; updatedAt: string } | null
  defaultRateBps?: number; minRateBps?: number; maxRateBps?: number; revision?: string; operationId?: string | null
  history?: CommissionHistory[]
}
export type CommissionIntent = {
  actorId: string; merchantId: string; action: 'SET' | 'RESET'; beforeRateBps: number; afterRateBps: number
  body: { commissionRateBps?: number; reason: string; expectedRevision: string; idempotencyKey: string }
  acknowledged: boolean
}
export const commissionPath = (merchantId: string) => `/api/commissions/merchant-overrides/${encodeURIComponent(merchantId)}`
export function validMerchantId(id: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id) }
export async function readCommission(merchantId: string, request: CommissionRequest): Promise<CommissionRead> {
  const id = merchantId.trim()
  if (!validMerchantId(id)) throw new Error('Enter a valid merchant ID of at most 128 characters.')
  const read = await request<CommissionRead>(commissionPath(id))
  if (read.merchantId !== id || !Number.isSafeInteger(read.commissionRateBps)) throw new Error('The response does not match this merchant. Refresh before changing terms.')
  return read
}
export function commissionWritesSupported(read: CommissionRead): boolean {
  return [read.minRateBps, read.maxRateBps, read.defaultRateBps].every(Number.isSafeInteger) &&
    read.minRateBps! <= read.defaultRateBps! && read.defaultRateBps! <= read.maxRateBps! &&
    typeof read.revision === 'string' && read.revision.length > 0 && Array.isArray(read.history)
}
export function commissionPercentToBps(value: string): number {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a percentage with at most two decimal places.')
  const [whole, fraction = ''] = value.trim().split('.')
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(bps)) throw new Error('Enter a valid commission percentage.')
  return bps
}
export function createCommissionIntent(read: CommissionRead, actorId: string, action: 'SET' | 'RESET', percent: string, reason: string, key: string): CommissionIntent {
  if (!commissionWritesSupported(read)) throw new Error('Server policy, revision and history are required before changing commission terms.')
  const note = reason.trim()
  if (!note || note.length > 255) throw new Error('Enter a reason of at most 255 characters.')
  const rate = action === 'SET' ? commissionPercentToBps(percent) : read.defaultRateBps!
  if (rate < read.minRateBps! || rate > read.maxRateBps!) throw new Error('The requested rate is outside the server policy range.')
  if (!actorId || !key) throw new Error('An authenticated operator and stable retry key are required.')
  return { actorId, merchantId: read.merchantId, action, beforeRateBps: read.commissionRateBps, afterRateBps: rate,
    body: Object.freeze({ ...(action === 'SET' ? { commissionRateBps: rate } : {}), reason: note, expectedRevision: read.revision!, idempotencyKey: key }), acknowledged: false }
}
export function commissionIntentRecorded(read: CommissionRead, intent: CommissionIntent): boolean {
  return read.merchantId === intent.merchantId && Boolean(read.history?.some(entry =>
    Boolean(entry.id) && Boolean(entry.revision) && entry.idempotencyKey === intent.body.idempotencyKey && entry.actorUserId === intent.actorId && entry.action === intent.action &&
    entry.beforeRateBps === intent.beforeRateBps && entry.afterRateBps === intent.afterRateBps &&
    entry.afterOverridePresent === (intent.action === 'SET') && entry.reason === intent.body.reason))
}
export async function writeCommissionIntent(intent: CommissionIntent, request: CommissionRequest, acknowledged: () => void): Promise<CommissionRead> {
  await request(commissionPath(intent.merchantId), true, intent.action === 'SET' ? 'PUT' : 'DELETE', intent.body)
  acknowledged()
  const read = await readCommission(intent.merchantId, request)
  if (!commissionIntentRecorded(read, intent)) throw new Error('The server audit has not confirmed this saved change. Refresh or retry the same intent.')
  return read
}
