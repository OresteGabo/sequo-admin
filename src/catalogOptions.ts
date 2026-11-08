import type { AdminControlRequest } from './adminControls'

export type CatalogOption = { id: string; name: string; priceDeltaCfa: number; sortOrder: number; active: boolean }
export type CatalogOptionGroup = { id: string; productId: string; name: string; minChoices: number; maxChoices: number; sortOrder: number; active: boolean; options: CatalogOption[] }
export type CatalogOptionDraft = { clientId: string; id?: string; name: string; priceDeltaCfa: number | string; active: boolean }
export type CatalogOptionGroupDraft = { clientId: string; id?: string; name: string; minChoices: number | string; maxChoices: number | string; active: boolean; options: CatalogOptionDraft[] }
export type CatalogOptionBody = { groups: { id?: string; name: string; minChoices: number; maxChoices: number; sortOrder: number; active: boolean; options: { id?: string; name: string; priceDeltaCfa: number; sortOrder: number; active: boolean }[] }[] }
export type CatalogOptionsIntent = { productId: string; before: CatalogOptionGroup[]; body: CatalogOptionBody; removedGroups: number; removedOptions: number }
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, label: string, max = 2147483647): number => {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') throw new Error(`${label} is required.`)
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new Error(`${label} must be a whole number between 0 and ${max}.`)
  return number
}
const order = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) throw new Error('The server option order is invalid. Refresh before editing.')
  return value
}
const name = (value: unknown, label: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is required and must be at most ${max} characters.`)
  return value.trim()
}
function productPath(productId: string) {
  if (!identifier.test(productId)) throw new Error('Select a valid product before editing options.')
  return `/api/catalog/products/${encodeURIComponent(productId)}/customizations`
}
export async function readCatalogOptions(productId: string, request: AdminControlRequest): Promise<CatalogOptionGroup[]> {
  const data = await request<unknown>(`${productPath(productId)}?includeInactive=true`)
  if (!Array.isArray(data) || data.length > 20) throw new Error('The full option menu could not be read. Refresh before editing.')
  const groupIds = new Set<string>(); const optionIds = new Set<string>()
  return data.map(group => {
    if (!object(group) || typeof group.id !== 'string' || !identifier.test(group.id) || group.productId !== productId || groupIds.has(group.id) || typeof group.active !== 'boolean' || !Array.isArray(group.options) || !group.options.length || group.options.length > 50) throw new Error('The server option menu is incomplete or belongs to another product. No changes were prepared.')
    groupIds.add(group.id)
    return { id: group.id, productId, name: name(group.name, 'Group name', 120), minChoices: integer(group.minChoices, 'Minimum choices', 50), maxChoices: integer(group.maxChoices, 'Maximum choices', 50), sortOrder: order(group.sortOrder), active: group.active,
      options: group.options.map(option => {
        if (!object(option) || typeof option.id !== 'string' || !identifier.test(option.id) || optionIds.has(option.id) || typeof option.active !== 'boolean') throw new Error('The server option menu contains invalid option identities. Refresh before editing.')
        optionIds.add(option.id)
        return { id: option.id, name: name(option.name, 'Option name', 140), priceDeltaCfa: integer(option.priceDeltaCfa, 'Supplement price'), sortOrder: order(option.sortOrder), active: option.active }
      }),
    }
  })
}
export function catalogOptionDrafts(groups: readonly CatalogOptionGroup[]): CatalogOptionGroupDraft[] {
  return groups.map(group => ({ clientId: group.id, id: group.id, name: group.name, minChoices: group.minChoices, maxChoices: group.maxChoices, active: group.active, options: group.options.map(option => ({ clientId: option.id, id: option.id, name: option.name, priceDeltaCfa: option.priceDeltaCfa, active: option.active })) }))
}
export function prepareCatalogOptions(productId: string, before: readonly CatalogOptionGroup[], drafts: readonly CatalogOptionGroupDraft[]): CatalogOptionsIntent {
  productPath(productId)
  if (before.some(group => group.productId !== productId)) throw new Error('Refresh the selected product before preparing changes.')
  if (drafts.length > 20) throw new Error('A product may have at most 20 option groups.')
  const retainedGroups = new Set<string>(); const retainedOptions = new Set<string>(); const newGroupNames = new Set<string>()
  const groups = drafts.map((group, groupIndex) => {
    const groupName = name(group.name, `Group ${groupIndex + 1} name`, 120)
    const old = group.id ? before.find(record => record.id === group.id) : undefined
    if (group.id && (!old || retainedGroups.has(group.id))) throw new Error('Group identities changed. Reload before editing.')
    if (group.id) retainedGroups.add(group.id)
    else if (newGroupNames.has(groupName)) throw new Error('New option group names must be distinct.')
    else newGroupNames.add(groupName)
    if (!group.options.length || group.options.length > 50) throw new Error(`${groupName} needs between 1 and 50 options.`)
    const minChoices = integer(group.minChoices, `${groupName}: minimum choices`, 50)
    const maxChoices = integer(group.maxChoices, `${groupName}: maximum choices`, 50)
    if (minChoices > maxChoices || maxChoices > group.options.length) throw new Error(`${groupName}: minimum must not exceed maximum, and maximum must fit the option count.`)
    const newNames = new Set<string>()
    const options = group.options.map((option, optionIndex) => {
      const optionName = name(option.name, `${groupName}: option name`, 140)
      if (option.id && (!old?.options.some(record => record.id === option.id) || retainedOptions.has(option.id))) throw new Error('Option identities changed or moved to another group. Reload before editing.')
      if (option.id) retainedOptions.add(option.id)
      else if (newNames.has(optionName)) throw new Error(`${groupName}: new option names must be distinct.`)
      else newNames.add(optionName)
      if (typeof option.active !== 'boolean') throw new Error('Choose an availability state for each option.')
      return { ...(option.id ? { id: option.id } : {}), name: optionName, priceDeltaCfa: integer(option.priceDeltaCfa, `${optionName}: supplement price`), sortOrder: optionIndex, active: option.active }
    })
    if (typeof group.active !== 'boolean') throw new Error('Choose an availability state for each group.')
    if (group.active && minChoices > options.filter(option => option.active).length) throw new Error(`${groupName}: make enough options available to satisfy the minimum choices.`)
    return { ...(group.id ? { id: group.id } : {}), name: groupName, minChoices, maxChoices, sortOrder: groupIndex, active: group.active, options }
  })
  const intent = { productId, before: before.map(group => ({ ...group, options: group.options.map(option => ({ ...option })) })), body: { groups }, removedGroups: before.filter(group => !retainedGroups.has(group.id)).length, removedOptions: before.flatMap(group => group.options).filter(option => !retainedOptions.has(option.id)).length }
  // Freeze the reviewed request, including nested arrays, before any write or retry.
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } }
  freeze(intent)
  return intent
}
export function catalogOptionsMatch(groups: readonly CatalogOptionGroup[], body: CatalogOptionBody): boolean {
  return groups.length === body.groups.length && groups.every((group, index) => {
    const desired = body.groups[index]!
    return (!desired.id || desired.id === group.id) && group.name === desired.name && group.minChoices === desired.minChoices && group.maxChoices === desired.maxChoices && group.sortOrder === desired.sortOrder && group.active === desired.active && group.options.length === desired.options.length && group.options.every((option, optionIndex) => {
      const want = desired.options[optionIndex]!
      return (!want.id || want.id === option.id) && option.name === want.name && option.priceDeltaCfa === want.priceDeltaCfa && option.sortOrder === want.sortOrder && option.active === want.active
    })
  })
}
export async function writeCatalogOptions(intent: CatalogOptionsIntent, request: AdminControlRequest, acknowledged?: () => void): Promise<CatalogOptionGroup[]> {
  const current = await readCatalogOptions(intent.productId, request)
  if (catalogOptionsMatch(current, intent.body)) return current
  if (JSON.stringify(current) !== JSON.stringify(intent.before)) throw new Error('The server menu changed after this review. Reload and review the current options before saving.')
  await request<unknown>(productPath(intent.productId), false, 'PUT', intent.body)
  acknowledged?.()
  const readback = await readCatalogOptions(intent.productId, request)
  if (!catalogOptionsMatch(readback, intent.body)) throw new Error('The saved menu is not confirmed by readback. Refresh and inspect it before repeating.')
  return readback
}
