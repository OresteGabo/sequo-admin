import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLocalFixtureManifest, readLocalFixtures } from '../src/localFixtures.ts'
const manifest = (seeded = true) => ({ environment: 'LOCAL_FIXTURE', namespace: 'local-ops-v1', version: 1,
  seededAt: seeded ? '2026-11-08T10:00:00.123456789Z' : null,
  accounts: [{ id: 'fixture-customer', name: 'Afi Local', email: 'afi@fixture.invalid', roles: ['CUSTOMER'], purpose: 'Scenario order owner' }],
  scenarios: [{ id: 'relay-pickup', title: 'Pick up a local parcel', summary: 'A recorded local parcel ready for pickup.', category: 'relay', resourceIds: { parcelId: 'local-parcel', relayPointId: 'local-site' }, nextActions: ['Open the parcel and confirm identity.'], credentials: { pickupCode: '123456', qrNonce: 'local-qr-nonce' } }],
  note: 'Local practice only. No real payment is executed.' })

test('local guide retains named accounts, resource IDs and deliberate local pickup values', () => {
  assert.deepEqual(validateLocalFixtureManifest(manifest()), manifest())
  assert.equal(validateLocalFixtureManifest(manifest(false)).seededAt, null)
})

test('manifest cannot masquerade as staging, another namespace/version or a real identity roster', () => {
  for (const value of [null, [], { ...manifest(), environment: 'PRODUCTION' }, { ...manifest(), namespace: 'other' }, { ...manifest(), version: true }, { ...manifest(), seededAt: '2026-02-31T00:00:00Z' }, { ...manifest(), seededAt: 'not-a-time' }]) {
    assert.throws(() => validateLocalFixtureManifest(value), /could not be verified/)
  }
  const actual = manifest(); actual.accounts[0].email = 'real.person@example.com'
  assert.throws(() => validateLocalFixtureManifest(actual), /could not be verified/)
})

test('malformed, duplicate and unknown actor/scenario shapes fail rather than manufacture sample rows', () => {
  const mutations = [m => m.accounts.push(m.accounts[0]), m => m.accounts[0].id = null, m => m.accounts[0].roles = ['UNKNOWN_PRIVILEGE'], m => m.scenarios[0].category = 'https://remote.example', m => m.scenarios[0].resourceIds = [], m => m.scenarios[0].nextActions = 'not an array', m => m.scenarios[0].credentials.pickupCode = 123456]
  for (const mutate of mutations) {
    const value = manifest(); mutate(value)
    assert.throws(() => validateLocalFixtureManifest(value), /could not be verified/)
  }
})

test('tokens, provider keys and passwords cannot be presented as local proof or resource IDs', () => {
  for (const key of ['accessToken', 'jwtSecret', 'api_key', 'password', 'authorization', '__proto__', 'sessionId']) {
    for (const field of ['credentials', 'resourceIds']) {
      const value = manifest(); value.scenarios[0][field] = { [key]: 'DO_NOT_DISPLAY' }
      assert.throws(() => validateLocalFixtureManifest(value), /could not be verified/)
    }
  }
  const value = { ...manifest(), accessToken: 'DO_NOT_DISPLAY', accounts: [{ ...manifest().accounts[0], password: 'DO_NOT_DISPLAY' }] }
  assert.equal(JSON.stringify(validateLocalFixtureManifest(value)).includes('DO_NOT_DISPLAY'), false)
})

test('guide reads only the guarded manifest and does not issue seeding or payment requests', async () => {
  const calls = []
  const result = await readLocalFixtures(async (...args) => { calls.push(args); return manifest() })
  assert.deepEqual(calls, [['/api/admin/local-fixtures']])
  assert.equal(result.scenarios.length, 1)
})

test('failed authenticated reads stay unavailable and never fall back to mock scenarios', async () => {
  for (const status of [401, 403, 500]) {
    const failure = new Error(`HTTP ${status}`)
    await assert.rejects(readLocalFixtures(async () => { throw failure }), error => error === failure)
  }
  await assert.rejects(readLocalFixtures(async () => ({})), /could not be verified/)
})
