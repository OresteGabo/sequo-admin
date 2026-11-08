import { isValidReference } from "./humanReference.ts"
import type { AdminControlRequest, AdminControlGroup } from './adminControls'
export type FixtureAccount = { publicReference?: string; id: string; name: string; email: string; roles: string[]; purpose: string }
export type FixtureScenario = { id: string; title: string; summary: string; category: AdminControlGroup | 'dashboard'; resourceIds: Record<string, string>; resourceReferences?: Record<string, string>; nextActions: string[]; credentials: Record<string, string> }
export type LocalFixtureManifest = { environment: 'LOCAL_FIXTURE'; namespace: 'local-ops-v1'; version: 1; seededAt: string | null; accounts: FixtureAccount[]; scenarios: FixtureScenario[]; note: string }
const categories = new Set(['dashboard', 'users', 'merchants', 'catalog', 'riders', 'orders', 'deliveries', 'relay', 'returns', 'payments', 'commissions', 'negotiations', 'cooperatives', 'benefits', 'notifications', 'audit', 'settings'])
const roles = new Set(['CUSTOMER', 'MERCHANT_OWNER', 'MERCHANT_STAFF', 'COURIER', 'RELAY_PARTNER', 'SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN'])
const privateKey = /token|secret|password|authorization|bearer|session|api.?key/i
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || !!value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
function instant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) return false
  const parts = value.slice(0, 19).split(/[-T:]/).map(Number)
  const calendar = new Date(0); calendar.setUTCFullYear(parts[0]!, parts[1]! - 1, parts[2]!)
  return calendar.getUTCFullYear() === parts[0] && calendar.getUTCMonth() + 1 === parts[1] && calendar.getUTCDate() === parts[2] && parts[3]! < 24 && parts[4]! < 60 && parts[5]! < 60
}
function invalid(): never { throw new Error('The local fixture guide could not be verified. Refresh after starting the updated isolated workspace.') }
function map(value: unknown, credentials: boolean): Record<string, string> {
  if (!object(value) || Object.keys(value).length > (credentials ? 20 : 30)) return invalid()
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!text(key, 64) || privateKey.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) || (credentials ? !text(item, 2048) : !identifier(item))) return invalid()
    result[key] = item as string
  }
  return result
}
export function validateLocalFixtureManifest(value: unknown): LocalFixtureManifest {
  if (!object(value) || value.environment !== 'LOCAL_FIXTURE' || value.namespace !== 'local-ops-v1' || value.version !== 1 || (value.seededAt !== null && !instant(value.seededAt)) || !text(value.note, 4000, true) || !Array.isArray(value.accounts) || value.accounts.length > 100 || !Array.isArray(value.scenarios) || value.scenarios.length > 100) return invalid()
  const accountIds = new Set<string>(); const scenarioIds = new Set<string>()
  const accounts = value.accounts.map(account => {
    if (!object(account) || !identifier(account.id) || accountIds.has(account.id) || !text(account.name, 200) || !text(account.email, 254) || !account.email.toLowerCase().endsWith('.invalid') || !text(account.purpose, 1000) || !Array.isArray(account.roles) || !account.roles.length || account.roles.some(role => typeof role !== 'string' || !roles.has(role))) return invalid()
    accountIds.add(account.id)
    return { ...(typeof account.publicReference === "string" && isValidReference(account.publicReference, "USER") ? { publicReference: account.publicReference } : {}), id: account.id, name: account.name, email: account.email, roles: [...account.roles] as string[], purpose: account.purpose }
  })
  const scenarios = value.scenarios.map(scenario => {
    if (!object(scenario) || !identifier(scenario.id) || scenarioIds.has(scenario.id) || !text(scenario.title, 200) || !text(scenario.summary, 2000) || typeof scenario.category !== 'string' || !categories.has(scenario.category) || !Array.isArray(scenario.nextActions) || scenario.nextActions.length > 30 || scenario.nextActions.some(action => !text(action, 1000))) return invalid()
    scenarioIds.add(scenario.id)
    return { id: scenario.id, title: scenario.title, summary: scenario.summary, category: scenario.category as FixtureScenario['category'], resourceIds: map(scenario.resourceIds, false), ...(scenario.resourceReferences === undefined ? {} : { resourceReferences: references(scenario.resourceReferences) }), nextActions: [...scenario.nextActions] as string[], credentials: map(scenario.credentials, true) }
  })
  return { environment: 'LOCAL_FIXTURE', namespace: 'local-ops-v1', version: 1, seededAt: value.seededAt as string | null, accounts, scenarios, note: value.note }
}
export async function readLocalFixtures(request: AdminControlRequest): Promise<LocalFixtureManifest> {
  return validateLocalFixtureManifest(await request<unknown>('/api/admin/local-fixtures'))
}

function references(value: unknown): Record<string, string> { if (value === undefined) return {}; if (!object(value)) return invalid(); return Object.fromEntries(Object.entries(value).map(([key, item]) => { if (typeof item !== "string" || !isValidReference(item) || privateKey.test(key)) return invalid(); return [key, item]; })); }
