/** Supported operator contracts only. Authentication and server role/state guards stay authoritative. */
export type AdminControlGroup = 'users' | 'merchants' | 'catalog' | 'riders' | 'orders' | 'deliveries' | 'relay' | 'returns' | 'payments' | 'commissions' | 'negotiations' | 'cooperatives' | 'benefits' | 'notifications' | 'audit' | 'settings'
export type AdminControlMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
export type AdminControlRequest = <T>(path: string, retryAfterRefresh?: boolean, method?: AdminControlMethod, body?: unknown) => Promise<T>
export type AdminControlValues = Record<string, unknown>
export type AdminControlField = {
  name: string; label: string; type: 'string' | 'number' | 'boolean' | 'enum' | 'datetime'
  location: 'path' | 'query' | 'body'; required?: boolean; options?: readonly string[]
  description?: string; placeholder?: string; defaultValue?: string | number | boolean
  valueFrom?: string; integer?: boolean; min?: number; max?: number; maxLength?: number
}
export type AdminControlColumn = { key: string; label: string; format?: 'text' | 'money' | 'date' | 'boolean' | 'count' }
export type AdminControlRead = {
  path: string; fields?: readonly AdminControlField[]; resultPath?: string; shape: 'list' | 'record'
  rowId: string; columns: readonly AdminControlColumn[]
}
export type AdminControlAction = {
  id: string; label: string; description?: string; supported: boolean; reason?: string
  method: Exclude<AdminControlMethod, 'GET'>; path: string; fields: readonly AdminControlField[]
  allowedRoles?: readonly string[]
  confirmation: string; readback?: { controlId: string; values?: Record<string, string> }
}
export type AdminControlDescriptor = {
  id: string; group: AdminControlGroup; label: string; description: string; supported: boolean; reason?: string
  read?: AdminControlRead; actions: readonly AdminControlAction[]
}
export type AdminControlReadResult = { controlId: string; data: unknown; rows: Record<string, unknown>[] }
export type AdminControlActionResult = {
  acknowledged: true; response: unknown; readback: AdminControlReadResult | null; readbackError: string | null
}
export type BuiltAdminControlRequest = { path: string; method: AdminControlMethod; body?: Record<string, unknown> }

const idField = (name: string, label: string, location: AdminControlField['location'] = 'path', valueFrom = 'id'): AdminControlField => ({ name, label, location, valueFrom, type: 'string', required: true, maxLength: 128 })
const merchantQuery: AdminControlField = { ...idField('merchantId', 'Merchant ID', 'query', 'merchantId'), required: true }
const bodyText = (name: string, label: string, required = true): AdminControlField => ({ name, label, type: 'string', location: 'body', required, maxLength: 2000 })
const numeric = (name: string, label: string, location: AdminControlField['location'] = 'body', min = 0, max = 2147483647): AdminControlField => ({ name, label, type: 'number', location, integer: true, min, max, required: true })
const choice = (name: string, label: string, options: readonly string[], location: AdminControlField['location'] = 'body'): AdminControlField => ({ name, label, options, location, type: 'enum', required: true })
const cols = (...keys: string[]): AdminControlColumn[] => keys.map(key => ({ key, label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), ...(key.endsWith('Cfa') ? { format: 'money' as const } : key.endsWith('At') ? { format: 'date' as const } : {}) }))
const pageLimit: AdminControlField = { ...numeric('limit', 'Maximum records', 'query', 1, 100), defaultValue: 50 }
const unavailable = (id: string, group: AdminControlGroup, label: string, reason: string): AdminControlDescriptor => ({ id, group, label, description: reason, supported: false, reason, actions: [] })
const adminRead = (id: string, group: AdminControlGroup, label: string, path: string, columns: readonly AdminControlColumn[], resultPath?: string, description = 'Authenticated server records. Refresh to read the current persisted state.', rowId = 'id'): AdminControlDescriptor => ({ id, group, label, description, supported: true, read: { path, shape: 'list', rowId, columns, fields: [pageLimit], ...(resultPath ? { resultPath } : {}) }, actions: [] })
const merchantOrderStatuses = ['MERCHANT_PENDING', 'ACCEPTED', 'PREPARING', 'PACKED_READY', 'HANDED_TO_COURIER', 'REJECTED', 'CANCELLED']
const missionStatuses = ['CREATED', 'OFFERED_TO_COURIER', 'ACCEPTED_BY_COURIER', 'PICKED_UP_FROM_SELLER', 'DEPOSITED_AT_RELAY', 'HANDED_TO_SEQUO', 'DELIVERED_TO_CUSTOMER', 'RELEASED_BY_RELAY', 'PROBLEM_REPORTED', 'CANCELLED']
const missionId = idField('missionId', 'Mission ID')
const parcelId = idField('parcelId', 'Parcel ID')
const returnId = idField('returnId', 'Return ID')
const cooperativeId = idField('cooperativeId', 'Cooperative ID')
const subOrderId = idField('subOrderId', 'Merchant order ID')
const keyField: AdminControlField = { ...bodyText('idempotencyKey', 'Stable retry key'), maxLength: 128, description: 'Keep the same key and identical fields if the response is lost.' }
const custodyFields = [parcelId, { ...bodyText('eventId', 'Unique event ID'), maxLength: 128 }, keyField, bodyText('metadata', 'Operator note')]
const productFields: readonly AdminControlField[] = [
  { name: 'merchantId', label: 'Merchant ID', location: 'body', type: 'string', maxLength: 128 },
  { name: 'name', label: 'Product name', location: 'body', type: 'string', required: true, maxLength: 180 },
  { name: 'kind', label: 'Product policy', location: 'body', type: 'enum', options: ['SellerSpecific', 'GenericSealedItem'], defaultValue: 'SellerSpecific' },
  { name: 'status', label: 'Initial state', location: 'body', type: 'enum', options: ['INACTIVE', 'ACTIVE'], defaultValue: 'INACTIVE', description: 'Publication remains subject to the server photo policy.' },
  { name: 'category', label: 'Category', location: 'body', type: 'string', maxLength: 128 },
  { name: 'subcategory', label: 'Subcategory', location: 'body', type: 'string', maxLength: 128 },
  { name: 'detail', label: 'Description', location: 'body', type: 'string', maxLength: 500 },
  { name: 'basePriceCfa', label: 'Price (CFA)', location: 'body', type: 'number', integer: true, min: 0 },
  { name: 'bargainingEnabled', label: 'Bargaining enabled', location: 'body', type: 'boolean' },
]
const productPatchFields: readonly AdminControlField[] = [idField('productId', 'Product ID'), ...productFields
  .filter(field => field.name !== 'merchantId' && field.name !== 'kind')
  .map(field => ({ ...field, required: false, defaultValue: undefined, valueFrom: field.name === 'basePriceCfa' ? 'priceCfa' : field.name }))]

