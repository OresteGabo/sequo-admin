/** User-facing tiers; backend authorization remains authoritative. */
export const adminRoles = ['ADMIN', 'STAFF_MANAGER', 'SUPER_ADMIN'] as const
export const personnelRoles = ['COURIER', 'RELAY_PARTNER', 'MERCHANT_OWNER', 'MERCHANT_STAFF'] as const
export const isOwner = (roles: readonly string[]) => roles.includes('SUPER_ADMIN')
export const canManagePersonnel = (roles: readonly string[]) => isOwner(roles) || roles.includes('STAFF_MANAGER')
export const hasAdminAccess = (roles: readonly string[]) => roles.some(role => (adminRoles as readonly string[]).includes(role))
export const hasAdminRole = (roles: readonly string[], role: string) => roles.includes(role) || (role === 'ADMIN' && canManagePersonnel(roles)) || (role === 'STAFF_MANAGER' && isOwner(roles))
export const adminTierLabel = (roles: readonly string[]) => isOwner(roles) ? 'Owner' : roles.includes('STAFF_MANAGER') ? 'Staff manager' : 'Operations · support included'
export const grantableRoles = (roles: readonly string[]): readonly string[] => isOwner(roles) ? ['CUSTOMER', ...personnelRoles, ...adminRoles] : canManagePersonnel(roles) ? personnelRoles : []
export function canManageAccount(roles: readonly string[], actorId: string, target: unknown, requirePersonnel = false): boolean {
  if (!target || typeof target !== 'object') return false
  const user = target as { id?: unknown; roles?: unknown }
  if (typeof user.id !== 'string' || user.id === actorId || !Array.isArray(user.roles) || !user.roles.every(role => typeof role === 'string')) return false
  if (isOwner(roles)) return true
  return canManagePersonnel(roles) && !user.roles.some(role => [...adminRoles, 'SUPPORT_AGENT'].includes(role)) && (!requirePersonnel || user.roles.some(role => (personnelRoles as readonly string[]).includes(role)))
}
