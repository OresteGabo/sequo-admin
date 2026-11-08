import type { AdminControlDescriptor, AdminControlRequest } from './adminControls'

export type StoreDay = { dayOfWeek: number; opensAt: string; closesAt: string; closed: boolean }
export type StoreException = { id: string | null; date: string; closed: boolean; opensAt: string | null; closesAt: string | null; reason: string | null }
export type StoreClosure = { id: string | null; startsAt: string; endsAt: string; reason: string | null }
export type StoreSettings = {
  open: boolean; acceptingOrders: boolean; timezone: string; openingHours: StoreDay[]
  temporaryExceptions: StoreException[]; temporaryClosure: StoreClosure | null; closureReason: string | null
}
export type StoreChange = { id: string; action: string; actorUserId: string; reason: string; idempotencyKey: string; createdAt: string }
export type MerchantStoreState = Omit<StoreSettings, 'timezone'> & {
  merchantId: string; configured: boolean; timezone: string | null; openStatus: string
  updatedAt: string; canAcceptOrders: boolean; history: StoreChange[]
}
export type StoreDraft = StoreSettings & { weeklyEnabled: boolean; closureEnabled: boolean; reason: string }
export type StoreIntent = { merchantId: string; body: StoreSettings & { reason: string; expectedUpdatedAt: string; idempotencyKey: string } }

