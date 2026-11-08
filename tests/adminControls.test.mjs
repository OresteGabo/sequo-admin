import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminControlCatalog,
  getAdminControl,
  buildAdminControlRequest,
  readAdminControl,
  runAdminControlAction,
} from '../src/adminControls.ts'

const groups = ['users', 'merchants', 'catalog', 'riders', 'orders', 'deliveries', 'relay', 'returns', 'payments', 'commissions', 'negotiations', 'cooperatives', 'benefits', 'notifications', 'audit', 'settings']

test('all navigation domains expose supported controls or an explicit capability gap', () => {
  assert.deepEqual([...new Set(adminControlCatalog.map(control => control.group))].sort(), groups.sort())
  assert.equal(new Set(adminControlCatalog.map(control => control.id)).size, adminControlCatalog.length)
  for (const control of adminControlCatalog) {
    assert.ok(control.description)
    if (!control.supported) assert.ok(control.reason)
    else assert.ok(control.read)
    for (const action of control.actions) {
      if (!action.supported) assert.ok(action.reason)
      else assert.ok(action.confirmation)
      if (action.readback) assert.ok(getAdminControl(action.readback.controlId).read)
      const names = action.fields.map(field => field.name)
      assert.equal(names.length, new Set(names).size, `${control.id}/${action.id} duplicate fields`)
    }
  }
})

test('catalog create uses the admin route, safe initial state and only declared fields', () => {
  assert.deepEqual(buildAdminControlRequest('catalog-products', 'create', {
    name: ' Rice ', merchantId: 'merchant-a', basePriceCfa: '1400', bargainingEnabled: 'false',
    idempotencyKey: 'create-1', cameraVerified: true, capturedAtLabel: 'made-up', actorUserId: 'foreign',
  }), {
    path: '/api/catalog/products', method: 'POST', body: {
      merchantId: 'merchant-a', name: 'Rice', kind: 'SellerSpecific', status: 'INACTIVE',
      basePriceCfa: 1400, bargainingEnabled: false,
    },
  })
})

test('path identifiers cannot traverse and query IDs are encoded independently', () => {
  for (const productId of ['.', '..']) assert.throws(() => buildAdminControlRequest('catalog-products', 'archive', { productId }), /valid resource/)
  const encoded = buildAdminControlRequest('catalog-products', 'archive', { productId: 'merchant/id?x=#' })
  assert.equal(encoded.path, '/api/catalog/products/merchant%2Fid%3Fx%3D%23/archive')
  assert.equal(buildAdminControlRequest('merchant-orders', null, { merchantId: 'a&history=false', history: false }).path,
    '/api/merchant/sub-orders?merchantId=a%26history%3Dfalse&history=false')
})

test('optional patch fields never acquire create defaults or overwrite absent fields', () => {
  assert.deepEqual(buildAdminControlRequest('catalog-products', 'edit', { productId: 'p', bargainingEnabled: false }), {
    path: '/api/catalog/products/p', method: 'PATCH', body: { bargainingEnabled: false },
  })
  assert.deepEqual(buildAdminControlRequest('catalog-products', 'edit', { productId: 'p', detail: 'First line\nSecond line' }).body,
    { detail: 'First line\nSecond line' })
  assert.throws(() => buildAdminControlRequest('catalog-products', 'edit', { productId: 'p', detail: 'control\u0000text' }), /invalid/)
  assert.throws(() => buildAdminControlRequest('catalog-products', 'archive', { productId: 'p\nq' }), /invalid/)
})

