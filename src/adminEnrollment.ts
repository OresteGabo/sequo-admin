import type { AdminControlRequest } from './adminControls'

export type EnrollmentKind = 'merchant' | 'courier'
export type EnrollmentOperation = { id: string; kind: 'MERCHANT' | 'COURIER'; userId: string; entityId: string; actorUserId: string; reason: string; idempotencyKey: string; createdAt: string; recordedName: string | null; workforceType: string | null; vehicleType: string | null }
export type EnrollmentSnapshot = {
  user: { id: string; email: string | null; displayName: string | null; active: boolean; status: string; roles: string[]; updatedAt: string }
  merchants: { id: string; name: string; status: string; createdAt: string; updatedAt: string }[]
  courier: { id: string; status: string; workforceType: string | null; vehicleType: string | null; createdAt: string; updatedAt: string } | null
  history: EnrollmentOperation[]
}
export type EnrollmentDraft = { userId: string; name: string; workforceType: string; vehicleType: string; reason: string }
export type EnrollmentIntent = { version: 1; actorId: string; kind: EnrollmentKind; userId: string; body: Record<string, string> }
const record = (x: unknown): Record<string, unknown> => { if (!x || typeof x !== 'object' || Array.isArray(x)) throw Error('Enrollment response is unavailable. Refresh before continuing.'); return x as Record<string, unknown> }
const text = (x: unknown, max = 255): string => { if (typeof x !== 'string' || !x.trim() || x.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x)) throw Error('Invalid enrollment value.'); return x }
const id = (x: unknown) => { const value = text(x, 128); if (value === '.' || value === '..' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw Error('Select a valid existing account.'); return value }
const nullable = (x: unknown): string | null => { if (x === null) return null; if (typeof x !== 'string' || x.length > 255 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x)) throw Error('Invalid enrollment value.'); return x }
const date = (x: unknown) => { const value = text(x, 64); if (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('The current server revision is unavailable.'); return value }
const array = (x: unknown): unknown[] => { if (!Array.isArray(x) || x.length > 1000) throw Error('Enrollment records are unavailable.'); return x }
const vehicles = ['Moto', 'Bicycle', 'Car', 'Van']
const workforces = ['SequoSalaried', 'Freelancer']

export function parseEnrollmentSnapshot(value: unknown, expectedUserId: string): EnrollmentSnapshot {
  const data = record(value), u = record(data.user)
  if (id(u.id) !== expectedUserId || typeof u.active !== 'boolean') throw Error('The server returned another account. Refresh before continuing.')
  const user = { id: id(u.id), email: nullable(u.email), displayName: nullable(u.displayName), active: u.active, status: text(u.status), roles: array(u.roles).map(role => text(role, 32)), updatedAt: date(u.updatedAt) }
  const merchants = array(data.merchants).map(value => { const m = record(value); return { id: id(m.id), name: text(m.name, 160), status: text(m.status), createdAt: date(m.createdAt), updatedAt: date(m.updatedAt) } })
  const c = data.courier === null ? null : record(data.courier)
  const courier = c ? { id: id(c.id), status: text(c.status), workforceType: nullable(c.workforceType), vehicleType: nullable(c.vehicleType), createdAt: date(c.createdAt), updatedAt: date(c.updatedAt) } : null
  const history = array(data.history).map(value => {
    const h = record(value)
    if (!['MERCHANT', 'COURIER'].includes(String(h.kind)) || id(h.userId) !== expectedUserId) throw Error('Enrollment history is unavailable.')
    return { id: id(h.id), kind: h.kind as 'MERCHANT' | 'COURIER', userId: id(h.userId), entityId: id(h.entityId), actorUserId: id(h.actorUserId), reason: text(h.reason, 1000), idempotencyKey: id(h.idempotencyKey), createdAt: date(h.createdAt), recordedName: nullable(h.recordedName), workforceType: nullable(h.workforceType), vehicleType: nullable(h.vehicleType) }
  })
  return { user, merchants, courier, history }
}
export async function readEnrollment(request: AdminControlRequest, userId: string) {
  return parseEnrollmentSnapshot(await request(`/api/admin/web/enrollment/users/${encodeURIComponent(id(userId))}`), userId)
}
export function prepareEnrollment(kind: EnrollmentKind, actorId: string, draft: EnrollmentDraft, snapshot: EnrollmentSnapshot, key: string): EnrollmentIntent {
  if (snapshot.user.id !== draft.userId || snapshot.user.id === actorId) throw Error('Select another existing account and load its current details.')
  const role = kind === 'merchant' ? 'MERCHANT_OWNER' : 'COURIER'
  if (!snapshot.user.active || snapshot.user.status !== 'ACTIVE' || !snapshot.user.roles.includes(role)) throw Error(`Select an active account with ${role}. A SUPER_ADMIN must grant the role separately; enrollment never grants it.`)
  const body: Record<string, string> = { userId: id(draft.userId), expectedUserUpdatedAt: date(snapshot.user.updatedAt), reason: text(draft.reason.trim(), 1000), idempotencyKey: id(key) }
  if (kind === 'merchant') {
    body.name = text(draft.name.trim(), 160)
    if (snapshot.merchants.some(m => m.name.toLocaleLowerCase() === body.name!.toLocaleLowerCase())) throw Error('This account already owns a merchant with that name. Use the existing record.')
  } else {
    if (snapshot.courier) throw Error('This account already has a rider profile. Use its existing workforce controls.')
    if (!workforces.includes(draft.workforceType) || !vehicles.includes(draft.vehicleType)) throw Error('Choose the recorded workforce and supported vehicle.')
    body.workforceType = draft.workforceType; body.vehicleType = draft.vehicleType
  }
  return { version: 1, actorId: id(actorId), kind, userId: body.userId!, body }
}
export const enrollmentStorageKey = (actorId: string, kind: EnrollmentKind) => `sequo_admin_enrollment_pending:${id(actorId)}:${kind}`
export function restoreEnrollment(raw: string, actorId: string, kind: EnrollmentKind): EnrollmentIntent {
  const value = record(JSON.parse(raw)), body = record(value.body)
  if (value.version !== 1 || value.actorId !== actorId || value.kind !== kind || body.userId !== value.userId) throw Error('Saved enrollment belongs to another session or profile.')
  const expected = kind === 'merchant' ? ['userId', 'expectedUserUpdatedAt', 'reason', 'idempotencyKey', 'name'] : ['userId', 'expectedUserUpdatedAt', 'reason', 'idempotencyKey', 'workforceType', 'vehicleType']
  if (Object.keys(body).length !== expected.length || Object.keys(body).some(k => !expected.includes(k))) throw Error('Saved enrollment is invalid.')
  const restored = Object.fromEntries(expected.map(k => [k, text(body[k], k === 'reason' ? 1000 : 160)]))
  id(restored.userId); id(restored.idempotencyKey); date(restored.expectedUserUpdatedAt)
  if (kind === 'courier' && (!workforces.includes(restored.workforceType!) || !vehicles.includes(restored.vehicleType!))) throw Error('Saved enrollment is invalid.')
  return { version: 1, actorId: id(actorId), kind, userId: id(value.userId), body: restored }
}
function confirmed(snapshot: EnrollmentSnapshot, intent: EnrollmentIntent): EnrollmentOperation | undefined {
  const operation = snapshot.history.find(h => h.idempotencyKey === intent.body.idempotencyKey)
  if (!operation) return undefined
  if (operation.actorUserId !== intent.actorId || operation.kind !== intent.kind.toUpperCase() || operation.reason !== intent.body.reason ||
      (intent.kind === 'merchant' ? operation.recordedName !== intent.body.name : operation.workforceType !== intent.body.workforceType || operation.vehicleType !== intent.body.vehicleType)) throw Error('The saved enrollment history conflicts with this reviewed intent. Investigate before continuing.')
  const exists = intent.kind === 'merchant' ? snapshot.merchants.some(m => m.id === operation.entityId) : snapshot.courier?.id === operation.entityId
  if (!exists) throw Error('The enrollment history and current profile disagree. Investigate before continuing.')
  return operation
}
export async function submitEnrollment(request: AdminControlRequest, intent: EnrollmentIntent): Promise<{ snapshot: EnrollmentSnapshot; operation: EnrollmentOperation }> {
  const before = await readEnrollment(request, intent.userId)
  const prior = confirmed(before, intent)
  if (prior) return { snapshot: before, operation: prior }
  await request(`/api/admin/web/enrollment/${intent.kind === 'merchant' ? 'merchants' : 'couriers'}`, false, 'POST', intent.body)
  const after = await readEnrollment(request, intent.userId), operation = confirmed(after, intent)
  if (!operation) throw Error('The enrollment acknowledgement is not confirmed by server history. Refresh or review the exact saved retry.')
  return { snapshot: after, operation }
}