export const adminControlCatalog: readonly AdminControlDescriptor[] = [
  {
    id: 'catalog-products', group: 'catalog', label: 'Products', supported: true,
    description: 'Live catalog including inactive records for authorized administrators. Server policy controls publishing and product photos.',
    read: { path: '/api/catalog/products', shape: 'list', rowId: 'id', fields: [{ ...merchantQuery, required: false },
      { name: 'includeArchived', label: 'Include inactive / archived', location: 'query', type: 'boolean', defaultValue: true }],
      columns: [{ key: 'name', label: 'Product' }, { key: 'merchantId', label: 'Merchant' }, { key: 'status', label: 'State' }, { key: 'priceCfa', label: 'Price', format: 'money' }, { key: 'bargainingEnabled', label: 'Negotiable', format: 'boolean' }] },
    actions: [
      { id: 'create', label: 'Create product', supported: true, method: 'POST', path: '/api/catalog/products', fields: [...productFields, { ...keyField, required: false }],
        confirmation: 'Create this product on the server? Review the returned state before publishing. A lost create response must be investigated before repeating.', readback: { controlId: 'catalog-products' } },
      { id: 'edit', label: 'Save product changes', supported: true, method: 'PATCH', path: '/api/catalog/products/{productId}', fields: productPatchFields,
        confirmation: 'Apply these product changes? Existing orders keep their recorded prices.', readback: { controlId: 'catalog-products' } },
      { id: 'archive', label: 'Archive product', supported: true, method: 'POST', path: '/api/catalog/products/{productId}/archive', fields: [idField('productId', 'Product ID')],
        confirmation: 'Archive this catalog product? Existing order history is retained.', readback: { controlId: 'catalog-products' } },
    ],
  },
  { id: 'order-detail', group: 'orders', label: 'Order lines, destination and history', supported: true, description: 'Actual recorded product quantities, options, destination and actor events. Unavailable legacy snapshots stay explicitly unavailable.', read: { path: '/api/admin/web/orders/{orderId}', fields: [idField('orderId', 'Order ID')], shape: 'record', rowId: 'order.id', columns: cols('order.id', 'order.orderStatus', 'order.paymentStatus', 'snapshotState', 'lines', 'history') }, actions: [] },
  {
    id: 'couriers', group: 'riders', label: 'Riders and workforce', supported: true, description: 'Existing rider accounts, recorded workforce and availability. Workforce changes require an exact revision, reason and stable retry key; historical mission snapshots are preserved.',
    read: { path: '/api/admin/web/couriers', shape: 'list', rowId: 'id', columns: cols('displayName', 'status', 'workforceType', 'activeMissionCount', 'updatedAt') },
    actions: [{ id: 'workforce', label: 'Change recorded workforce', supported: true, allowedRoles: ['ADMIN', 'SUPER_ADMIN'], method: 'PUT', path: '/api/admin/web/couriers/{courierId}/workforce', fields: [idField('courierId', 'Courier ID'), { ...choice('workforceType', 'Workforce', ['SequoSalaried', 'Freelancer']), valueFrom: 'workforceType' }, { ...bodyText('expectedUpdatedAt', 'Current server revision'), valueFrom: 'updatedAt', maxLength: 64, description: 'Exact updatedAt value from the selected server record; do not change or round it.' }, bodyText('reason', 'Change reason'), keyField], confirmation: 'Change this existing rider’s workforce classification? Confirm authorization and current assignments. Existing missions and recorded earnings retain their historical workforce.', readback: { controlId: 'courier-detail' } }],
  },
  { id: 'courier-detail', group: 'riders', label: 'Rider detail and workforce history', supported: true, description: 'Recorded availability, remuneration summary and actor history. Provider transfers remain unavailable until integrated.', read: { path: '/api/admin/web/couriers/{courierId}', fields: [idField('courierId', 'Courier ID')], shape: 'record', rowId: 'courier.id', columns: cols('courier.displayName', 'courier.status', 'courier.workforceType', 'payOverview', 'history') }, actions: [] },
  {
    id: 'relay-site-management', group: 'relay', label: 'Relay sites and assigned operators', supported: true, description: 'Existing relay sites and current operator assignments. Reassign only an authorized existing operator; an assignment does not grant a role or create an account.',
    read: { path: '/api/admin/web/relay-sites', shape: 'list', rowId: 'id', columns: cols('name', 'status', 'operatorDisplayName', 'city', 'neighborhood', 'updatedAt') },
    actions: [
      { id: 'assign-operator', label: 'Assign relay operator', supported: true, allowedRoles: ['ADMIN', 'SUPER_ADMIN'], method: 'PUT', path: '/api/admin/web/relay-sites/{relayPointId}/operator', fields: [idField('relayPointId', 'Relay site ID'), idField('operatorUserId', 'Existing operator user ID', 'body', 'operatorUserId'), { ...bodyText('expectedUpdatedAt', 'Current server revision'), valueFrom: 'updatedAt', maxLength: 64, description: 'Exact updatedAt value from the selected server record; preserve its precision.' }, bodyText('reason', 'Assignment reason'), keyField], confirmation: 'Assign this authorized operator to the existing relay site? This changes site access; confirm the account and current assignment.', readback: { controlId: 'relay-site-detail' } },
      { id: 'remove-operator', label: 'Remove relay operator assignment', supported: true, allowedRoles: ['ADMIN', 'SUPER_ADMIN'], method: 'DELETE', path: '/api/admin/web/relay-sites/{relayPointId}/operator', fields: [idField('relayPointId', 'Relay site ID'), { ...bodyText('expectedUpdatedAt', 'Current server revision'), valueFrom: 'updatedAt', maxLength: 64 }, bodyText('reason', 'Removal reason'), keyField], confirmation: 'Remove the operator assignment from this relay site? Existing parcel and actor history is retained.', readback: { controlId: 'relay-site-detail' } },
    ],
  },
  { id: 'relay-site-detail', group: 'relay', label: 'Relay assignment history', supported: true, description: 'Persisted relay site assignment and actor/reason/retry history.', read: { path: '/api/admin/web/relay-sites/{relayPointId}', fields: [idField('relayPointId', 'Relay site ID')], shape: 'record', rowId: 'site.id', columns: cols('site.name', 'site.status', 'site.operatorDisplayName', 'history') }, actions: [] },

  adminRead('users', 'users', 'Accounts', '/api/admin/web/users', cols('displayName', 'email', 'phoneNumber', 'status', 'active', 'roles', 'createdAt')),
  unavailable('user-access-management', 'users', 'Roles and merchant membership', 'This API has no admin role grant, account disable or merchant membership management endpoint. Appoint an authorized access operator; do not use a customer or merchant session to impersonate another account.'),
  adminRead('merchants', 'merchants', 'Merchants', '/api/admin/web/merchants', cols('name', 'status', 'commissionRateBps', 'createdAt')),
  unavailable('merchant-store-settings', 'merchants', 'Store hours and profile changes', 'Vendor store hours and open/closed settings currently use a local repository on both mobile platforms. There is no persisted admin store-settings contract.'),
  {
    id: 'catalog-customizations', group: 'catalog', label: 'Food options and supplements', supported: true,
    description: 'Read actual product option IDs, availability, constraints and price supplements. The Vendor structured editor persists these through the server.',
    read: { path: '/api/catalog/products/{productId}/customizations', fields: [idField('productId', 'Product ID')], shape: 'list', rowId: 'id', columns: cols('name', 'minChoices', 'maxChoices', 'active', 'options') },
    actions: [{ id: 'edit', label: 'Replace option groups', supported: false, reason: 'This nested option model requires a structured group/option editor. The existing Vendor editor supports it; a raw JSON replacement form is not offered here.', method: 'PUT', path: '/api/catalog/products/{productId}/customizations', fields: [], confirmation: '' }],
  },
  unavailable('catalog-media', 'catalog', 'Camera photos and approved images', 'Camera upload and generic-image selection currently require an authorized merchant membership on merchant-scoped endpoints. Administrators cannot fabricate camera verification or upload on behalf of a merchant through the current API.'),
  adminRead('orders', 'orders', 'Customer orders', '/api/admin/web/orders', cols('id', 'customerFacingStatus', 'paymentStatus', 'orderStatus', 'totalCfa', 'createdAt'), undefined, 'Recorded orders and payment states. Customer checkout and pickup proof remain customer-owned; administrators cannot mark a payment paid.'),
  {
    id: 'merchant-orders', group: 'orders', label: 'Merchant preparation', supported: true,
    description: 'Read each merchant part, frozen prices, commission and preparation state. All actions retain server paid-order and state checks.',
    read: { path: '/api/merchant/sub-orders', fields: [merchantQuery, { name: 'history', label: 'Include completed and rejected orders', type: 'boolean', location: 'query', defaultValue: true }, { ...choice('status', 'State', merchantOrderStatuses, 'query'), required: false }], shape: 'list', rowId: 'id', columns: cols('subOrderCode', 'orderId', 'status', 'packageCount', 'itemSubtotalCfa', 'merchantNetCfa', 'updatedAt') },
    actions: [
      ...[['accept', 'Accept order'], ['start-preparation', 'Start preparation'], ['handoff', 'Hand over to courier']].map(([id, label]): AdminControlAction => ({ id: id!, label: label!, supported: true, method: 'POST', path: `/api/merchant/sub-orders/{subOrderId}/${id}`, fields: [subOrderId, idField('merchantId', 'Merchant ID', 'body', 'merchantId')], confirmation: `${label}? Confirm the physical order and merchant before recording this transition.`, readback: { controlId: 'merchant-order-detail' } })),
      { id: 'mark-packed', label: 'Mark ready for pickup', supported: true, method: 'POST', path: '/api/merchant/sub-orders/{subOrderId}/mark-packed', fields: [subOrderId, idField('merchantId', 'Merchant ID', 'body', 'merchantId'), numeric('packageCount', 'Package count', 'body', 1, 1000)], confirmation: 'Record these packages as packed and ready for pickup?', readback: { controlId: 'merchant-order-detail' } },
      { id: 'reject', label: 'Reject merchant order', supported: true, method: 'POST', path: '/api/merchant/sub-orders/{subOrderId}/reject', fields: [subOrderId, idField('merchantId', 'Merchant ID', 'body', 'merchantId'), bodyText('reason', 'Reason')], confirmation: 'Reject this merchant part? This can block dispatch of the whole order.', readback: { controlId: 'merchant-order-detail' } },
    ],
  },
  { id: 'merchant-order-detail', group: 'orders', label: 'Merchant order detail', supported: true, description: 'Frozen merchant lines, quantities, commission and server preparation deadlines.', read: { path: '/api/merchant/sub-orders/{subOrderId}', fields: [subOrderId], shape: 'record', rowId: 'id', columns: cols('subOrderCode', 'status', 'packageCount', 'sellerResponseDueAt', 'packingDueAt', 'lines') }, actions: [] },
  {
    id: 'merchant-escalations', group: 'orders', label: 'Preparation escalations', supported: true, description: 'Recorded operator escalations for a merchant order; publishing overdue warnings does not change the paid-order prerequisites.',
    read: { path: '/api/merchant/sub-orders/{subOrderId}/escalations', fields: [subOrderId], shape: 'list', rowId: 'id', columns: cols('reason', 'note', 'actorUserId', 'createdAt') },
    actions: [{ id: 'escalate', label: 'Record escalation', supported: true, method: 'POST', path: '/api/merchant/sub-orders/{subOrderId}/escalations', fields: [subOrderId, choice('reason', 'Reason', ['SELLER_RESPONSE_SLA_EXCEEDED', 'PACKING_SLA_EXCEEDED', 'MANUAL_SUPPORT_REVIEW']), bodyText('note', 'Operator note')], confirmation: 'Record this escalation with your authenticated actor identity?', readback: { controlId: 'merchant-escalations' } }],
  },
  adminRead('delivery-overview', 'deliveries', 'Delivery overview', '/api/admin/web/deliveries', cols('deliveryCode', 'orderId', 'courierId', 'status', 'assignmentWorkforceType', 'updatedAt'), 'missions'),
  {
    id: 'delivery-missions', group: 'deliveries', label: 'Dispatch missions', supported: true, description: 'Active operational missions by default. Select a recorded state to inspect final missions. Assignment and resolution stay server-controlled.',
    read: { path: '/api/delivery/missions', fields: [{ ...idField('courierId', 'Courier ID', 'query', 'courierId'), required: false }, { ...choice('status', 'State', missionStatuses, 'query'), required: false }], shape: 'list', rowId: 'id', columns: cols('deliveryCode', 'orderId', 'courierId', 'status', 'destinationType', 'updatedAt') },
    actions: [
      { id: 'dispatch-ready', label: 'Dispatch ready merchant orders', supported: true, method: 'POST', path: '/api/delivery/missions/dispatch-ready', fields: [{ ...numeric('limit', 'Maximum orders', 'query', 1, 100), defaultValue: 50 }], confirmation: 'Evaluate ready paid orders and create eligible dispatch missions using the existing policy?', readback: { controlId: 'delivery-missions' } },
      ...[['assign', 'Assign courier'], ['reassign', 'Reassign courier']].map(([id, label]): AdminControlAction => ({ id: id!, label: label!, supported: true, method: 'POST', path: `/api/delivery/missions/{missionId}/${id}`, fields: [missionId, idField('courierId', 'Courier ID', 'body', 'courierId')], confirmation: `${label} on this mission? Confirm the current assignment and availability.`, readback: { controlId: 'delivery-mission-detail' } })),
      { id: 'offer', label: 'Offer assigned mission', supported: true, method: 'POST', path: '/api/delivery/missions/{missionId}/offer', fields: [missionId], confirmation: 'Offer this assigned mission to its recorded courier?', readback: { controlId: 'delivery-mission-detail' } },
      ...[['cancel', 'Cancel mission'], ['force-problem', 'Report operational problem']].map(([id, label]): AdminControlAction => ({ id: id!, label: label!, supported: true, method: 'POST', path: `/api/delivery/missions/{missionId}/${id}`, fields: [missionId, bodyText('reason', 'Reason')], confirmation: `${label}? The recorded server state will be changed.`, readback: { controlId: 'delivery-mission-detail' } })),
      { id: 'resolve-problem', label: 'Resolve reported problem', supported: true, method: 'POST', path: '/api/delivery/missions/{missionId}/resolve-problem', fields: [missionId, choice('action', 'Resolution', ['REQUEUE_FOR_DISPATCH', 'CANCEL_MISSION']), bodyText('reason', 'Reason'), { ...idField('replacementCourierId', 'Replacement courier ID', 'body', 'courierId'), required: false }], confirmation: 'Apply this recorded resolution? Requeue remains subject to dispatch and custody checks.', readback: { controlId: 'delivery-mission-detail' } },
    ],
  },
  { id: 'delivery-mission-detail', group: 'deliveries', label: 'Mission detail', supported: true, description: 'Persisted mission and assignment. Rider pickup, handoff and delivery proof must use the authorized custody flow.', read: { path: '/api/delivery/missions/{missionId}', fields: [missionId], shape: 'record', rowId: 'id', columns: cols('deliveryCode', 'orderId', 'courierId', 'status', 'destinationType', 'updatedAt') }, actions: [] },
  { id: 'delivery-resolutions', group: 'audit', label: 'Delivery resolution history', supported: true, description: 'Recorded operator resolution actors and reasons.', read: { path: '/api/delivery/missions/{missionId}/problem-resolutions', fields: [missionId], shape: 'list', rowId: 'id', columns: cols('action', 'reason', 'actorUserId', 'createdAt') }, actions: [] },
  {
    id: 'courier-availability', group: 'riders', label: 'Courier availability', supported: true, description: 'Inspect and pause dispatch availability for a known courier. This does not create an account or edit a workforce contract.',
    read: { path: '/api/delivery/missions/couriers/{courierId}/availability', fields: [idField('courierId', 'Courier ID', 'path', 'courierId')], shape: 'record', rowId: 'courierId', columns: cols('courierId', 'paused', 'pausedReason', 'pausedUntil', 'updatedAt') },
    actions: [
      { id: 'pause', label: 'Pause courier dispatch', supported: true, method: 'POST', path: '/api/delivery/missions/couriers/pause', fields: [idField('courierId', 'Courier ID', 'body', 'courierId'), bodyText('reason', 'Reason'), { name: 'pausedUntil', label: 'Pause until (optional)', location: 'body', type: 'datetime' }], confirmation: 'Pause new dispatch for this courier? Existing mission custody is retained.', readback: { controlId: 'courier-availability' } },
      { id: 'unpause', label: 'Resume courier dispatch', supported: true, method: 'POST', path: '/api/delivery/missions/couriers/unpause', fields: [idField('courierId', 'Courier ID', 'body', 'courierId')], confirmation: 'Resume this courier’s dispatch availability?', readback: { controlId: 'courier-availability' } },
    ],
  },
  unavailable('courier-enrollment', 'riders', 'Rider enrollment', 'There is no admin rider-account creation endpoint. Workforce edits apply only to existing rider records and must not rewrite historical mission or earnings snapshots.'),
  { id: 'relay-sites', group: 'relay', label: 'Relay sites', supported: true, description: 'Authorized active relay sites. Site membership remains server-scoped.', read: { path: '/api/relay/parcels/sites', shape: 'list', rowId: 'id', columns: cols('name', 'canReturnToSeller') }, actions: [] },
  {
    id: 'relay-parcels', group: 'relay', label: 'Relay parcel custody', supported: true, description: 'Actual persisted parcels at an authorized site. Review and seller return are explicit operator decisions.',
    read: { path: '/api/relay/parcels', fields: [idField('relayPointId', 'Relay site ID', 'query', 'relayPointId')], shape: 'list', rowId: 'id', columns: cols('id', 'orderId', 'status', 'depositedAt', 'pickedUpAt', 'collectedAt') },
    actions: [
      ...[['review', 'Record overdue review'], ['problem', 'Report parcel problem'], ['return-to-seller', 'Record return to seller']].map(([id, label]): AdminControlAction => ({ id: id!, label: label!, supported: true, method: 'POST', path: `/api/relay/parcels/{parcelId}/${id}`, fields: custodyFields, confirmation: `${label}? Confirm actual custody and keep the same event and retry IDs if the response is lost.`, readback: { controlId: 'relay-parcel-detail' } })),
    ],
  },
  { id: 'relay-parcel-detail', group: 'relay', label: 'Parcel history and deadlines', supported: true, description: 'Deposit, withdrawal, delays and actor history from the real repository.', read: { path: '/api/relay/parcels/{parcelId}', fields: [parcelId], shape: 'record', rowId: 'id', columns: cols('id', 'relayPointId', 'status', 'depositedAt', 'pickedUpAt', 'history') }, actions: [] },
  { id: 'relay-overdue', group: 'relay', label: 'Overdue queue', supported: true, description: 'Fees are eligible strictly after eight days; operator review is due at thirty days from deposit. No automated disposition is implied.', read: { path: '/api/relay/parcels/overdue', fields: [idField('relayPointId', 'Relay site ID', 'query', 'relayPointId')], shape: 'list', rowId: 'id', columns: cols('id', 'status', 'depositedAt', 'custody') }, actions: [{ id: 'evaluate', label: 'Evaluate site deadlines', supported: true, method: 'POST', path: '/api/relay/parcels/deadlines/evaluate', fields: [idField('relayPointId', 'Relay site ID', 'body', 'relayPointId')], confirmation: 'Evaluate overdue records using server time? This records delay events; it does not approve a new tariff or dispose of parcels.', readback: { controlId: 'relay-overdue' } }] },
  { id: 'relay-fees', group: 'relay', label: 'Recorded storage fee history', supported: true, description: 'Existing fee assessments remain visible. A tariff and active-parcel applicability need approved policy before charging.', read: { path: '/api/relay/parcels/storage-fees', fields: [idField('relayPointId', 'Relay site ID', 'query', 'relayPointId')], shape: 'list', rowId: 'id', columns: cols('relayParcelId', 'measuredUntil', 'totalFeeCfa', 'dailyFeeCfa', 'chargeableDays') }, actions: [{ id: 'assess', label: 'Assess storage fees', supported: false, reason: 'An approved tariff and policy for active parcels are required. This interface does not invent a daily fee or authorize retroactive charges.', method: 'POST', path: '/api/relay/parcels/storage-fees/assess', fields: [], confirmation: '' }] },
  unavailable('relay-pickup-proof', 'relay', 'Pickup code / QR validation', 'The scoped operator pickup flow requires the actual one-time code or QR and identity-match confirmation. Use the existing dedicated relay pickup surface; code issuance or release is not replaced with an unchecked admin toggle.'),
  { id: 'returns', group: 'returns', label: 'Return requests', supported: true, description: 'Persisted return requests and custody history. Use the dedicated return workflow below for collection, receipt, inspection and refund instructions.', read: { path: '/api/returns', shape: 'list', rowId: 'id', columns: cols('id', 'orderId', 'status', 'requestedAt', 'requestedRefundCfa', 'refundInstruction') }, actions: [] },
  { id: 'return-detail', group: 'returns', label: 'Return custody detail', supported: true, description: 'Actor history, inspection and instruction status. REQUESTED / NOT_SUBMITTED is not a completed refund.', read: { path: '/api/returns/{returnId}', fields: [returnId], shape: 'record', rowId: 'id', columns: cols('id', 'orderId', 'status', 'inspectionDecision', 'refundDeadlineState', 'refundInstruction') }, actions: [] },
  adminRead('payment-checkouts', 'payments', 'Pending and completed checkouts', '/api/admin/web/payments', cols('checkoutId', 'status', 'paymentProvider', 'amountCfa', 'orderStatus', 'createdAt'), 'checkouts', 'The server payment queue includes unfulfilled pending records. Provider adapters remain disconnected until approved integration and sandbox evidence exist.', 'checkoutId'),
  adminRead('payment-events', 'payments', 'Verified callback investigation', '/api/admin/web/payments', cols('eventId', 'provider', 'checkoutId', 'status', 'reconciliationStatus', 'reconciliationReason', 'receivedAt'), 'webhookEvents', 'Normalized verified evidence and reconciliation outcomes. This is an investigation read; it cannot make a client payment successful.'),
  adminRead('merchant-payout-queue', 'payments', 'Merchant payout queue', '/api/admin/web/payments', cols('id', 'merchantId', 'merchantNetCfa', 'status', 'activeReturnHold', 'activeDisputeHold', 'payoutDueBy'), 'merchantPayouts'),
  { id: 'merchant-payouts', group: 'payments', label: 'Merchant settlement history', supported: true, description: 'Accrued/held/approved are pending. SentToProvider records issuance; Paid records settlement evidence. No transfer is initiated by this screen.', read: { path: '/api/settlements/merchant-payouts', fields: [merchantQuery], shape: 'list', rowId: 'id', columns: cols('id', 'orderId', 'merchantNetCfa', 'commissionCfa', 'status', 'activeReturnHold', 'payoutDueBy') }, actions: [] },
  { id: 'payout-eligibility', group: 'payments', label: 'Payout eligibility evaluation', supported: true, description: 'Evaluate due and held payout candidates using server time. This operation does not contact a payment provider.', read: { path: '/api/admin/web/payments', fields: [pageLimit], resultPath: 'merchantPayouts', shape: 'list', rowId: 'id', columns: cols('id', 'merchantId', 'status', 'payoutEligibleAt') }, actions: [{ id: 'evaluate', label: 'Evaluate payout eligibility', supported: true, method: 'POST', path: '/api/settlements/merchant-payouts/evaluate-eligible', fields: [], confirmation: 'Evaluate payout eligibility and existing holds at server time? No funds will be sent.', readback: { controlId: 'payout-eligibility' } }] },
  { id: 'payment-providers', group: 'payments', label: 'Provider connection readiness', supported: true, description: 'Safe configuration and connection diagnostics only. Keys and raw callback content are never requested here.', read: { path: '/api/payments/providers', shape: 'list', rowId: 'providerId', columns: cols('displayName', 'configuredReadiness', 'integrationStatus', 'apiConfigured', 'checkoutConnected') }, actions: [] },
  unavailable('provider-money-actions', 'payments', 'Refund execution and money transfers', 'Provider refund and payout adapters are not integrated. A persisted refund instruction or payable is not proof of funds sent. Approved provider specifications, account binding, credentials and sandbox verification are required.'),
  adminRead('commission-policy', 'commissions', 'Commission policy and overrides', '/api/admin/web/commissions', cols('merchantId', 'commissionRateBps', 'reason', 'updatedByUserId', 'updatedAt'), 'overrides', 'Use the dedicated commission panel for guarded writes with revision, reason, stable retry key and audit readback. Existing order snapshots retain their commission.'),
  unavailable('negotiation-oversight', 'negotiations', 'Customer and seller negotiations', 'The existing bargaining API permits the actual customer and authorized merchant participants only. There is no admin oversight endpoint or administrator counteroffer authority; merchant scope and accepted-price ownership must not be bypassed.'),
  {
    id: 'cooperatives', group: 'cooperatives', label: 'Cooperatives and approval', supported: true, description: 'Operator-assisted grouping uses persisted approved cooperatives. Approval and membership changes retain authenticated actor history.',
    read: { path: '/api/admin/cooperatives', shape: 'list', rowId: 'id', columns: cols('code', 'name', 'city', 'status', 'members', 'reviewedAt') },
    actions: [
      { id: 'create', label: 'Create cooperative', supported: true, method: 'POST', path: '/api/admin/cooperatives', fields: [bodyText('code', 'Code'), bodyText('name', 'Name'), bodyText('city', 'City'), bodyText('area', 'Area', false), idField('ownerMerchantId', 'Owner merchant ID', 'body', 'ownerMerchantId')], confirmation: 'Create this cooperative with the specified owner merchant?', readback: { controlId: 'cooperatives' } },
      { id: 'add-member', label: 'Add merchant member', supported: true, method: 'POST', path: '/api/admin/cooperatives/{cooperativeId}/members', fields: [cooperativeId, idField('merchantId', 'Merchant ID', 'body', 'merchantId'), { ...choice('role', 'Membership role', ['OWNER', 'MEMBER']), defaultValue: 'MEMBER' }], confirmation: 'Add this merchant to the cooperative with the selected role?', readback: { controlId: 'cooperatives' } },
      { id: 'review', label: 'Record cooperative decision', supported: true, method: 'POST', path: '/api/admin/cooperatives/{cooperativeId}/review', fields: [cooperativeId, choice('status', 'Decision', ['APPROVED', 'REJECTED', 'SUSPENDED']), bodyText('reason', 'Decision reason')], confirmation: 'Record this cooperative decision and reason under your operator identity?', readback: { controlId: 'cooperatives' } },
    ],
  },
  { id: 'consolidations', group: 'cooperatives', label: 'Grouped order manifests', supported: true, description: 'Persisted merchant packages, collection prerequisites and final dispatch. Use the dedicated grouped-order workflow below to perform transitions.', read: { path: '/api/consolidations', shape: 'list', rowId: 'manifestId', columns: cols('manifestId', 'orderId', 'status', 'cooperativeId', 'sellerPackages') }, actions: [] },
  { id: 'subscription-plans', group: 'benefits', label: 'Approved subscription plans', supported: true, description: 'Public approved active plans. Unapproved configuration does not grant a discount; customer activation requires verified paid evidence.', read: { path: '/api/subscriptions/plans', shape: 'list', rowId: 'id', columns: cols('name', 'monthlyPriceCfa', 'deliveryDiscountPercent', 'monthlyDiscountCapCfa') }, actions: [] },
  unavailable('benefit-activation', 'benefits', 'Subscription, loyalty and referral activation', 'There is no admin activation or benefit-award API. SEQUO must approve the policy and payment/tenure evidence; authorized operations applies the documented server process. A customer cannot grant benefits or cash out referral credit.'),
  {
    id: 'notification-inbox', group: 'notifications', label: 'Your operator inbox', supported: true, description: 'Only the signed-in operator’s messages. This does not reveal other users’ inboxes or send broadcasts.',
    read: { path: '/api/notifications/inbox', fields: [pageLimit, { name: 'includeArchived', label: 'Include archived', type: 'boolean', location: 'query', defaultValue: false }], shape: 'list', rowId: 'id', columns: cols('title', 'eventType', 'severity', 'createdAt', 'readAt', 'archivedAt') },
    actions: [
      { id: 'read', label: 'Mark message read', supported: true, method: 'PATCH', path: '/api/notifications/inbox/{messageId}/read', fields: [idField('messageId', 'Message ID')], confirmation: 'Mark your message as read?', readback: { controlId: 'notification-inbox' } },
      { id: 'archive', label: 'Archive message', supported: true, method: 'POST', path: '/api/notifications/inbox/{messageId}/archive', fields: [idField('messageId', 'Message ID')], confirmation: 'Archive your message?', readback: { controlId: 'notification-inbox' } },
      { id: 'unarchive', label: 'Restore archived message', supported: true, method: 'DELETE', path: '/api/notifications/inbox/{messageId}/archive', fields: [idField('messageId', 'Message ID')], confirmation: 'Restore your archived message?', readback: { controlId: 'notification-inbox' } },
    ],
  },
  unavailable('notification-broadcast', 'notifications', 'Broadcast and delivery-provider management', 'There is no arbitrary admin broadcast or SMS/push-provider configuration endpoint. Device registration and notification preferences remain account-owned; provider credentials belong in approved deployment configuration.'),
  { id: 'operations-monitoring', group: 'audit', label: 'Operational monitoring', supported: true, description: 'Live delivery capacity, preparation backlog, relay delays, notification outbox, payout candidates and return bottlenecks. This is operational monitoring, not a complete security audit log.', read: { path: '/api/admin/monitoring/operations', shape: 'record', rowId: 'generatedAt', columns: cols('generatedAt', 'deliveryCapacity', 'merchantFulfillment', 'relayOperations', 'notificationOutbox', 'payoutQueue', 'returnBottlenecks') }, actions: [] },
  { id: 'delivery-pricing', group: 'settings', label: 'Effective delivery prices', supported: true, description: 'The active server price profile. Changes require the documented approved configuration process; quotes remain server authoritative.', read: { path: '/api/admin/web/delivery-pricing', resultPath: 'active', shape: 'record', rowId: 'profile', columns: cols('profile', 'minimumDeliveryFeeCfa', 'includedKm', 'extraKmFeeCfa', 'effectiveFrom') }, actions: [] },
  { id: 'business-parameters', group: 'settings', label: 'Business policy and pending decisions', supported: true, description: 'Named non-secret effective policy values, approval status, change authority and verification steps. This is not an environment dump.', read: { path: '/api/admin/web/business-parameters', resultPath: 'parameters', shape: 'list', rowId: 'key', columns: cols('label', 'state', 'effectiveValues', 'changeAuthority', 'pendingDecision') }, actions: [] },

]

