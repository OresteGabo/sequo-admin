import assert from 'node:assert/strict'
import test from 'node:test'
import { readFinanceSource } from '../src/financeReads.ts'
import { readAdminSection } from '../src/adminReads.ts'

const entry = (sourceType, sourceId, account, amountCfa) => ({ id: `${sourceId}:${account}`, sourceType, sourceId, account,
  direction: account === 'SequoDeliveryShortfallExpense' ? 'Debit' : 'Credit', amountCfa,
  merchantId: sourceType === 'OrderItem' ? 'merchant-1' : null, courierId: sourceType === 'DeliveryMission' ? 'courier-1' : null,
  relayPointId: null, workforceType: sourceType === 'DeliveryMission' ? 'Freelancer' : null,
  description: 'Persisted fixture entry', createdAt: '2026-11-08T12:00:00Z' })
const snapshot = { id: 'sub-1', orderId: 'order-1', merchantId: 'merchant-1', status: 'HANDED_TO_COURIER',
  itemSubtotalCfa: 4000, commissionRateBps: 1500, commissionCfa: 600, merchantNetCfa: 3400 }

test('mission finance shows posted courier payable separately from the SEQUO shortfall expense', async () => {
  const result = await readFinanceSource('DeliveryMission', 'mission:1', async path => {
    assert.equal(path, '/api/settlements/ledger?sourceType=DeliveryMission&sourceId=mission%3A1')
    return [entry('DeliveryMission', 'mission:1', 'CourierPayable', 400), entry('DeliveryMission', 'mission:1', 'SequoDeliveryShortfallExpense', 80)]
  })
  assert.deepEqual(result.ledger.map(item => [item.account, item.direction, item.amountCfa]), [['CourierPayable', 'Credit', 400], ['SequoDeliveryShortfallExpense', 'Debit', 80]])
  assert.equal(result.snapshot, null)
  assert.deepEqual(result.errors, [])
})

test('supported legacy ledger remains visible when its source has no merchant sub-order snapshot', async () => {
  const result = await readFinanceSource('OrderItem', 'legacy-line', async path => {
    if (path.startsWith('/api/merchant/')) throw new Error('Not found')
    return [entry('OrderItem', 'legacy-line', 'MerchantPayable', 3400), entry('OrderItem', 'legacy-line', 'SequoCommissionRevenue', 600)]
  })
  assert.equal(result.ledger.length, 2)
  assert.equal(result.snapshot, null)
  assert.match(result.errors.join(' '), /snapshot is unavailable/)
})

test('failed ledger is unavailable rather than an invented zero balance while a valid frozen snapshot remains readable', async () => {
  const result = await readFinanceSource('OrderItem', 'sub-1', async path => {
    if (path.startsWith('/api/settlements/')) throw new Error('Service unavailable')
    return snapshot
  })
  assert.equal(result.ledger, null)
  assert.equal(result.snapshot.commissionRateBps, 1500)
  assert.equal(result.snapshot.merchantNetCfa, 3400)
  assert.match(result.errors.join(' '), /Posted ledger could not be read/)
})

test('a mismatched source response cannot replace the selected financial record', async () => {
  const result = await readFinanceSource('DeliveryMission', 'mission-1', async () => [entry('DeliveryMission', 'another-mission', 'CourierPayable', 900)])
  assert.equal(result.ledger, null)
  assert.equal(result.errors.length, 1)
})

test('deliveries expose recorded amounts including salaried zero without asserting a posted per-order payout', async () => {
  const groups = await readAdminSection('deliveries', async () => ({ missions: [{id:'mission-salary',deliveryCode:'delivery-salary',orderId:'order-1',courierId:'courier-salary',deliveryMode:'STANDARD',destinationType:'CUSTOMER_ADDRESS',status:'CREATED',updatedAt:'2026-11-08T12:00:00Z',assignmentWorkforceType:'SequoSalaried',customerDeliveryFeeCfa:320,courierFeeCfa:0,shortfallCfa:0}],merchantSubOrderCounts:{} }))
  const finance = groups.find(group => group.title === 'Recorded delivery amounts')
  assert.match(finance.summary, /estimates/)
  assert.match(finance.rows[0].cells[1], /Customer 320 CFA/)
  assert.match(finance.rows[0].cells[1], /Courier estimate 0 CFA/)
  assert.match(finance.rows[0].cells[2], /0 CFA/)
  assert.match(finance.rows[0].cells[2], /Sequo salaried/)
})

test('stored accrual split and frozen commission remain distinct from a later merchant override', async () => {
  const payments = await readAdminSection('payments', async () => ({merchantPayouts:[{id:'payout-1',merchantId:'merchant-1',orderId:'order-1',sourceOrderItemId:'sub-1',merchantNetCfa:3400,commissionCfa:600,platformMarginCfa:0,status:'HeldReturnWindow',activeReturnHold:true,activeDisputeHold:false}],webhookEvents:[]}))
  assert.match(payments[0].rows[0].cells[0], /Source sub-1/)
  assert.match(payments[0].rows[0].cells[1], /Net 3,400 CFA · Commission 600 CFA · Margin 0 CFA/)
  assert.match(payments[0].rows[0].cells[2], /Return hold/)
  const current = await readAdminSection('commissions', async () => ({defaultRateBps:1500,overrides:[{merchantId:'merchant-1',commissionRateBps:1000,reason:'Later approved override',updatedByUserId:'admin-1',updatedAt:'2026-11-08T13:00:00Z'}]}))
  assert.equal(current[0].rows[0].cells[1], '10.00%')
  assert.match(current[0].rows[0].cells[2], /admin-1/)
  const frozen = await readFinanceSource('OrderItem','sub-1',async path => path.startsWith('/api/merchant/') ? snapshot : [])
  assert.equal(frozen.snapshot.commissionRateBps,1500)
  assert.equal(frozen.snapshot.commissionCfa,600)
})

test('older responses with missing finance amounts show unavailable instead of manufactured zero', async () => {
  const groups = await readAdminSection('payments',async()=>({merchantPayouts:[{id:'legacy-payout',merchantId:'merchant-1',orderId:'order-1',merchantNetCfa:3400,status:'Accrued',activeReturnHold:false,activeDisputeHold:false}],webhookEvents:[]}))
  assert.match(groups[0].rows[0].cells[1], /Commission Unavailable · Margin Unavailable/)
})
