import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-release.mjs /absolute/release-output')
const output = resolve(process.argv[2])
const report = JSON.parse(readFileSync(join(output, 'release-build-report.json'), 'utf8'))
if (report.environment !== 'LOCAL_FIXTURE' || report.apiMode !== 'SAME_ORIGIN_FIXTURE') throw new Error('Mock web acceptance requires an explicitly labelled same-origin LOCAL_FIXTURE artifact.')
const sha = value => createHash('sha256').update(value).digest('hex')
if (sha(readFileSync(report.archivePath)) !== report.archiveSha256) throw new Error('Release archive checksum changed.')
const manifest = readFileSync(join(root, 'dist', 'files.sha256'), 'utf8')
if (sha(manifest) !== report.builtFilesManifestSha256) throw new Error('The built-files manifest changed.')
const listedFiles = manifest.trim().split('\n').map(line => line.slice(66)).sort()
function actualFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = `${prefix}${entry.name}`
    if (entry.isDirectory()) return actualFiles(join(directory, entry.name), `${filename}/`)
    if (!entry.isFile()) throw new Error('Only regular artifact files are accepted.')
    return filename === 'files.sha256' ? [] : [filename]
  }).sort()
}
function verifyFiles() {
  if (JSON.stringify(actualFiles(join(root, 'dist'))) !== JSON.stringify(listedFiles)) throw new Error('Artifact file inventory changed.')
  for (const line of manifest.trim().split('\n')) {
    const checksum = line.slice(0, 64), filename = line.slice(66)
    if (!/^[a-f0-9]{64}$/.test(checksum) || filename.startsWith('/') || filename.split('/').includes('..') ||
      sha(readFileSync(join(root, 'dist', filename))) !== checksum) throw new Error('The built artifact changed before or during acceptance.')
  }
  const identity = JSON.parse(readFileSync(join(root, 'dist', 'release.json'), 'utf8'))
  if (identity.releaseId !== report.releaseId || identity.sourceCommit !== report.sourceCommit || identity.trackedTreeSha256 !== report.trackedTreeSha256) throw new Error('Built artifact identity does not match its release report.')
}
verifyFiles()
const logs = join(output, 'acceptance'); mkdirSync(logs, { recursive: true })
const commands = [
  ['node-tests', ['--test', ...readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.mjs')).sort().map(name => `tests/${name}`)]],
  ...['business-parameters', 'commission-override', 'consolidation', 'delivery-mode', 'finance-ledger', 'payment-investigation', 'return-operations']
    .map(name => [name, [`scripts/${name}-browser-check.cjs`]]),
]
const checks = []
for (const [name, args] of commands) {
  const startedAt = new Date().toISOString(); let passed = false
  try { const text = execFileSync(process.execPath, args, { cwd: root, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 }); writeFileSync(join(logs, `${name}.log`), text); passed = true }
  catch (error) { writeFileSync(join(logs, `${name}.log`), `${error.stdout ?? ''}${error.stderr ?? ''}`) }
  checks.push({ name, command: [process.execPath, ...args], passed, startedAt, finishedAt: new Date().toISOString(), log: join(logs, `${name}.log`) })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name}\n`)
}
verifyFiles()
const acceptance = { releaseId: report.releaseId, sourceCommit: report.sourceCommit, environment: report.environment,
  archivePath: report.archivePath, archiveSha256: report.archiveSha256, builtFilesManifestSha256: sha(manifest),
  fixtureOnly: true, stagingVerified: false, checks, passed: checks.every(check => check.passed) }
writeFileSync(join(output, 'web-acceptance.json'), JSON.stringify(acceptance, null, 2) + '\n')
if (!acceptance.passed) process.exitCode = 1
