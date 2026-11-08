import assert from 'node:assert/strict'
import test from 'node:test'
import { readAdminSection } from '../src/adminReads.ts'

const base = {
  defaultCommissionRateBps: 1500, commissionOverrideCount: 2, relayStorageFeeAssessmentCount: 4,
  relayExcludedProductPolicySource: 'RelayParcelPolicy', returnWindowPolicySource: 'CustomerReturnPolicy',
}
const pricing = { active: { profile: 'LOCAL_FIXTURE_ONLY', minimumDeliveryFeeCfa: 490, extraKmFeeCfa: 120, includedKm: 6, effectiveFrom: '2026-11-08T00:00:00Z' } }
const parameters = Array.from({ length: 10 }, (_, index) => ({
  reference: 131 + index, key: `parameter-${index}`, label: `Fixture parameter ${131 + index}`,
  state: index === 3 ? 'PENDING_APPROVAL' : 'CONFIGURED',
  effectiveValues: index === 3 ? { 'Configured plan discount': '12%', 'Applied without approval': '0 CFA' } : { 'Server fixture value': String(index + 7) },
  source: `Fixture runtime source ${index}`, changeAuthority: 'SEQUO fixture operator',
  changeProcedure: `Controlled fixture change ${index}`, verification: `Fixture readback ${index}`,
  pendingDecision: index === 3 ? 'Written approval required before activation.' : null,
}))

test('settings inventory renders all ten server parameter families and separates unapproved configured values', async () => {
  const groups = await readAdminSection('settings', async path => path.endsWith('/delivery-pricing')
    ? pricing : { ...base, parameters, generatedAt: '2026-11-08T00:00:00Z' })
  assert.equal(groups.length, 12)
  assert.equal(groups[0].rows[0].cells[1], '490 CFA')
  for (const parameter of parameters) {
    const group = groups.find(item => item.title.startsWith(`${parameter.reference}.`))
    assert.ok(group, parameter.reference)
    assert.ok(group.rows.some(row => row.cells[1] === parameter.source))
    assert.ok(group.rows.some(row => row.cells[1] === parameter.changeProcedure))
    assert.ok(group.rows.some(row => row.cells[1] === parameter.verification))
  }
  const subscription = groups.find(item => item.title.startsWith('134.'))
  assert.match(subscription.summary, /Pending approval/)
  assert.ok(subscription.rows.some(row => row.cells[1] === '12%'))
  assert.ok(subscription.rows.some(row => row.cells[1] === '0 CFA'))
  assert.match(subscription.summary, /Written approval/)
})

test('older server responses report the unavailable inventory without manufacturing approved values', async () => {
  const groups = await readAdminSection('settings', async path => path.endsWith('/delivery-pricing') ? pricing : base)
  assert.equal(groups.length, 2)
  assert.match(groups[1].summary, /unavailable/)
  assert.match(groups[1].summary, /no policy values are inferred/)
})

test('failed authenticated parameter read propagates without retaining a successful pricing fragment', async () => {
  await assert.rejects(readAdminSection('settings', async path => {
    if (path.endsWith('/delivery-pricing')) return pricing
    throw new Error('Session expired')
  }), /Session expired/)
})
