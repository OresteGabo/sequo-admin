<script setup lang="ts">
import { referenceText, referenceDisplayTree } from "./adminReferences";
import AdminReferenceInput from './AdminReferenceInput.vue'
import type { AdminControlField } from './adminControls'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { canManagePersonnel } from './adminPermissions'
import { relayAcknowledged, relayConfirmed, relayIntent, validRelayIntent, parseRelaySites, parseRelaySetup, parseRelayMission, type RelayAction, type RelayIntent, type RelayMutation, type RelaySetup, type RelaySite, type RelaySlot } from './relayAdministration'
type Request = <T>(path: string, retryAfterRefresh?: boolean, method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) => Promise<T>
type Mission = { id: string; orderId: string; relayPointId: string | null; status: string; destinationType: string; pickupAt: string | null; updatedAt: string; courierId: string | null }
const missionField: AdminControlField = { name: 'missionId', label: 'Delivery mission', type: 'string', location: 'path', required: true, maxLength: 128 }
const props = defineProps<{ request: Request; actorId: string; roles: readonly string[] }>()
const canManageSite = computed(() => canManagePersonnel(props.roles))
const emit = defineEmits<{ changed: [] }>()
const storageKey = `sequo_relay_admin_pending:${props.actorId}`
const rows = ref<RelaySite[]>([]), selected = ref<RelaySetup | null>(null), siteId = ref(''), error = ref(''), notice = ref(''), busy = ref(false), stale = ref(true)
const name = ref(''), latitude = ref(''), longitude = ref(''), city = ref(''), neighborhood = ref(''), landmark = ref(''), reason = ref(''), slotCode = ref('')
const missionId = ref(''), mission = ref<Mission | null>(null), depositSlotId = ref(''), physicalReceipt = ref(false)
const pending = ref<RelayIntent | null>(restore())
let disposed = false
onUnmounted(() => { disposed = true })
const stamp = (value: string) => new Date(value).toLocaleString()
function restore(): RelayIntent | null {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); return validRelayIntent(value, props.actorId) ? value : null } catch { return null }
}
function save(intent: RelayIntent | null) { pending.value = intent; if (intent) sessionStorage.setItem(storageKey, JSON.stringify(intent)); else sessionStorage.removeItem(storageKey) }
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await action() } catch (failure) { if (!disposed) { stale.value = true; error.value = `${failure instanceof Error ? failure.message : 'Action was not confirmed.'} ${pending.value ? 'The frozen action is retained; retry it unchanged or refresh its server history.' : 'Refresh before another action.'}` } }
  finally { if (!disposed) busy.value = false }
}
async function load(id = siteId.value) {
  stale.value = true; selected.value = null; rows.value = []
  const [sites, detail] = await Promise.all([props.request<RelaySite[]>('/api/admin/web/relay-sites'), id ? props.request<RelaySetup>(`/api/admin/web/relay-sites/${encodeURIComponent(id)}/setup`) : Promise.resolve(null)])
  if (disposed) return
  const checkedSites = parseRelaySites(sites); const checkedDetail = id ? parseRelaySetup(detail, id) : null
  rows.value = checkedSites; selected.value = checkedDetail; stale.value = false; siteId.value = checkedDetail?.site.id ?? ''
  const current = checkedDetail
  if (current) {
    name.value = current.site.name; latitude.value = String(current.site.latitude ?? ''); longitude.value = String(current.site.longitude ?? '')
    city.value = current.site.city ?? ''; neighborhood.value = current.site.neighborhood ?? ''; landmark.value = current.site.landmark ?? ''
  }
  if (pending.value?.operationId && current && relayConfirmed(current, pending.value)) { save(null); notice.value = 'Action confirmed by server history.'; emit('changed') }
}
function newSite() {
  if (pending.value || busy.value) return
  selected.value = null; siteId.value = ''; name.value = ''; latitude.value = ''; longitude.value = ''; city.value = ''; neighborhood.value = ''; landmark.value = ''; reason.value = ''; mission.value = null
}
function chooseSite() { reason.value = ''; mission.value = null; physicalReceipt.value = false; depositSlotId.value = ''; void run(() => load()) }
async function write(action: RelayAction, body?: Record<string, unknown>, slotId?: string) {
  if (['CREATE_SITE', 'UPDATE_SITE'].includes(action) && !canManageSite.value) throw Error('Staff manager or owner access is required to manage relay sites.')
  if (!pending.value) {
    if (stale.value || !body) return
    const preview = action === 'SEQUO_DEPOSIT' ? `Confirm actual SEQUO physical receipt for mission ${referenceText(mission.value)}, order ${referenceText(mission.value, "orderId")}, slot ${selected.value?.slots.find(item => item.id === depositSlotId.value)?.lockerCode ?? "Selected slot"}?\nRecorded rider pickup must already exist; this does not create a pickup or change assignment.` :
      action === 'CREATE_SITE' ? `Create relay ${name.value} at ${latitude.value}, ${longitude.value}?\nIt remains unavailable for checkout until an operator and free logical slot are configured.` :
        `${action.replaceAll('_', ' ')} · ${selected.value?.site.name} (${referenceText(selected.value?.site)})${slotId ? ` · slot ${selected.value?.slots.find(item => item.id === slotId)?.lockerCode ?? "Selected slot"}` : ''}\nThis records logical storage only; it sends no physical hardware command.`
    const draft = relayIntent(action, props.actorId, action === 'CREATE_SITE' ? null : siteId.value, body, slotId)
    if (!window.confirm(`${preview}\nReason: ${body.reason}`)) return
    save(draft)
  }
  const intent = pending.value!
  const response = await props.request<RelayMutation>(intent.path, true, intent.method, intent.body)
  if (disposed) return
  if (!relayAcknowledged(response, intent)) throw Error('The server response did not confirm the saved actor, target and action.')
  save({ ...intent, siteId: response.operation.relayPointId, operationId: response.operation.id })
  await load(response.operation.relayPointId)
  if (pending.value) throw Error('The write was acknowledged but matching server history is unavailable.')
  reason.value = ''; slotCode.value = ''; mission.value = null; physicalReceipt.value = false
}
function siteBody() {
  if (!latitude.value.trim() || !longitude.value.trim()) throw Error('Latitude and longitude are required.')
  const lat = Number(latitude.value), lon = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw Error('Enter valid latitude and longitude.')
  return { name: name.value, latitude: lat, longitude: lon, city: city.value || null, neighborhood: neighborhood.value || null, landmark: landmark.value || null, reason: reason.value,
    ...(selected.value ? { expectedUpdatedAt: selected.value.site.updatedAt } : {}) }
}
function submitSite() { void run(() => write(selected.value ? 'UPDATE_SITE' : 'CREATE_SITE', siteBody())) }
function addSlot() { void run(() => write('CREATE_SLOT', { lockerCode: slotCode.value, expectedUpdatedAt: selected.value?.site.updatedAt, reason: reason.value })) }
function availability(slot: RelaySlot) { void run(() => write('SET_SLOT_AVAILABILITY', { status: slot.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE', expectedUpdatedAt: slot.updatedAt, reason: reason.value }, slot.id)) }
function readMission() { void run(async () => { mission.value = null; const requested = missionId.value.trim(); const value = await props.request<Mission>(`/api/delivery/missions/${encodeURIComponent(requested)}`); if (!disposed) { mission.value = parseRelayMission(value, requested); physicalReceipt.value = false } }) }
function deposit() {
  const slot = selected.value?.slots.find(slot => slot.id === depositSlotId.value)
  if (!mission.value || !slot || !physicalReceipt.value) return
  void run(() => write('SEQUO_DEPOSIT', { missionId: mission.value!.id, lockerId: slot.id, expectedMissionUpdatedAt: mission.value!.updatedAt,
    expectedSlotUpdatedAt: slot.updatedAt, physicalReceiptConfirmed: true, reason: reason.value }))
}
function discard() {
  if (pending.value && window.confirm('Discard only the saved local retry? This does not undo any server action. Review server history before creating a different action.')) { save(null); void run(() => load()) }
}
onMounted(() => { if (pending.value) reason.value = String(pending.value.body.reason); void run(() => load(pending.value?.siteId ?? '')) })
</script>
<template>
  <section class="detail-card relay-administration">
    <header><h3>Relay setup and SEQUO receipt</h3><button :disabled="busy" @click="run(() => load())">Refresh server state</button></header>
    <p>Set up relay locations and recorded storage spaces, then record receipt of an eligible delivery. Open relay operations above for pickup and overdue decisions.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="busy" role="status">Loading server records…</p>
    <div v-if="pending" class="pending"><strong>Unconfirmed saved action: {{ pending.action }}</strong><p>Target: {{ selected ? referenceText(selected.site) : 'New site' }}. Inputs are frozen until its server result is confirmed.</p><button :disabled="busy" @click="run(() => write(pending!.action))">Retry saved action unchanged</button><button :disabled="busy" @click="discard">Discard local retry after review</button></div>
    <label>Recorded relay<select v-model="siteId" :disabled="busy || !!pending" @change="chooseSite"><option value="">Choose a site</option><option v-for="site in rows" :key="site.id" :value="site.id">{{ site.name }} · {{ site.status }}</option></select></label>
    <p v-if="!canManageSite" class="subtle">Staff managers and owners manage relay locations. Operations can manage existing storage availability and delivery receipt.</p>
    <p v-if="!busy && !rows.length">No relay sites are recorded. Create the first site, then assign an existing authorized operator through relay management.</p>
    <button v-if="canManageSite" :disabled="busy || !!pending" @click="newSite">Prepare new site</button>
    <form v-if="canManageSite" @submit.prevent="submitSite">
      <fieldset :disabled="busy || !!pending || stale"><legend>{{ selected ? 'Recorded site details' : 'New relay site' }}</legend>
        <label>Name<input v-model="name" required maxlength="120"></label><div class="coordinates"><label>Latitude<input v-model="latitude" inputmode="decimal" required></label><label>Longitude<input v-model="longitude" inputmode="decimal" required></label></div>
        <label>City<input v-model="city" maxlength="128"></label><label>Neighborhood<input v-model="neighborhood" maxlength="128"></label><label>Landmark / access instructions<input v-model="landmark" maxlength="500"></label>
        <p v-if="selected">Operator: {{ selected.site.operatorUserId ? referenceText(selected.site, 'operatorUserId') : 'Unassigned — unavailable for checkout' }}. Location cannot be moved once storage slots exist.</p>
      </fieldset>
      <label>Reason for the next action<textarea v-model="reason" required maxlength="1000" :readonly="!!pending" :disabled="busy"></textarea></label>
      <button :disabled="busy || stale || !!pending || !reason.trim()">{{ selected ? 'Review site update' : 'Review new site' }}</button>
    </form>
    <template v-if="selected">
      <h4>Recorded logical slots</h4><p v-if="!selected.slots.length">No logical slots. This site cannot be selected for a new relay checkout.</p>
      <ul><li v-for="slot in selected.slots" :key="slot.id">{{ slot.lockerCode }} · {{ slot.status }} <button :disabled="busy || stale || !!pending || !reason.trim() || slot.status === 'OCCUPIED'" @click="availability(slot)">{{ slot.status === 'MAINTENANCE' ? 'Review return to available' : 'Review maintenance' }}</button></li></ul>
      <form @submit.prevent="addSlot"><label>New logical slot code<input v-model="slotCode" maxlength="32" required :disabled="busy || !!pending"></label><button :disabled="busy || stale || !!pending || !reason.trim()">Review new logical slot</button></form>
      <h4>SEQUO physical relay receipt</h4><p>Use an existing relay mission after its assigned rider has recorded pickup. The persisted destination and free slot are verified again by the server.</p>
      <form @submit.prevent="readMission"><label>Mission ID<AdminReferenceInput v-model="missionId" :field="missionField" :request="request" :disabled="busy || !!pending" /></label><button :disabled="busy || !!pending">Read mission from server</button></form>
      <div v-if="mission"><p>Mission {{ referenceText(mission) }} · order {{ referenceText(mission, 'orderId') }} · {{ mission.status }} · assigned rider {{ referenceText(mission, 'courierId') }} · relay {{ referenceText(mission, 'relayPointId') }}</p>
        <label>Free logical slot<select v-model="depositSlotId" :disabled="busy || !!pending"><option value="">Choose a slot</option><option v-for="slot in selected.slots.filter(slot => slot.status === 'AVAILABLE')" :key="slot.id" :value="slot.id">{{ slot.lockerCode }}</option></select></label>
        <label><input v-model="physicalReceipt" type="checkbox" :disabled="busy || !!pending"> The package is physically received by SEQUO at this selected relay site</label>
        <button :disabled="busy || stale || !!pending || !reason.trim() || !physicalReceipt || !depositSlotId || mission.status !== 'PICKED_UP_FROM_SELLER' || mission.destinationType !== 'RELAY_POINT' || mission.relayPointId !== siteId" @click="deposit">Review SEQUO receipt and deposit</button>
      </div>
      <h4>Recorded setup and SEQUO actions</h4><p v-if="!selected.history.length">No setup history was recorded for this legacy site.</p>
      <ol><li v-for="event in selected.history" :key="event.id"><strong>{{ event.action }}</strong> · {{ stamp(event.createdAt) }} · {{ referenceText(event, 'actorUserId') }}<p>{{ event.reason }}</p><small>{{ referenceDisplayTree(event.before) }} → {{ referenceDisplayTree(event.after) }}</small></li></ol>
    </template>
  </section>
</template>
<style scoped>
.relay-administration header,.coordinates{display:flex;gap:1rem;justify-content:space-between;flex-wrap:wrap}.relay-administration form,.relay-administration fieldset{display:grid;gap:.65rem;margin:.8rem 0}.relay-administration label{display:grid;gap:.35rem}.relay-administration input,.relay-administration select,.relay-administration textarea{max-width:100%;min-height:2.6rem;padding:.45rem}.relay-administration input[type=checkbox]{min-height:auto}.relay-administration li{margin:.7rem 0}.error{color:#a52b2b}.pending{padding:.8rem;border:1px solid #b08325}.relay-administration small{overflow-wrap:anywhere}
</style>
