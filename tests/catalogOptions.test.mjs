import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive } from 'vue'
import { catalogOptionDrafts, prepareCatalogOptions, readCatalogOptions, writeCatalogOptions, catalogOptionsMatch, restoreCatalogOptionsIntent } from '../src/catalogOptions.ts'

const stored = () => [{ id: 'g-size', productId: 'p-food', name: 'Size', minChoices: 1, maxChoices: 1, sortOrder: 0, active: true, options: [
  { id: 'o-regular', name: 'Regular', priceDeltaCfa: 0, sortOrder: 0, active: true },
  { id: 'o-large', name: 'Large', priceDeltaCfa: 300, sortOrder: 1, active: false },
] }]
const saved = body => body.groups.map((group, i) => ({ ...group, id: group.id ?? `saved-group-${i}`, productId: 'p-food', options: group.options.map((option, j) => ({ ...option, id: option.id ?? `saved-option-${i}-${j}` })) }))

test('admin option read explicitly requests unavailable groups and preserves exact IDs and availability', async () => {
  const result = await readCatalogOptions('p-food', async path => { assert.equal(path, '/api/catalog/products/p-food/customizations?includeInactive=true'); return stored() })
  assert.deepEqual(result, stored())
  const drafts = catalogOptionDrafts(result)
  assert.equal(drafts[0].id, 'g-size'); assert.equal(drafts[0].options[1].id, 'o-large')
  assert.equal(drafts[0].options[1].active, false)
  drafts[0].options[0].name = 'Changed locally'
  assert.equal(result[0].options[0].name, 'Regular')
  const legacy = stored(); legacy[0].sortOrder = -5; legacy[0].options[0].sortOrder = -2
  assert.equal((await readCatalogOptions('p-food', async () => legacy))[0].sortOrder, -5)
})

test('editing preserves IDs, uses integer CFA supplements and freezes a reviewed independent snapshot', () => {
  const before = reactive(stored())
  const drafts = reactive(catalogOptionDrafts(before))
  drafts[0].options[1].active = true; drafts[0].options[1].priceDeltaCfa = '400'
  drafts[0].options.push({ clientId: 'local', name: ' Extra large ', priceDeltaCfa: '600', active: true })
  const intent = prepareCatalogOptions('p-food', before, drafts)
  assert.deepEqual(intent.body.groups[0].options, [
    { id: 'o-regular', name: 'Regular', priceDeltaCfa: 0, sortOrder: 0, active: true },
    { id: 'o-large', name: 'Large', priceDeltaCfa: 400, sortOrder: 1, active: true },
    { name: 'Extra large', priceDeltaCfa: 600, sortOrder: 2, active: true },
  ])
  assert.equal(Object.isFrozen(intent.body.groups[0].options), true)
  assert.equal(Object.isFrozen(before[0]), false)
  drafts[0].name = 'Changed after review'
  assert.equal(intent.body.groups[0].name, 'Size')
})

test('validation rejects impossible required choices, negative/fractional supplements and removed option constraints', () => {
  const before = stored(); const draft = catalogOptionDrafts(before)
  draft[0].options[0].active = false
  assert.throws(() => prepareCatalogOptions('p-food', before, draft), /enough options available/)
  draft[0].options[0].active = true
  for (const bad of [-1, 2.5, 'Infinity', '', false]) {
    draft[0].options[0].priceDeltaCfa = bad
    assert.throws(() => prepareCatalogOptions('p-food', before, draft), /whole number|required/)
  }
  draft[0].options[0].priceDeltaCfa = 0; draft[0].maxChoices = 3
  assert.throws(() => prepareCatalogOptions('p-food', before, draft), /fit the option count/)
  draft[0].maxChoices = 1; draft[0].options = []
  assert.throws(() => prepareCatalogOptions('p-food', before, draft), /between 1 and 50/)
})

test('unknown or moved identities and duplicate new names cannot replace existing option data', () => {
  const before = stored(); const draft = catalogOptionDrafts(before)
  draft[0].options[0].id = 'foreign'
  assert.throws(() => prepareCatalogOptions('p-food', before, draft), /identities/)
  draft[0].options[0].id = 'o-regular'
  draft.push({ clientId: 'new', name: 'Extras', minChoices: 0, maxChoices: 1, active: true, options: [{ clientId: 'moved', id: 'o-regular', name: 'Moved', priceDeltaCfa: 0, active: true }] })
  assert.throws(() => prepareCatalogOptions('p-food', before, draft), /another group/)
  draft[1].options = [{ clientId: 'n1', name: 'Cheese', priceDeltaCfa: 100, active: true }, { clientId: 'n2', name: 'Cheese', priceDeltaCfa: 200, active: true }]
  assert.throws(() => prepareCatalogOptions('p-food', before, draft), /distinct/)
})