export function getAdminControl(id: string): AdminControlDescriptor {
  const control = adminControlCatalog.find(item => item.id === id)
  if (!control) throw new Error('This control is not supported by the admin client.')
  return control
}

function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined
    return current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
  }, value)
}

function fieldValue(field: AdminControlField, values: AdminControlValues): string | number | boolean | undefined {
  const supplied = values[field.name] ?? field.defaultValue
  if (supplied === undefined || supplied === null || (typeof supplied === 'string' && !supplied.trim())) {
    if (field.required) throw new Error(`${field.label} is required.`)
    return undefined
  }
  if (field.type === 'boolean') {
    if (supplied === true || supplied === 'true') return true
    if (supplied === false || supplied === 'false') return false
    throw new Error(`${field.label} must be true or false.`)
  }
  if (field.type === 'number') {
    if (typeof supplied !== 'number' && typeof supplied !== 'string') throw new Error(`${field.label} must be a number.`)
    const number = Number(supplied)
    if (!Number.isFinite(number) || (field.integer && !Number.isSafeInteger(number)) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
      throw new Error(`${field.label} is outside its supported range.`)
    }
    return number
  }
  if (typeof supplied !== 'string') throw new Error(`${field.label} must be text.`)
  const text = supplied.trim()
  if ((field.maxLength !== undefined && text.length > field.maxLength) || (field.location === 'body' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(text)) throw new Error(`${field.label} is invalid or too long.`)
  if (field.type === 'enum' && !field.options?.includes(text)) throw new Error(`${field.label} is not a supported choice.`)
  if (field.type === 'datetime') {
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) throw new Error(`${field.label} must be a valid date and time.`)
    return date.toISOString()
  }
  return text
}