const id = (value: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error('Select a valid merchant.')
  return value
}
const path = (merchantId: string) => `/api/admin/web/merchants/${encodeURIComponent(id(merchantId))}/store`
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const instantValid = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value))
const rangeValid = (open: string, close: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(open) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(close) && open < close
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const merchantStoreControl: AdminControlDescriptor = {
  id: 'merchant-store-settings', group: 'merchants', label: 'Store availability and hours', supported: true,
  description: 'Persisted manual availability, weekly hours and dated closures. New quotes and checkout follow the same server policy; existing orders stay unchanged.',
  read: { path: '/api/admin/web/merchants/{merchantId}/store', shape: 'record', rowId: 'merchantId',
    fields: [{ name: 'merchantId', label: 'Merchant reference', location: 'path', type: 'string', required: true, valueFrom: 'id', maxLength: 128 }],
    columns: [{ key: 'openStatus', label: 'Current state' }, { key: 'configured', label: 'Configured', format: 'boolean' }, { key: 'canAcceptOrders', label: 'Accepts orders now', format: 'boolean' }, { key: 'timezone', label: 'Timezone' }, { key: 'updatedAt', label: 'Updated', format: 'date' }] },
  actions: [],
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const note = (value: unknown) => value === null || (typeof value === 'string' && value.length <= 1000)
const optionalId = (value: unknown) => value === null || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
function settingsValid(s: Record<string, unknown>, allowNoTimezone = false): boolean {
  if (typeof s.open !== 'boolean' || typeof s.acceptingOrders !== 'boolean' || !note(s.closureReason) ||
      !(typeof s.timezone === 'string' || (allowNoTimezone && s.timezone === null)) || !Array.isArray(s.openingHours) || !Array.isArray(s.temporaryExceptions)) return false
  if (s.openingHours.length && (s.openingHours.length !== 7 || [...s.openingHours].map(d => object(d) ? d.dayOfWeek : null).sort().some((d, i) => d !== i + 1))) return false
  for (const d of s.openingHours) {
    if (!object(d) || !Number.isInteger(d.dayOfWeek) || typeof d.closed !== 'boolean' || typeof d.opensAt !== 'string' || typeof d.closesAt !== 'string' || (!d.closed && !rangeValid(d.opensAt, d.closesAt))) return false
  }
  if (s.temporaryExceptions.length > 100) return false
  const dates = new Set<string>()
  for (const e of s.temporaryExceptions) {
    if (!object(e) || !optionalId(e.id) || typeof e.date !== 'string' || !dateValid(e.date) || dates.has(e.date) ||
        typeof e.closed !== 'boolean' || !note(e.reason) || !(e.opensAt === null || typeof e.opensAt === 'string') ||
        !(e.closesAt === null || typeof e.closesAt === 'string') || (!e.closed && !rangeValid(e.opensAt as string ?? '', e.closesAt as string ?? ''))) return false
    dates.add(e.date)
  }
  if (s.temporaryClosure !== null) {
    const c = s.temporaryClosure
    if (!object(c) || !optionalId(c.id) || !note(c.reason) || typeof c.startsAt !== 'string' || typeof c.endsAt !== 'string' ||
        !instantValid(c.startsAt) || !instantValid(c.endsAt) || Date.parse(c.startsAt) >= Date.parse(c.endsAt)) return false
  }
  return true
}

export function validateStoreState(value: unknown, merchantId: string): MerchantStoreState {
  if (!object(value) || value.merchantId !== merchantId || typeof value.configured !== 'boolean' ||
      typeof value.canAcceptOrders !== 'boolean' || typeof value.openStatus !== 'string' || typeof value.updatedAt !== 'string' ||
      !instantValid(value.updatedAt) || !settingsValid(value, !value.configured) || !Array.isArray(value.history) ||
      (value.configured && !value.timezone) || value.history.some(c => !object(c) || typeof c.id !== 'string' || !c.id ||
        typeof c.action !== 'string' || typeof c.actorUserId !== 'string' || !c.actorUserId || typeof c.reason !== 'string' ||
        typeof c.idempotencyKey !== 'string' || !c.idempotencyKey || typeof c.createdAt !== 'string' || !instantValid(c.createdAt))) {
    throw new Error('The server store settings are unavailable or belong to another merchant. Refresh before editing.')
  }
  if (!value.configured && ((value.openingHours as unknown[]).length || (value.temporaryExceptions as unknown[]).length || value.temporaryClosure !== null)) throw new Error('Unconfigured store data is inconsistent. Refresh before editing.')
  return value as MerchantStoreState
}

export async function readMerchantStore(merchantId: string, request: AdminControlRequest): Promise<MerchantStoreState> {
  return validateStoreState(await request(path(merchantId)), merchantId)
}

export function storeDraft(state: MerchantStoreState): StoreDraft {
  return {
    open: state.configured ? state.open : state.canAcceptOrders,
    acceptingOrders: state.configured ? state.acceptingOrders : state.canAcceptOrders,
    timezone: state.timezone ?? '', weeklyEnabled: state.openingHours.length > 0,
    openingHours: state.openingHours.length ? copy(state.openingHours) : Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i + 1, opensAt: '', closesAt: '', closed: false })),
    temporaryExceptions: copy(state.temporaryExceptions), temporaryClosure: copy(state.temporaryClosure),
    closureReason: state.closureReason ?? '', closureEnabled: !!state.temporaryClosure, reason: '',
  }
}

