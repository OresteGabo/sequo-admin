export type MediaProduct = { id: string; merchantId: string | null; name: string; kind: 'SellerSpecific' | 'GenericSealedItem'; status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'; photoRequired: boolean; cameraVerified: boolean; imageUrl: string | null; capturedAtLabel: string | null; updatedAt: string }
export type MediaHistory = { id: string; action: string; actorUserId: string; reason: string; createdAt: string }
export type ProductMediaState = { product: MediaProduct; approvedGenericImageUrl: string | null; previewDataUrl: string | null; history: MediaHistory[] }
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, n = 1000): v is string => typeof v === 'string' && v.length <= n && !/[\u0000-\u001f\u007f]/.test(v)
const nullable = (v: unknown): v is string | null => v === null || text(v)
const instant = (v: unknown): v is string => text(v, 64) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
export function mediaPath(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id.includes('..')) throw new Error('Enter a valid existing product ID.')
  return `/api/admin/web/catalog/products/${encodeURIComponent(id)}/media`
}
export function approvedImageUrl(value: unknown): value is string {
  if (!text(value, 500)) return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}
export function decodeProductMedia(value: unknown, expectedId: string): ProductMediaState {
  const invalid = () => { throw new Error('The server media state is unavailable. Refresh before changing this product.') }
  if (!object(value) || !object(value.product)) return invalid()
  const p = value.product
  if (p.id !== expectedId || !nullable(p.merchantId) || !text(p.name, 180) || !['SellerSpecific', 'GenericSealedItem'].includes(String(p.kind)) || !['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(String(p.status)) || typeof p.photoRequired !== 'boolean' || typeof p.cameraVerified !== 'boolean' || !nullable(p.imageUrl) || !nullable(p.capturedAtLabel) || !instant(p.updatedAt)) return invalid()
  if (value.approvedGenericImageUrl !== null && !approvedImageUrl(value.approvedGenericImageUrl)) return invalid()
  if (value.previewDataUrl !== null && (!text(value.previewDataUrl, 200000) || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value.previewDataUrl))) return invalid()
  if (!Array.isArray(value.history) || value.history.length > 50 || value.history.some(h => !object(h) || !text(h.id, 128) || !text(h.actorUserId, 128) || !text(h.action, 32) || !text(h.reason, 1000) || !instant(h.createdAt))) return invalid()
  return value as ProductMediaState
}
export function mediaIntent(state: ProductMediaState, reason: string, idempotencyKey: string, action: 'generic' | 'ACTIVE' | 'INACTIVE'): { path: string; body: Record<string, string> } {
  mediaPath(state.product.id)
  if (!reason.trim() || !text(reason, 1000)) throw new Error('Enter the reason for this change (up to 1000 characters).')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) throw new Error('A stable retry key is required.')
  if (action === 'generic' && (state.product.kind !== 'GenericSealedItem' || !state.approvedGenericImageUrl)) throw new Error('No approved generic image is available for this product.')
  return { path: mediaPath(state.product.id) + (action === 'generic' ? '/photos' : '/publication'), body: {
    reason: reason.trim(), expectedUpdatedAt: state.product.updatedAt, idempotencyKey,
    ...(action === 'generic' ? { source: 'GenericCatalogReference', catalogImageId: 'standard' } : { status: action }),
  } }
}
export function genericUploadIntent(state: ProductMediaState, reason: string, key: string, file: File, approved: boolean): { path: string; body: FormData } {
  if (state.product.kind !== 'GenericSealedItem') throw new Error('A generic upload cannot replace the required camera photograph.')
  if (!approved) throw new Error('Confirm SEQUO approval of this image for the standard product.')
  if (file.type !== 'image/jpeg' || !/\.jpe?g$/i.test(file.name) || file.size <= 0 || file.size > 8 * 1024 * 1024) throw new Error('Choose a JPEG image of at most 8 MiB.')
  const base = mediaIntent(state, reason, key, 'INACTIVE').body
  const body = new FormData()
  for (const [name, value] of Object.entries(base)) if (name !== 'status') body.set(name, value)
  body.set('genericApproved', 'true'); body.set('file', file)
  return { path: mediaPath(state.product.id) + '/photos/generic', body }
}