function build(pathTemplate: string, method: AdminControlMethod, fields: readonly AdminControlField[], values: AdminControlValues): BuiltAdminControlRequest {
  if (!pathTemplate.startsWith('/api/') || pathTemplate.includes('://')) throw new Error('Unsupported admin API path.')
  let path = pathTemplate
  const query = new URLSearchParams()
  const body: Record<string, unknown> = {}
  for (const field of fields) {
    const value = fieldValue(field, values)
    if (value === undefined) continue
    if (field.location === 'path') {
      if (value === '.' || value === '..') throw new Error(`${field.label} is not a valid resource identifier.`)
      path = path.replaceAll(`{${field.name}}`, encodeURIComponent(String(value)))
    }
    else if (field.location === 'query') query.set(field.name, String(value))
    else body[field.name] = value
  }
  if (/[{}]/.test(path)) throw new Error('Select the required resource before continuing.')
  if (query.size) path += `?${query}`
  return { path, method, ...(Object.keys(body).length ? { body } : {}) }
}

export function buildAdminControlRequest(controlId: string, actionId: string | null, values: AdminControlValues = {}): BuiltAdminControlRequest {
  const control = getAdminControl(controlId)
  if (!control.supported) throw new Error(control.reason ?? 'This service is not available on the connected API.')
  if (actionId === null) {
    if (!control.read) throw new Error('This service has no supported read endpoint.')
    return build(control.read.path, 'GET', control.read.fields ?? [], values)
  }
  const action = control.actions.find(item => item.id === actionId)
  if (!action || !action.supported) throw new Error(action?.reason ?? 'This action is not supported.')
  return build(action.path, action.method, action.fields, values)
}