export function prepareMerchantStore(merchantId: string, current: MerchantStoreState, draft: StoreDraft, key: string = crypto.randomUUID()): StoreIntent {
  id(merchantId)
  if (current.merchantId !== merchantId || !instantValid(current.updatedAt)) throw new Error('Load the current merchant before saving.')
  if (typeof draft.open !== 'boolean' || typeof draft.acceptingOrders !== 'boolean' || typeof draft.weeklyEnabled !== 'boolean' || typeof draft.closureEnabled !== 'boolean') throw new Error('Store flags must be explicit choices.')
  if (!draft.reason.trim() || draft.reason.trim().length > 1000) throw new Error('Enter a reason of at most 1000 characters.')
  try { if (!draft.timezone.trim()) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: draft.timezone }) }
  catch { throw new Error('Select a valid store timezone.') }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new Error('The retry identifier is invalid. Review the change again.')
  const days = draft.weeklyEnabled ? copy(draft.openingHours).sort((a, b) => a.dayOfWeek - b.dayOfWeek) : []
  if (days.length && (days.length !== 7 || days.some((d, i) => d.dayOfWeek !== i + 1))) throw new Error('Configure all seven days, or use manual hours.')
  for (const day of days) {
    if (day.closed) { day.opensAt = ''; day.closesAt = '' }
    else if (!rangeValid(day.opensAt, day.closesAt)) throw new Error('Each open day needs HH:mm opening and closing times on the same day. Overnight hours are unsupported.')
  }
  const exceptions = copy(draft.temporaryExceptions).sort((a, b) => a.date.localeCompare(b.date))
  if (exceptions.length > 100 || new Set(exceptions.map(e => e.date)).size !== exceptions.length) throw new Error('Use one exception per date, up to 100 dates.')
  for (const e of exceptions) {
    if (!dateValid(e.date)) throw new Error('Select a valid date for each exception.')
    if (!e.closed && !rangeValid(e.opensAt ?? '', e.closesAt ?? '')) throw new Error('Exception hours must open and close on the same day.')
    e.id = e.id ?? `date-${e.date}`
    if (e.closed) { e.opensAt = null; e.closesAt = null }
    e.reason = e.reason?.trim() || null
    if ((e.reason?.length ?? 0) > 1000) throw new Error('Exception reasons must be at most 1000 characters.')
  }
  let closure = draft.closureEnabled ? copy(draft.temporaryClosure) : null
  if (draft.closureEnabled) {
    if (!closure || !instantValid(closure.startsAt) || !instantValid(closure.endsAt) || Date.parse(closure.startsAt) >= Date.parse(closure.endsAt)) throw new Error('A temporary closure needs valid start and end timestamps, with end after start.')
    closure.id = closure.id ?? 'temporary-closure'; closure.reason = closure.reason?.trim() || null
    if ((closure.reason?.length ?? 0) > 1000) throw new Error('Closure reasons must be at most 1000 characters.')
  }
  if ((draft.closureReason?.trim().length ?? 0) > 1000) throw new Error('The closure note must be at most 1000 characters.')
  return { merchantId, body: { open: draft.open, acceptingOrders: draft.acceptingOrders, timezone: draft.timezone,
    openingHours: days, temporaryExceptions: exceptions, temporaryClosure: closure, closureReason: draft.closureReason?.trim() || null,
    reason: draft.reason.trim(), expectedUpdatedAt: current.updatedAt, idempotencyKey: key } }
}

export function restoreMerchantStoreIntent(value: unknown, merchantId: string): StoreIntent | null {
  try {
    if (!object(value) || Object.keys(value).sort().join(',') !== 'body,merchantId' || value.merchantId !== merchantId || !object(value.body)) return null
    const allowed = ['open','acceptingOrders','timezone','openingHours','temporaryExceptions','temporaryClosure','closureReason','reason','expectedUpdatedAt','idempotencyKey'].sort().join(',')
    if (Object.keys(value.body).sort().join(',') !== allowed || !settingsValid(value.body)) return null
    const i = value as StoreIntent
    const { reason, expectedUpdatedAt, idempotencyKey, ...settings } = i.body
    const current = { ...settings, merchantId, configured: true, updatedAt: expectedUpdatedAt, canAcceptOrders: false, history: [], openStatus: 'REVIEW' }
    return prepareMerchantStore(merchantId, current, { ...settings, weeklyEnabled: settings.openingHours.length > 0, closureEnabled: !!settings.temporaryClosure, reason }, idempotencyKey)
  } catch { return null }
}

export async function writeMerchantStore(intent: StoreIntent, request: AdminControlRequest, acknowledged: () => void): Promise<MerchantStoreState> {
  const result = await request<{ record: unknown; operation: StoreChange }>(path(intent.merchantId), true, 'PUT', copy(intent.body))
  if (!result?.operation || result.operation.idempotencyKey !== intent.body.idempotencyKey) throw new Error('The save response could not be confirmed. Keep the reviewed change and refresh.')
  validateStoreState(result.record, intent.merchantId)
  acknowledged()
  const fresh = await readMerchantStore(intent.merchantId, request)
  if (!fresh.history.some(change => change.idempotencyKey === intent.body.idempotencyKey)) throw new Error('The action was acknowledged but its server history could not be confirmed. Refresh before another change.')
  return fresh
}
