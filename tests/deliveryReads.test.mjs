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

test('operations renders the persisted choice ETA price and workforce priority', async () => {
  const groups = await readAdminSection('deliveries', async () => ({
    missions: [{id:'mode-mission',deliveryCode:'mode-delivery',orderId:'mode-order',courierId:'salary-rider',
      deliveryMode:'STANDARD',destinationType:'CUSTOMER_ADDRESS',status:'ACCEPTED_BY_COURIER',updatedAt:'2026-11-08T00:00:00Z',
      deliveryOption:{id:'CLASSIC',etaMinMinutes:120,etaMaxMinutes:240,deliveryFeeCfa:400,zoneId:'LOCAL_FIXTURE_ONLY'},
      assignmentWorkforceType:'SequoSalaried',subscriberPriority:true,assignmentReason:'Subscriber order assigned to salaried Sequo delivery capacity.'}],
    merchantSubOrderCounts:{ACCEPTED_BY_SELLER:1},
  }))
  const assignment = groups[0].rows[0].cells[1]
  for (const value of ['Classic','120–240 min','400 CFA','Sequo salaried','Subscriber priority','LOCAL_FIXTURE_ONLY']) assert.ok(assignment.includes(value),assignment)
})
