import assert from 'node:assert/strict'
import test from 'node:test'
import { releaseArgs, releaseConfig } from '../scripts/release-config.mjs'

test('local artifact requires a deliberate fixture environment and same-origin choice', () => {
  assert.deepEqual(releaseConfig({ releaseId: 'sequo-mvp-rc-fixture', environment: 'LOCAL_FIXTURE', sameOriginFixture: true }),
    { releaseId: 'sequo-mvp-rc-fixture', environment: 'LOCAL_FIXTURE', apiBaseUrl: '', apiMode: 'SAME_ORIGIN_FIXTURE', allowDirty: false })
  assert.throws(() => releaseConfig({ releaseId: 'rc', environment: 'LOCAL_FIXTURE' }), /same-origin-fixture/)
  assert.throws(() => releaseConfig({ releaseId: 'rc', environment: 'PRODUCTION' }), /LOCAL_FIXTURE or STAGING/)
})

test('staging configuration cannot silently inherit localhost or a credential-bearing URL', () => {
  for (const apiBaseUrl of ['', 'http://localhost:8080', 'https://fixture.invalid', 'https://user:secret@staging.sequo.tg', 'https://staging.sequo.tg?key=secret', 'https://staging.sequo.tg/api']) {
    assert.throws(() => releaseConfig({ releaseId: 'rc', environment: 'STAGING', apiBaseUrl }))
  }
  assert.equal(releaseConfig({ releaseId: 'rc', environment: 'STAGING', apiBaseUrl: 'https://staging.sequo.tg/' }).apiBaseUrl, 'https://staging.sequo.tg')
  assert.throws(() => releaseConfig({ releaseId: 'rc', environment: 'STAGING', apiBaseUrl: 'https://staging.sequo.tg', allowDirty: true }), /Dirty sources/)
})

test('release identifiers and CLI arguments cannot become file paths or shell arguments', () => {
  for (const releaseId of ['../rc', 'rc; command', 'rc with spaces', '']) assert.throws(() => releaseConfig({ releaseId, environment: 'LOCAL_FIXTURE', sameOriginFixture: true }))
  assert.throws(() => releaseArgs(['--release-id']), /Missing value/)
  assert.throws(() => releaseArgs(['--unrecognized']), /Unknown release argument/)
  assert.deepEqual(releaseArgs(['--release-id', 'rc', '--environment', 'LOCAL_FIXTURE', '--same-origin-fixture', '--output', '/tmp/release']),
    { releaseId: 'rc', environment: 'LOCAL_FIXTURE', sameOriginFixture: true, output: '/tmp/release' })
})