test('number, enum, boolean, required and datetime fields fail closed before transport', () => {
  for (const value of [-1, 1.5, 'Infinity', false]) assert.throws(() => buildAdminControlRequest('catalog-products', 'create', { name: 'Rice', basePriceCfa: value }), /range|number/)
  assert.throws(() => buildAdminControlRequest('catalog-products', 'create', { name: 'Rice', kind: 'FOOD' }), /supported choice/)
  assert.throws(() => buildAdminControlRequest('catalog-products', 'edit', { productId: 'p', bargainingEnabled: 'yes' }), /true or false/)
  assert.throws(() => buildAdminControlRequest('merchant-orders', null), /Merchant ID is required/)
  assert.throws(() => buildAdminControlRequest('courier-availability', 'pause', { courierId: 'c', reason: 'Review', pausedUntil: 'not-a-time' }), /valid date/)
  assert.equal(buildAdminControlRequest('courier-availability', 'pause', { courierId: 'c', reason: 'Review', pausedUntil: '2026-11-08T12:00:00+01:00' }).body.pausedUntil, '2026-11-08T11:00:00.000Z')
})

test('merchant, dispatch, relay and cooperative mutations use their actual server contracts', () => {
  assert.deepEqual(buildAdminControlRequest('merchant-orders', 'mark-packed', { subOrderId: 's', merchantId: 'm', packageCount: '2', customerId: 'forged' }), {
    path: '/api/merchant/sub-orders/s/mark-packed', method: 'POST', body: { merchantId: 'm', packageCount: 2 },
  })
  assert.deepEqual(buildAdminControlRequest('delivery-missions', 'assign', { missionId: 'd', courierId: 'c', workforceType: 'SequoSalaried', reason: 'Reviewed assignment', idempotencyKey: 'assign-key-1' }), {
    path: '/api/delivery/missions/d/assign', method: 'POST', body: { courierId: 'c', reason: 'Reviewed assignment', idempotencyKey: 'assign-key-1' },
  })
  assert.deepEqual(buildAdminControlRequest('relay-parcels', 'review', { parcelId: 'p', eventId: 'e', idempotencyKey: 'k', metadata: 'Inspected\nAwaiting decision', evaluatedAt: '2000-01-01' }), {
    path: '/api/relay/parcels/p/review', method: 'POST', body: { eventId: 'e', idempotencyKey: 'k', metadata: 'Inspected\nAwaiting decision' },
  })
  assert.deepEqual(buildAdminControlRequest('cooperatives', 'review', { cooperativeId: 'g', status: 'APPROVED', reason: 'Verified', actorUserId: 'forged', at: '2000-01-01' }), {
    path: '/api/admin/cooperatives/g/review', method: 'POST', body: { status: 'APPROVED', reason: 'Verified' },
  })
})

test('unsupported provider, unapproved tariff, incomplete media lookup and generic nested editing do not send requests', async () => {
  let calls = 0
  const request = async () => { calls++; throw new Error('Must not send') }
  for (const id of ['provider-money-actions', 'catalog-media']) {
    await assert.rejects(readAdminControl(id, {}, request))
  }
  await assert.rejects(runAdminControlAction('relay-fees', 'assess', {}, request), /approved tariff/)
  await assert.rejects(runAdminControlAction('catalog-customizations', 'edit', {}, request), /structured group\/option/)
  assert.equal(calls, 0)
})

test('read selectors match real wrapped arrays and provider identity; valid empty arrays stay empty', async () => {
  const checkouts = await readAdminControl('payment-checkouts', {}, async path => {
    assert.equal(path, '/api/admin/web/payments?limit=50')
    return { checkouts: [{ checkoutId: 'co', status: 'PAYMENT_PENDING' }], webhookEvents: [] }
  })
  assert.equal(checkouts.rows[0].checkoutId, 'co')
  const providers = await readAdminControl('payment-providers', {}, async () => [{ providerId: 'YAS', integrationStatus: 'NOT_CONNECTED' }])
  assert.equal(providers.rows[0].providerId, 'YAS')
  assert.deepEqual((await readAdminControl('catalog-products', {}, async () => [])).rows, [])
  const price = await readAdminControl('delivery-pricing', {}, async () => ({ active: { profile: 'CURRENT', minimumDeliveryFeeCfa: 400 } }))
  assert.equal(price.rows[0].minimumDeliveryFeeCfa, 400)
})

