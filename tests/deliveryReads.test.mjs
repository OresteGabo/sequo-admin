import assert from 'node:assert/strict'
import test from 'node:test'
import { readAdminSection } from '../src/adminReads.ts'

test('delivery view renders the refreshed API state for the same order', async () => {
  for (const status of ['OFFERED_TO_COURIER', 'ACCEPTED_BY_COURIER', 'PICKED_UP_FROM_SELLER', 'DELIVERED_TO_CUSTOMER']) {
    const groups = await readAdminSection('deliveries', async (path) => {
      assert.equal(path, '/api/admin/web/deliveries')
      return {
        missions: [{
          id: 'mission-1', deliveryCode: 'delivery-1', orderId: 'order-1',
          courierId: 'courier-1', deliveryMode: 'STANDARD', destinationType: 'CUSTOMER_ADDRESS',
          status, updatedAt: '2026-11-07T10:00:00Z',
        }],
        merchantSubOrderCounts: { HANDED_TO_COURIER: 1 },
      }
    })
    const row = groups[0].rows[0]
    assert.equal(row.id, 'mission-1')
    assert.match(row.cells[0], /order-1/)
    assert.match(row.cells[1], /courier-1/)
    assert.match(row.cells[2].toLowerCase(), new RegExp(status.toLowerCase().replaceAll('_', ' ')))
  }
})

test('expired or denied admin reads propagate to the existing error handler', async () => {
  await assert.rejects(readAdminSection('deliveries', async () => {
    throw new Error('Session expired')
  }), /Session expired/)
})
