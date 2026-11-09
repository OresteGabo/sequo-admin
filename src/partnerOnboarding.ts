import type { AdminControlRequest } from './adminControls'
export type PartnerKind = 'VENDOR' | 'RIDER' | 'HUB'
export type PartnerDraft = { displayName: string; email: string; phoneNumber: string; businessName: string; city: string; neighborhood: string; landmark: string; latitude: string; longitude: string; vehicleType: string }
export type PartnerDetails = { displayName: string; email: string | null; phoneNumber: string | null; businessName: string | null; city: string; neighborhood: string; landmark: string | null; latitude: number | null; longitude: number | null; vehicleType: string | null }
export type PartnerPreview = { details: PartnerDetails; existingAccount: { id: string; publicReference: string; displayName: string | null; email: string | null; phoneNumber: string | null; roles: string[]; updatedAt: string } | null }
export type PartnerOperation = { id: string; action: string; kind: PartnerKind; actorUserId: string | null; actorReference: string | null; applicationId: string | null; userId: string | null; userReference: string | null; entityId: string | null; entityReference: string | null; reason: string; details: PartnerDetails; createdAt: string }
export type PartnerApplication = { id: string; kind: PartnerKind; state: 'PENDING' | 'APPROVED' | 'REJECTED'; details: PartnerDetails; submittedAt: string; updatedAt: string; reviewReason: string | null; operation: PartnerOperation | null; history: PartnerOperation[] }
export type PartnerIntent = { actorId: string; kind: PartnerKind; action: 'REGISTER' | 'APPROVE' | 'REJECT'; applicationId: string | null; body: { details?: PartnerDetails; expectedUserUpdatedAt?: string | null; expectedApplicationUpdatedAt?: string; workforceType?: string; reason: string; idempotencyKey: string } }
export const blankPartnerDraft = (): PartnerDraft => ({ displayName:'', email:'', phoneNumber:'', businessName:'', city:'', neighborhood:'', landmark:'', latitude:'', longitude:'', vehicleType:'' })
export const draftFromDetails = (d: PartnerDetails): PartnerDraft => ({ displayName:d.displayName ?? '', email:d.email ?? '', phoneNumber:d.phoneNumber ?? '', businessName:d.businessName ?? '', city:d.city ?? '', neighborhood:d.neighborhood ?? '', landmark:d.landmark ?? '', latitude:d.latitude == null ? '' : String(d.latitude), longitude:d.longitude == null ? '' : String(d.longitude), vehicleType:d.vehicleType ?? '' })
export function partnerDetails(kind: PartnerKind, d: PartnerDraft): PartnerDetails {
  if (!d.displayName.trim() || !d.city.trim() || !d.neighborhood.trim()) throw Error('Enter the person’s name, city and neighborhood.')
  if (!d.email.trim() && !d.phoneNumber.trim()) throw Error('Provide an email or international phone number.')
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) throw Error('Check the email address.')
  if (d.phoneNumber.trim() && !/^\+[1-9][0-9]{7,14}$/.test(d.phoneNumber.trim().replace(/[ -]/g,''))) throw Error('Use an international phone number, for example +228…')
  if (kind !== 'RIDER' && !d.businessName.trim()) throw Error('Enter the shop or hub name.')
  if (kind === 'RIDER' && !['Moto','Bicycle','Car','Van'].includes(d.vehicleType)) throw Error('Choose the rider vehicle.')
  const lat = d.latitude.trim() ? Number(d.latitude) : null, lon = d.longitude.trim() ? Number(d.longitude) : null
  if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180))) throw Error('Enter both valid coordinates or leave both empty.')
  if (kind === 'HUB' && lat === null) throw Error('Confirm the hub coordinates before approval.')
  return { displayName:d.displayName.trim(), email:d.email.trim() || null, phoneNumber:d.phoneNumber.trim() || null, businessName:kind === 'RIDER' ? null : d.businessName.trim(), city:d.city.trim(), neighborhood:d.neighborhood.trim(), landmark:d.landmark.trim() || null, latitude:lat, longitude:lon, vehicleType:kind === 'RIDER' ? d.vehicleType : null }
}
export function preparePartnerIntent(actorId: string, kind: PartnerKind, preview: PartnerPreview, reason: string, key: string, workforceType: string, application: PartnerApplication | null = null): PartnerIntent {
  if (!actorId || !reason.trim() || reason.trim().length > 1000 || !key || (kind === 'RIDER' && !['Freelancer','SequoSalaried'].includes(workforceType))) throw Error('Confirm the review reason and workforce.')
  if (application && (application.state !== 'PENDING' || application.kind !== kind)) throw Error('Refresh this application before reviewing it.')
  return structuredClone({ actorId, kind, action: application ? 'APPROVE' : 'REGISTER', applicationId:application?.id ?? null, body: { details:preview.details, expectedUserUpdatedAt:preview.existingAccount?.updatedAt ?? null, workforceType, reason:reason.trim(), idempotencyKey:key, ...(application ? { expectedApplicationUpdatedAt:application.updatedAt } : {}) } })
}
export function restorePartnerIntent(raw: string, actorId: string, kind: PartnerKind): PartnerIntent {
  const value = JSON.parse(raw) as PartnerIntent
  if (!value || value.actorId !== actorId || value.kind !== kind || !['REGISTER','APPROVE','REJECT'].includes(value.action) || !value.body?.idempotencyKey || !value.body.reason || (value.action !== 'REGISTER' && !/^[a-f0-9-]{36}$/i.test(value.applicationId ?? '')) || (value.action !== 'REJECT' && !value.body.details)) throw Error('The saved partner review is invalid. Inspect server history before clearing it.')
  return value
}
export async function sendPartnerIntent(request: AdminControlRequest, intent: PartnerIntent): Promise<PartnerOperation> {
  const path = intent.action === 'REGISTER' ? `/api/admin/web/onboarding/${intent.kind}` : `/api/admin/web/partner-applications/${encodeURIComponent(intent.applicationId!)}/${intent.action.toLowerCase()}`
  const result = await request<PartnerOperation>(path, true, 'POST', intent.body)
  if (result.actorUserId !== intent.actorId || result.kind !== intent.kind || result.action !== intent.action || result.applicationId !== intent.applicationId || !result.id || (intent.action !== 'REJECT' && (!result.entityId || !result.userId || !result.entityReference || !result.userReference))) throw Error('The server did not confirm the reviewed partner operation. Retry the saved intent.')
  return result
}