test('authentication, network, malformed and missing-identity reads never become fabricated empty data', async () => {
  for (const status of [401, 403, 500]) {
    const failure = new Error(`HTTP ${status}`)
    await assert.rejects(readAdminControl('catalog-products', {}, async () => { throw failure }), error => error === failure)
  }
  for (const malformed of [null, {}, ['fake'], [null], [{ name: 'missing ID' }]]) {
    await assert.rejects(readAdminControl('catalog-products', {}, async () => malformed), /server response/)
  }
  await assert.rejects(readAdminControl('payment-checkouts', {}, async () => ({ checkouts: null })), /server response/)
})

test('mutation is sent once without automatic refresh replay and readback preserves server state', async () => {
  const calls = []
  const result = await runAdminControlAction('merchant-orders', 'start-preparation', { subOrderId: 's', merchantId: 'm' }, async (...args) => {
    calls.push(args)
    return args[2] === 'POST' ? { id: 's', status: 'PREPARING' } : { id: 's', status: 'PREPARING', packageCount: 1 }
  })
  assert.deepEqual(calls[0], ['/api/merchant/sub-orders/s/start-preparation', false, 'POST', { merchantId: 'm' }])
  assert.deepEqual(calls[1], ['/api/merchant/sub-orders/s'])
  assert.equal(result.readback.rows[0].status, 'PREPARING')
  assert.equal(result.readbackError, null)
})

test('write rejection propagates without readback; successful write plus failed readback remains an acknowledged partial result', async () => {
  let calls = 0
  const rejection = new Error('Payment not validated')
  await assert.rejects(runAdminControlAction('merchant-orders', 'accept', { subOrderId: 's', merchantId: 'm' }, async () => { calls++; throw rejection }), error => error === rejection)
  assert.equal(calls, 1)
  const result = await runAdminControlAction('merchant-orders', 'accept', { subOrderId: 's', merchantId: 'm' }, async (_path, _retry, method) => {
    calls++
    if (method === 'POST') return { id: 's', status: 'ACCEPTED' }
    throw new Error('Offline')
  })
  assert.equal(calls, 3)
  assert.equal(result.acknowledged, true)
  assert.equal(result.readback, null)
  assert.match(result.readbackError, /acknowledged.*readback failed/)
})

test('eligibility evaluation sends no client timestamp or provider instruction', () => {
  assert.deepEqual(buildAdminControlRequest('payout-eligibility', 'evaluate', { evaluatedAt: '2099-01-01', amountCfa: 900000, provider: 'YAS', markPaid: true }), {
    path: '/api/settlements/merchant-payouts/evaluate-eligible', method: 'POST',
  })
  assert.deepEqual(buildAdminControlRequest('notification-inbox', 'unarchive', { messageId: 'n' }), {
    path: '/api/notifications/inbox/n/archive', method: 'DELETE',
  })
})


test('guarded workforce and relay changes preserve exact server revisions and require stable keys', () => {
  const revision = '2026-11-08T12:00:00.123456789Z'
  const values = { courierId: 'c', workforceType: 'Freelancer', expectedUpdatedAt: revision, reason: 'Approved contract change', idempotencyKey: 'workforce-key-1' }
  assert.deepEqual(buildAdminControlRequest('couriers', 'workforce', values), {
    path: '/api/admin/web/couriers/c/workforce', method: 'PUT', body: {
      workforceType: 'Freelancer', expectedUpdatedAt: revision, reason: 'Approved contract change', idempotencyKey: 'workforce-key-1',
    },
  })
  assert.throws(() => buildAdminControlRequest('couriers', 'workforce', { ...values, expectedUpdatedAt: '' }), /revision.*required/)
  assert.throws(() => buildAdminControlRequest('couriers', 'workforce', { ...values, idempotencyKey: '' }), /retry key.*required/)
  assert.deepEqual(buildAdminControlRequest('relay-site-management', 'remove-operator', {
    relayPointId: 'site', expectedUpdatedAt: revision, reason: 'Approved reassignment', idempotencyKey: 'relay-key-1', operatorUserId: 'not-sent',
  }), {
    path: '/api/admin/web/relay-sites/site/operator', method: 'DELETE', body: {
      expectedUpdatedAt: revision, reason: 'Approved reassignment', idempotencyKey: 'relay-key-1',
    },
  })
  assert.deepEqual(getAdminControl('couriers').actions[0].allowedRoles, ['ADMIN', 'SUPER_ADMIN'])
})