export async function readAdminControl(controlId: string, values: AdminControlValues, request: AdminControlRequest): Promise<AdminControlReadResult> {
  const control = getAdminControl(controlId)
  const call = buildAdminControlRequest(controlId, null, values)
  const data = await request<unknown>(call.path)
  const selected = control.read?.resultPath ? valueAt(data, control.read.resultPath) : data
  const rows = control.read?.shape === 'list' ? selected : [selected]
  if (!Array.isArray(rows) || rows.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) throw new Error('The server response does not match this resource. Refresh before acting.')
  if (rows.some(row => { const id = valueAt(row, control.read!.rowId); return (typeof id !== 'string' && typeof id !== 'number') || id === '' })) throw new Error('The server response is missing resource identities. Refresh before acting.')
  const identityFields = control.read!.fields?.filter(field => field.location === 'path') ?? []
  if (control.read!.shape === 'record' && identityFields.length === 1 && rows.length === 1) {
    const requested = fieldValue(identityFields[0]!, values)
    if (requested !== undefined && String(valueAt(rows[0], control.read!.rowId)) !== String(requested)) throw new Error('The server returned a different resource. Refresh before acting.')
  }
  return { controlId, data, rows: rows as Record<string, unknown>[] }
}

export async function runAdminControlAction(controlId: string, actionId: string, values: AdminControlValues, request: AdminControlRequest): Promise<AdminControlActionResult> {
  const control = getAdminControl(controlId)
  const call = buildAdminControlRequest(controlId, actionId, values)
  const action = control.actions.find(item => item.id === actionId)!
  // No blind replay of mutations; the transport still enforces authenticated sessions and server errors.
  const response = await request<unknown>(call.path, false, call.method, call.body)
  const result: AdminControlActionResult = { acknowledged: true, response, readback: null, readbackError: null }
  if (action.readback) {
    const readValues: AdminControlValues = { ...values }
    for (const [target, source] of Object.entries(action.readback.values ?? {})) readValues[target] = source.startsWith('response.') ? valueAt(response, source.slice(9)) : values[source]
    try { result.readback = await readAdminControl(action.readback.controlId, readValues, request) }
    catch { result.readbackError = 'The server acknowledged this action, but readback failed. Refresh and inspect the record before repeating.' }
  }
  return result
}
