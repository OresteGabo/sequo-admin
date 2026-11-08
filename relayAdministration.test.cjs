const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const result = ts.transpileModule(fs.readFileSync('src/relayAdministration.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
let count = 0; const contract = {};
vm.runInNewContext(result.outputText, { exports: contract, crypto: { randomUUID: () => `key-${++count}` } });
const { relayIntent, validRelayIntent, relayAcknowledged, relayConfirmed } = contract;
function fixture() {
  const intent = relayIntent('CREATE_SLOT', 'admin-A', 'site-A', { lockerCode: 'A1', reason: 'Physical storage verified', expectedUpdatedAt: '2026-11-08T09:00:00.123456Z' });
  const operation = { id: 'operation-A', actorUserId: 'admin-A', relayPointId: 'site-A', action: 'CREATE_SLOT', idempotencyKey: intent.body.idempotencyKey };
  const record = { site: { id: 'site-A' }, history: [operation] };
  return { intent, operation, record };
}
test('confirmed intents freeze the payload, preserve exact revision and generate only the supported route', () => {
  const { intent } = fixture();
  assert.equal(intent.path, '/api/admin/web/relay-sites/site-A/slots');
  assert.equal(intent.method, 'POST');
  assert.equal(intent.body.expectedUpdatedAt, '2026-11-08T09:00:00.123456Z');
  assert.equal(Object.isFrozen(intent.body), true);
  assert.equal(Reflect.set(intent.body, 'lockerCode', 'B2'), false);
  assert.throws(() => relayIntent('CREATE_SITE', 'admin-A', null, { reason: ' ' }));
  assert.throws(() => relayIntent('SEQUO_DEPOSIT', 'admin-A', null, { reason: 'Verified' }));
});
test('success requires canonical actor, target, key and action then independent history readback', () => {
  const { intent, operation, record } = fixture();
  assert.equal(relayAcknowledged({ operation, record }, intent), true);
  assert.equal(relayConfirmed(record, intent), false);
  assert.equal(relayConfirmed(record, { ...intent, operationId: operation.id }), true);
  for (const patch of [{ actorUserId: 'admin-B' }, { relayPointId: 'site-B' }, { action: 'SEQUO_DEPOSIT' }, { idempotencyKey: 'other' }]) {
    assert.equal(relayAcknowledged({ record, operation: { ...operation, ...patch } }, intent), false);
    assert.equal(relayConfirmed({ ...record, history: [{ ...operation, ...patch }] }, { ...intent, operationId: operation.id }), false);
  }
  assert.equal(relayAcknowledged({ record: {}, operation }, intent), false);
  assert.equal(relayConfirmed({ ...record, history: [] }, { ...intent, operationId: operation.id }), false);
});
test('pending restore is actor scoped and cannot become a generic API request', () => {
  const { intent } = fixture();
  assert.equal(validRelayIntent(JSON.parse(JSON.stringify(intent)), 'admin-A'), true);
  assert.equal(validRelayIntent(intent, 'admin-B'), false);
  assert.equal(validRelayIntent({ ...intent, path: '/api/auth/logout-all' }, 'admin-A'), false);
  assert.equal(validRelayIntent({ ...intent, method: 'DELETE' }, 'admin-A'), false);
  assert.equal(validRelayIntent({ ...intent, action: 'UNKNOWN' }, 'admin-A'), false);
  assert.equal(validRelayIntent({ ...intent, body: null }, 'admin-A'), false);
});
test('malformed or foreign response identities never become current site or mission previews', () => {
  const s = { id: 'site-A', name: 'Recorded site', status: 'ACTIVE', operatorUserId: null, latitude: 6.1, longitude: 1.2, city: null, neighborhood: null, landmark: null, updatedAt: '2026-11-08T09:00:00.123456Z' };
  assert.equal(contract.parseRelaySites([s])[0].updatedAt, s.updatedAt);
  assert.throws(() => contract.parseRelaySites({}));
  assert.throws(() => contract.parseRelaySites([{ ...s, latitude: 200 }]));
  const detail = { site: s, slots: [{ id: 'slot-A', relayPointId: 'site-A', lockerCode: 'A1', status: 'AVAILABLE', updatedAt: s.updatedAt }], history: [] };
  assert.equal(contract.parseRelaySetup(detail, 'site-A').site.id, 'site-A');
  assert.throws(() => contract.parseRelaySetup(detail, 'site-B'));
  assert.throws(() => contract.parseRelaySetup({ ...detail, slots: [{ ...detail.slots[0], relayPointId: 'site-B' }] }, 'site-A'));
  assert.throws(() => contract.parseRelaySetup({ ...detail, history: undefined }, 'site-A'));
  const m = { id: 'mission-A', orderId: 'order-A', relayPointId: 'site-A', status: 'PICKED_UP_FROM_SELLER', destinationType: 'RELAY_POINT', courierId: 'courier-A', pickupAt: s.updatedAt, updatedAt: s.updatedAt };
  assert.equal(contract.parseRelayMission(m, 'mission-A').id, 'mission-A');
  assert.throws(() => contract.parseRelayMission(m, 'mission-B'));
  assert.throws(() => contract.parseRelayMission({ ...m, updatedAt: null }, 'mission-A'));
});