test('exact detail reads reject a different resource including nested admin projections', async () => {
  await assert.rejects(readAdminControl('merchant-order-detail', { subOrderId: 'mine' }, async () => ({ id: 'other' })), /different resource/)
  await assert.rejects(readAdminControl('courier-detail', { courierId: 'mine' }, async () => ({ courier: { id: 'other' } })), /different resource/)
  const order = await readAdminControl('order-detail', { orderId: 'order-1' }, async () => ({ order: { id: 'order-1' }, lines: [], snapshotState: 'UNAVAILABLE_LEGACY', history: [] }))
  assert.equal(order.rows[0].snapshotState, 'UNAVAILABLE_LEGACY')
})


test('access writes are SUPER_ADMIN guidance only and preserve exact revisions and server authority fields', () => {
  const revision = '2026-11-08T12:00:00.123456789Z'
  const control = getAdminControl('user-access-management')
  assert.ok(control.actions.every(action => JSON.stringify(action.allowedRoles) === JSON.stringify(['SUPER_ADMIN'])))
  assert.deepEqual(buildAdminControlRequest(control.id, 'grant-role', { userId: 'existing', roleCode: 'SUPPORT_AGENT', expectedUpdatedAt: revision, reason: 'Approved assignment', idempotencyKey: 'role-key-1', actorUserId: 'forged', authorizationVersion: 'forged' }), {
    path: '/api/admin/web/users/existing/roles/SUPPORT_AGENT', method: 'PUT', body: { expectedUpdatedAt: revision, reason: 'Approved assignment', idempotencyKey: 'role-key-1' },
  })
  assert.throws(() => buildAdminControlRequest(control.id, 'access', { userId: 'existing', active: true, status: 'DELETED', expectedUpdatedAt: revision, reason: 'Not allowed', idempotencyKey: 'access-key-1' }), /supported choice/)
})

test('merchant membership never sends a global role array or silently accepts a different merchant read', async () => {
  assert.deepEqual(buildAdminControlRequest('merchant-memberships', 'set-membership', { merchantId: 'm', userId: 'u', roleCode: 'MERCHANT_STAFF', active: false, expectedUpdatedAt: 'exact-version', reason: 'Scope removal', idempotencyKey: 'membership-key-1', roles: ['ADMIN'] }), {
    path: '/api/admin/web/merchant-memberships/m/u/MERCHANT_STAFF', method: 'PUT', body: { active: false, expectedUpdatedAt: 'exact-version', reason: 'Scope removal', idempotencyKey: 'membership-key-1' },
  })
  assert.throws(() => buildAdminControlRequest('merchant-memberships', 'set-membership', { merchantId: 'm', userId: 'u', roleCode: 'ADMIN' }), /supported choice/)
  await assert.rejects(readAdminControl('merchant-memberships', { merchantId: 'm' }, async () => ({ merchantId: 'foreign', memberships: [], history: [] })), /different resource/)
})


test('merchant availability uses the persisted structured store contract instead of a local-only placeholder', () => {
  const control = getAdminControl('merchant-store-settings')
  assert.equal(control.supported, true)
  assert.equal(control.group, 'merchants')
  assert.deepEqual(buildAdminControlRequest(control.id, null, { merchantId: 'existing-merchant' }), {
    path: '/api/admin/web/merchants/existing-merchant/store', method: 'GET',
  })
  assert.deepEqual(control.actions, [], 'Structured editor owns the nested reviewed settings write')
})


