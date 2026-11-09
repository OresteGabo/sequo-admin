import { hasAdminAccess } from './adminPermissions.ts'

export type ForbiddenSessionResult = 'retry' | 'denied' | 'ended' | 'not_admin' | 'unavailable'

/** A resource 403 can mean expired authentication; distinguish it from a valid role denial. */
export async function inspectForbiddenSession(
  probe: () => Promise<{ status: number; user?: unknown }>,
  refresh: () => Promise<boolean>,
  canRetry: boolean,
): Promise<ForbiddenSessionResult> {
  try {
    const check = await probe()
    if (check.status === 401) return canRetry && await refresh() ? 'retry' : 'ended'
    if (check.status !== 200 || !check.user || typeof check.user !== 'object') return 'unavailable'
    const user = check.user as { active?: unknown; roles?: unknown }
    if (typeof user.active !== 'boolean' || !Array.isArray(user.roles) || !user.roles.every(role => typeof role === 'string')) return 'unavailable'
    return user.active && hasAdminAccess(user.roles) ? 'denied' : 'not_admin'
  } catch {
    // A failed diagnostic or temporary outage must not erase a valid saved session.
    return 'unavailable'
  }
}
