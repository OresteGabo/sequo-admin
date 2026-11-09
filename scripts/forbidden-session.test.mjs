import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectForbiddenSession } from '../src/forbiddenSession.ts'

test('an expired Owner authentication refreshes and retries the original operation once', async () => {
  let refreshes = 0
  assert.equal(await inspectForbiddenSession(async () => ({status:401}), async () => { refreshes++; return true }, true), 'retry')
  assert.equal(refreshes, 1)
})
test('a genuine permission denial preserves every active administrator tier', async () => {
  for (const role of ['ADMIN','STAFF_MANAGER','SUPER_ADMIN']) {
    assert.equal(await inspectForbiddenSession(async () => ({status:200,user:{active:true,roles:[role]}}), async () => { throw Error('must not refresh') }, true), 'denied')
  }
})
test('disabled or demoted accounts do not keep administrator access', async () => {
  for (const user of [{active:false,roles:['SUPER_ADMIN']},{active:true,roles:['CUSTOMER']},{active:true,roles:['SUPPORT_AGENT']}])
    assert.equal(await inspectForbiddenSession(async () => ({status:200,user}), async () => true, true), 'not_admin')
})
test('refresh failure or an exhausted retry ends an expired session without loops', async () => {
  assert.equal(await inspectForbiddenSession(async () => ({status:401}), async () => false, true), 'ended')
  assert.equal(await inspectForbiddenSession(async () => ({status:401}), async () => { throw Error('must not refresh') }, false), 'ended')
})
test('temporary service and diagnostic failures preserve saved credentials', async () => {
  for (const probe of [async () => ({status:503}), async () => { throw Error('network unavailable') }, async () => ({status:200,user:{roles:[]}})])
    assert.equal(await inspectForbiddenSession(probe, async () => true, true), 'unavailable')
})