test('manual dispatch decisions carry reasons and replay keys; pause never falsely promises replay', () => {
  for (const action of ['assign', 'reassign', 'assign-policy', 'offer']) {
    const record = getAdminControl('delivery-missions').actions.find(item => item.id === action)
    assert.ok(record.fields.some(field => field.name === 'reason' && field.required && field.maxLength === 1000))
    assert.ok(record.fields.some(field => field.name === 'idempotencyKey' && field.required))
  }
  assert.deepEqual(buildAdminControlRequest('delivery-missions', 'assign-policy', { missionId: 'm', reason: 'Reviewed policy assignment', idempotencyKey: 'policy-key-1', courierId: 'forged', workforceType: 'SequoSalaried', courierFeeCfa: 1, priority: 'forged' }), {
    path: '/api/delivery/missions/m/assign-policy', method: 'POST', body: { reason: 'Reviewed policy assignment', idempotencyKey: 'policy-key-1' },
  })
  assert.deepEqual(buildAdminControlRequest('courier-availability', 'unpause', { courierId: 'c', reason: 'Reviewed return to work', idempotencyKey: 'resume-key-1' }), {
    path: '/api/delivery/missions/couriers/unpause', method: 'POST', body: { courierId: 'c', reason: 'Reviewed return to work', idempotencyKey: 'resume-key-1' },
  })
  assert.equal(getAdminControl('courier-availability').actions.find(action => action.id === 'pause').fields.some(field => field.name === 'idempotencyKey'), false)
  assert.equal(buildAdminControlRequest('delivery-admin-history', null, { missionId: 'm' }).path, '/api/delivery/missions/m/admin-actions')
  assert.equal(buildAdminControlRequest('courier-admin-history', null, { courierId: 'c' }).path, '/api/delivery/missions/couriers/c/admin-actions')
  assert.equal(getAdminControl('user-access-management').read.columns.find(column => column.key === 'user.roles').label, 'Roles')
})


test('administrator bargaining oversight is read-only and uses redacted admin routes rather than participant identity', async () => {
  const control = getAdminControl('negotiation-oversight')
  assert.equal(control.supported, true)
  assert.deepEqual(control.actions, [])
  assert.deepEqual(buildAdminControlRequest(control.id, null, { merchantId: 'm' }), {
    path: '/api/admin/web/bargaining-threads?limit=50&merchantId=m', method: 'GET',
  })
  assert.equal(buildAdminControlRequest('negotiation-detail', null, { threadId: 'thread' }).path, '/api/admin/web/bargaining-threads/thread')
  let calls = 0
  await assert.rejects(runAdminControlAction(control.id, 'counteroffer', { threadId: 'thread', amountCfa: 1 }, async () => { calls++; return {} }), /not supported/)
  assert.equal(calls, 0)
})


test('approved delivery tariff edits preserve the exact revision and exclude client actor or effective-time overrides', () => {
  const value = { minimumDeliveryFeeCfa: 400, extraKmFeeCfa: 100, includedKm: 5,
    approvalReference: 'Approved tariff record', reason: 'Confirmed by SEQUO', expectedRevision: 'exact-server-revision',
    idempotencyKey: 'tariff-reviewed-key', actorUserId: 'forged', effectiveFrom: '2000-01-01', active: true }
  const built = buildAdminControlRequest('delivery-price-management', 'set-prices', value)
  assert.equal(built.path, '/api/admin/web/delivery-pricing/manage')
  assert.equal(built.body.expectedRevision, value.expectedRevision)
  assert.equal(built.body.idempotencyKey, value.idempotencyKey)
  assert.equal(built.body.actorUserId, undefined)
  assert.equal(built.body.effectiveFrom, undefined)
  assert.equal(built.body.active, undefined)
  assert.throws(() => buildAdminControlRequest('delivery-price-management', 'set-prices', { ...value, approvalReference: '' }), /approval reference.*required/i)
  assert.throws(() => buildAdminControlRequest('delivery-price-management', 'set-prices', { ...value, includedKm: 1.5 }), /whole|integer|number|range/i)
})
