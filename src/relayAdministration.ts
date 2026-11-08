export type RelayAction = 'CREATE_SITE' | 'UPDATE_SITE' | 'CREATE_SLOT' | 'SET_SLOT_AVAILABILITY' | 'SEQUO_DEPOSIT'
export type RelayOperation = { id: string; relayPointId: string; action: RelayAction; actorUserId: string; reason: string; idempotencyKey: string; before: Record<string, string | null> | null; after: Record<string, string | null>; createdAt: string }
export type RelaySite = { id: string; name: string; status: string; operatorUserId: string | null; latitude: number | null; longitude: number | null; city: string | null; neighborhood: string | null; landmark: string | null; updatedAt: string }
export type RelaySlot = { id: string; lockerCode: string; relayPointId: string; status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE'; updatedAt: string }
export type RelaySetup = { site: RelaySite; slots: RelaySlot[]; history: RelayOperation[] }
export type RelayMutation = { record: RelaySetup; operation: RelayOperation; parcelId?: string | null }
export type RelayIntent = { actorId: string; action: RelayAction; path: string; method: 'POST' | 'PATCH' | 'PUT'; body: Record<string, unknown>; siteId: string | null; operationId?: string }
export function relayIntent(action: RelayAction, actorId: string, siteId: string | null, body: Record<string, unknown>, slotId?: string): RelayIntent {
  if (!actorId || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) throw Error('A reason of at most 1000 characters is required.')
  const root = '/api/admin/web/relay-sites'
  if (action !== 'CREATE_SITE' && !siteId) throw Error('Refresh and select a relay site first.')
  const path = action === 'CREATE_SITE' ? root : `${root}/${encodeURIComponent(siteId!)}` +
    (action === 'UPDATE_SITE' ? '/details' : action === 'CREATE_SLOT' ? '/slots' : action === 'SEQUO_DEPOSIT' ? '/deposits' : `/slots/${encodeURIComponent(slotId ?? '')}/availability`)
  if (action === 'SET_SLOT_AVAILABILITY' && !slotId) throw Error('Select a recorded logical slot.')
  return { actorId, action, path, method: action === 'UPDATE_SITE' ? 'PATCH' : action === 'SET_SLOT_AVAILABILITY' ? 'PUT' : 'POST', siteId,
    body: Object.freeze({ ...body, idempotencyKey: crypto.randomUUID() }) }
}
export function validRelayIntent(value: unknown, actorId: string): value is RelayIntent {
  const v = value as RelayIntent | null
  if (!v || v.actorId !== actorId || !v.body || typeof v.body.idempotencyKey !== 'string' || typeof v.body.reason !== 'string') return false
  const paths: Record<RelayAction, [string, RegExp]> = {
    CREATE_SITE: ['POST', /^\/api\/admin\/web\/relay-sites$/], UPDATE_SITE: ['PATCH', /^\/api\/admin\/web\/relay-sites\/[^/]+\/details$/],
    CREATE_SLOT: ['POST', /^\/api\/admin\/web\/relay-sites\/[^/]+\/slots$/], SET_SLOT_AVAILABILITY: ['PUT', /^\/api\/admin\/web\/relay-sites\/[^/]+\/slots\/[^/]+\/availability$/],
    SEQUO_DEPOSIT: ['POST', /^\/api\/admin\/web\/relay-sites\/[^/]+\/deposits$/],
  }
  return Boolean(paths[v.action] && paths[v.action][0] === v.method && paths[v.action][1].test(v.path))
}
export function relayAcknowledged(result: RelayMutation, intent: RelayIntent): boolean {
  const op = result.operation
  return Boolean(op?.id && op.actorUserId === intent.actorId && op.action === intent.action && op.idempotencyKey === intent.body.idempotencyKey &&
    (!intent.siteId || op.relayPointId === intent.siteId) && result.record?.site?.id === op.relayPointId)
}
export function relayConfirmed(record: RelaySetup, intent: RelayIntent): boolean {
  return (record.history ?? []).some(op => op.id === intent.operationId && op.actorUserId === intent.actorId && op.action === intent.action && op.idempotencyKey === intent.body.idempotencyKey && op.relayPointId === record.site.id)
}
export type RelayMission = { id: string; orderId: string; relayPointId: string | null; status: string; destinationType: string; pickupAt: string | null; updatedAt: string; courierId: string | null }
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim())
const date = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v))
const optionalText = (v: unknown) => v === null || typeof v === 'string'
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const stringMap = (v: unknown) => object(v) && Object.values(v).every(optionalText)
function site(value: unknown): value is RelaySite {
  if (!object(value)) return false
  return text(value.id) && text(value.name) && text(value.status) && date(value.updatedAt) &&
    optionalText(value.operatorUserId) && optionalText(value.city) && optionalText(value.neighborhood) && optionalText(value.landmark) &&
    (value.latitude === null || typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90) &&
    (value.longitude === null || typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180)
}
export function parseRelaySites(value: unknown): RelaySite[] {
  if (!Array.isArray(value) || !value.every(site)) throw Error('Relay directory is incomplete. Refresh server state.')
  return value
}
export function parseRelaySetup(value: unknown, id: string): RelaySetup {
  if (!object(value) || !site(value.site) || value.site.id !== id || !Array.isArray(value.slots) || !Array.isArray(value.history) ||
    !value.slots.every(v => object(v) && text(v.id) && text(v.lockerCode) && v.relayPointId === id && date(v.updatedAt) && ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'].includes(String(v.status))) ||
    !value.history.every(v => object(v) && text(v.id) && v.relayPointId === id && text(v.actorUserId) && text(v.idempotencyKey) && text(v.reason) && date(v.createdAt) &&
      ['CREATE_SITE', 'UPDATE_SITE', 'CREATE_SLOT', 'SET_SLOT_AVAILABILITY', 'SEQUO_DEPOSIT'].includes(String(v.action)) && (v.before === null || stringMap(v.before)) && stringMap(v.after))) {
    throw Error('Relay detail is incomplete or belongs to another site. Refresh before acting.')
  }
  return value as unknown as RelaySetup
}
export function parseRelayMission(value: unknown, id: string): RelayMission {
  if (!object(value) || value.id !== id || !text(value.orderId) || !text(value.status) || !text(value.destinationType) || !date(value.updatedAt) ||
    !optionalText(value.courierId) || !optionalText(value.relayPointId) || !(value.pickupAt === null || date(value.pickupAt))) {
    throw Error('Mission detail is incomplete or belongs to another mission. Read it again before receipt.')
  }
  return value as unknown as RelayMission
}
