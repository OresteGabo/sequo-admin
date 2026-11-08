import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseArgs, releaseConfig } from './release-config.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const args = releaseArgs(process.argv.slice(2))
const config = releaseConfig(args)
if (!args.output || !isAbsolute(args.output)) throw new Error('Provide an absolute --output directory outside the repository.')
const output = resolve(args.output)
if (!relative(root, output).startsWith('..')) throw new Error('Release output must be outside the repository.')
const sourceCommit = git('rev-parse', 'HEAD')
const dirtyTracked = Boolean(git('status', '--porcelain', '--untracked-files=no'))
const dirty = Boolean(git('status', '--porcelain'))
if (dirty && !config.allowDirty) throw new Error('Commit the reviewed source changes before preparing the identifiable release. Use the dirty flag only for local fixture candidates.')
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort()
const sourceHash = () => sha(tracked.map(name => `${name}\0${sha(readFileSync(join(root, name)))}`).join('\0'))
const trackedTreeSha256 = sourceHash()
mkdirSync(output, { recursive: true })
const run = (name, command, commandArgs, env = process.env) => {
  try { const text = execFileSync(command, commandArgs, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); writeFileSync(join(output, `${name}.log`), text) }
  catch (error) { writeFileSync(join(output, `${name}.log`), `${error.stdout ?? ''}${error.stderr ?? ''}`); throw new Error(`${name} failed; see ${join(output, `${name}.log`)}`) }
}
run('type-check', 'npm', ['run', 'type-check'])
run('build', 'npm', ['run', 'build-only'], { ...process.env, VITE_SEQUO_API_BASE_URL: config.apiBaseUrl,
  VITE_SEQUO_RELEASE_ID: config.releaseId, VITE_SEQUO_RELEASE_ENVIRONMENT: config.environment })
if (git('rev-parse', 'HEAD') !== sourceCommit || sourceHash() !== trackedTreeSha256 || Boolean(git('status', '--porcelain')) !== dirty) throw new Error('Source changed during the build; prepare a fresh artifact.')
const metadata = {
  app: 'sequo-admin', releaseId: config.releaseId, environment: config.environment, sourceCommit,
  dirtyTracked, dirty, trackedTreeSha256, packageLockSha256: sha(readFileSync(join(root, 'package-lock.json'))),
  apiMode: config.apiMode, apiBaseUrl: config.apiBaseUrl || null, builtAt: new Date().toISOString(),
  nodeVersion: process.version, paidProviderExecution: 'NOT_VERIFIED_NOT_ENABLED_BY_THIS_ARTIFACT',
}
const dist = join(root, 'dist')
writeFileSync(join(dist, 'release.json'), JSON.stringify(metadata, null, 2) + '\n')
function files(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const absolute = join(directory, name), stat = lstatSync(absolute)
    if (stat.isSymbolicLink()) throw new Error('Release output cannot contain symbolic links.')
    if (stat.isDirectory()) return files(absolute)
    if (!stat.isFile()) throw new Error('Release output must contain regular files only.')
    return [absolute]
  })
}
const contents = files(dist)
if (!contents.some(name => name.endsWith('.js') && readFileSync(name, 'utf8').includes(config.releaseId))) throw new Error('The built UI does not contain the requested release identity.')
const filesManifest = contents.map(name => `${sha(readFileSync(name))}  ${relative(dist, name)}`).join('\n') + '\n'
writeFileSync(join(dist, 'files.sha256'), filesManifest)
const suffix = dirty ? `-dirty-${trackedTreeSha256.slice(0, 8)}` : ''
const archiveName = `sequo-admin-${config.releaseId}-${sourceCommit.slice(0, 12)}${suffix}.tar.gz`
const archivePath = join(output, archiveName)
execFileSync('tar', ['-czf', archivePath, '-C', dist, '.'])
const archiveSha256 = sha(readFileSync(archivePath))
writeFileSync(join(output, `${archiveName}.sha256`), `${archiveSha256}  ${archiveName}\n`)
writeFileSync(join(output, 'release-build-report.json'), JSON.stringify({ ...metadata, archivePath, archiveSha256,
  builtFilesManifestSha256: sha(filesManifest), checks: ['type-check', 'build'] }, null, 2) + '\n')
process.stdout.write(JSON.stringify({ releaseId: config.releaseId, sourceCommit, environment: config.environment, archivePath, archiveSha256, dirty }, null, 2) + '\n')
