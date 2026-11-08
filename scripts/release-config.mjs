export function releaseConfig(input) {
  const releaseId = String(input.releaseId ?? '').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(releaseId)) throw new Error('Provide a release ID using letters, numbers, dots, underscores or dashes.')
  const environment = String(input.environment ?? '')
  if (!['LOCAL_FIXTURE', 'STAGING'].includes(environment)) throw new Error('Choose LOCAL_FIXTURE or STAGING explicitly.')
  let apiBaseUrl = String(input.apiBaseUrl ?? '').trim()
  if (environment === 'LOCAL_FIXTURE') {
    if (input.sameOriginFixture !== true || apiBaseUrl) throw new Error('LOCAL_FIXTURE requires --same-origin-fixture and an empty API origin.')
  } else {
    if (input.sameOriginFixture) throw new Error('The same-origin fixture flag is only for LOCAL_FIXTURE.')
    let url
    try { url = new URL(apiBaseUrl) } catch { throw new Error('STAGING requires an explicit HTTPS API origin.') }
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) ||
      ['localhost', '0.0.0.0', '[::1]'].includes(host) || host.startsWith('127.') ||
      ['localhost', 'invalid', 'test', 'example', 'example.com', 'example.org', 'example.net'].some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
      throw new Error('Use a real HTTPS API origin without credentials, path, query or fragment.')
    }
    apiBaseUrl = url.origin
  }
  if (input.allowDirty === true && environment !== 'LOCAL_FIXTURE') throw new Error('Dirty sources are allowed only for a labelled local fixture candidate.')
  return Object.freeze({ releaseId, environment, apiBaseUrl, apiMode: environment === 'LOCAL_FIXTURE' ? 'SAME_ORIGIN_FIXTURE' : 'HTTPS_ORIGIN', allowDirty: input.allowDirty === true })
}

export function releaseArgs(args) {
  const result = {}
  const values = { '--release-id': 'releaseId', '--environment': 'environment', '--api-origin': 'apiBaseUrl', '--output': 'output' }
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (values[flag]) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${flag}.`)
      result[values[flag]] = args[++index]
    } else if (flag === '--same-origin-fixture') result.sameOriginFixture = true
    else if (flag === '--allow-dirty-local-fixture') result.allowDirty = true
    else throw new Error(`Unknown release argument: ${flag}`)
  }
  return result
}