test('removing all groups requires an explicit replacement and records removal counts', () => {
  const intent = prepareCatalogOptions('p-food', stored(), [])
  assert.deepEqual(intent.body, { groups: [] })
  assert.equal(intent.removedGroups, 1); assert.equal(intent.removedOptions, 2)
})

test('save performs full preflight then one non-replayed PUT and confirms persisted readback', async () => {
  const before = stored(); const drafts = catalogOptionDrafts(before)
  drafts[0].options[1].active = true
  const intent = prepareCatalogOptions('p-food', before, drafts)
  const calls = []; let acknowledged = 0
  const result = await writeCatalogOptions(intent, async (...args) => {
    calls.push(args)
    if (args[2] === 'PUT') return saved(intent.body)
    return calls.length === 1 ? before : saved(intent.body)
  }, () => acknowledged++)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[1], ['/api/catalog/products/p-food/customizations', false, 'PUT', intent.body])
  assert.equal(acknowledged, 1); assert.equal(catalogOptionsMatch(result, intent.body), true)
})

test('a changed server baseline denies replacement before any PUT', async () => {
  const before = stored(); const drafts = catalogOptionDrafts(before); drafts[0].options[1].active = true
  const intent = prepareCatalogOptions('p-food', before, drafts)
  const changed = stored(); changed[0].name = 'Another operator update'
  let calls = 0
  await assert.rejects(writeCatalogOptions(intent, async () => { calls++; return changed }), /changed after this review/)
  assert.equal(calls, 1)
})

test('lost-write retry first recognizes matching persisted menu and never creates another group', async () => {
  const drafts = [{ clientId: 'new', name: 'Extras', minChoices: 0, maxChoices: 1, active: true, options: [{ clientId: 'x', name: 'Cheese', priceDeltaCfa: 150, active: true }] }]
  const intent = prepareCatalogOptions('p-food', [], drafts)
  let calls = 0
  const result = await writeCatalogOptions(intent, async (_path, _retry, method) => { calls++; assert.notEqual(method, 'PUT'); return saved(intent.body) })
  assert.equal(calls, 1); assert.equal(result[0].id, 'saved-group-0')
})

test('mutation rejection and acknowledged-but-unconfirmed readback remain errors with no manufactured success', async () => {
  const before = stored(); const drafts = catalogOptionDrafts(before); drafts[0].options[1].active = true
  const intent = prepareCatalogOptions('p-food', before, drafts)
  const forbidden = new Error('Forbidden'); let calls = 0; let acknowledged = false
  await assert.rejects(writeCatalogOptions(intent, async (_p, _r, method) => { calls++; if (method === 'PUT') throw forbidden; return before }), error => error === forbidden)
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(writeCatalogOptions(intent, async (_p, _r, method) => { calls++; if (method === 'PUT') return saved(intent.body); if (calls === 1) return before; throw new Error('Offline') }, () => { acknowledged = true }), /Offline/)
  assert.equal(acknowledged, true); assert.equal(calls, 3)
  calls = 0
  await assert.rejects(writeCatalogOptions(intent, async (_p, _r, method) => { calls++; return method === 'PUT' ? saved(intent.body) : before }), /not confirmed by readback/)
})

test('wrong product, missing inactive states, duplicate identities and failed reads cannot become empty menus', async () => {
  const foreign = stored(); foreign[0].productId = 'other'
  const missing = stored(); delete missing[0].active
  const duplicate = stored(); duplicate[0].options[1].id = 'o-regular'
  for (const malformed of [null, {}, foreign, missing, duplicate]) await assert.rejects(readCatalogOptions('p-food', async () => malformed), /could not be read|incomplete|identities/)
  await assert.rejects(readCatalogOptions('..', async () => []), /valid product/)
  await assert.rejects(readCatalogOptions('p-food', async () => { throw new Error('401') }), /401/)
  assert.deepEqual(await readCatalogOptions('p-food', async () => []), [])
})


test('saved reviewed menus restore only for the same product with validated immutable fields', () => {
  const before = stored(); const draft = catalogOptionDrafts(before); draft[0].options[1].active = true
  const intent = prepareCatalogOptions('p-food', before, draft)
  const restored = restoreCatalogOptionsIntent(JSON.parse(JSON.stringify(intent)), 'p-food')
  assert.deepEqual(restored, intent)
  assert.equal(Object.isFrozen(restored.body.groups[0].options), true)
  assert.equal(restoreCatalogOptionsIntent(intent, 'other-product'), null)
  const malformed = JSON.parse(JSON.stringify(intent)); malformed.body.groups[0].options[0].priceDeltaCfa = -1
  assert.equal(restoreCatalogOptionsIntent(malformed, 'p-food'), null)
  const extras = JSON.parse(JSON.stringify(intent)); extras.body.actorUserId = 'forged'
  assert.equal(restoreCatalogOptionsIntent(extras, 'p-food'), null)
  assert.equal(restoreCatalogOptionsIntent({ productId: 'p-food', body: { groups: [null] } }, 'p-food'), null)
})
