<script setup lang="ts">
import { referenceText, referenceField } from "./adminReferences";
import AdminReferenceInput from './AdminReferenceInput.vue'
import { onMounted, onUnmounted, ref } from 'vue'

type Request = import('./adminControls').AdminControlRequest
type HistoryEntry = { action: string; actorUserId: string | null; metadata: string; createdAt: string }
type Cooperative = {
  id: string; code: string; name: string; city: string; status: string
  reviewedByUserId?: string | null; reviewedAt?: string | null; reviewReason?: string | null
  members: { merchantId: string }[]; history?: HistoryEntry[]
}
type Manifest = {
  manifestId: string; orderId: string; customerId: string; status: string; finalPackageId?: string | null
  approvedByUserId?: string | null; cooperativeId?: string | null; history?: HistoryEntry[]
  sellerPackages: { subOrderId: string; merchantId: string; packageCount: number; ready: boolean; collected: boolean }[]
}
type PendingAction = { description: string; submit: () => Promise<void>; applied: () => boolean; acknowledged: boolean }
const props = defineProps<{ request: Request; initialManifestId?: string }>()
const cooperatives = ref<Cooperative[]>([])
const manifests = ref<Manifest[]>([])
const selected = ref<Manifest | null>(null)
const orderId = ref('')
const cooperativeId = ref('')
const reviewReason = ref('')
const receiptNote = ref('')
const finalPackageId = ref('')
const busy = ref(false)
const stale = ref(true)
const pending = ref<PendingAction | null>(null)
const mayRevise = ref(false)
const error = ref('')
const message = ref('')
let disposed = false
onUnmounted(() => { disposed = true })
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—'
const encoded = encodeURIComponent
const group = (id: string) => manifests.value.find(item => item.manifestId === id)

function selectManifest(manifest: Manifest | null) {
  const changed = manifest?.manifestId !== selected.value?.manifestId
  if (changed) receiptNote.value = ''
  selected.value = manifest
  if (changed || manifest?.finalPackageId) finalPackageId.value = manifest?.finalPackageId ?? ''
}
async function run(operation: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''; mayRevise.value = false
  try { await operation(); if (!disposed) message.value = pending.value ? 'Server state refreshed; the saved action is not confirmed.' : 'Server state refreshed.' }
  catch (caught) {
    if (!disposed) {
      stale.value = true
      error.value = `${pending.value?.acknowledged ? 'The action was saved, but readback failed. ' : ''}${caught instanceof Error && caught.message !== 'request_failed' ? caught.message : 'Action was not confirmed.'} Refresh or retry the saved action; new writes remain blocked.`
    }
  } finally { if (!disposed) busy.value = false }
}
async function refresh() {
  const [markets, groups] = await Promise.all([
    props.request<Cooperative[]>('/api/admin/cooperatives'), props.request<Manifest[]>('/api/consolidations'),
  ])
  if (disposed) return
  cooperatives.value = markets; manifests.value = groups
  if (selected.value) selectManifest(groups.find(item => item.manifestId === selected.value?.manifestId) ?? null)
  stale.value = false
  if (pending.value) {
    if (pending.value.applied()) pending.value = null
    else mayRevise.value = true
  }
}
async function execute(action: PendingAction) {
  await run(async () => {
    await action.submit()
    if (disposed) return
    action.acknowledged = true
    await refresh()
  })
}
async function start(description: string, submit: () => Promise<void>, applied: () => boolean) {
  if (busy.value || stale.value || pending.value || !window.confirm(description)) return
  const action = { description, submit, applied, acknowledged: false }
  pending.value = action
  await execute(action)
}
function retry() { if (pending.value) void execute(pending.value) }
function revise() {
  if (!mayRevise.value || stale.value || busy.value) return
  pending.value = null; mayRevise.value = false
  message.value = 'Review the refreshed records before submitting a revised action.'
}
async function post(path: string, body: unknown) { await props.request(path, true, 'POST', body) }
async function review(cooperative: Cooperative, status: 'APPROVED' | 'REJECTED') {
  const reason = reviewReason.value.trim()
  if (!reason) { error.value = 'Enter a reason for the cooperative decision.'; return }
  const id = cooperative.id
  const body = Object.freeze({ status, reason })
  await start(`${status === 'APPROVED' ? 'Approve' : 'Reject'} cooperative ${cooperative.name} (${referenceText(cooperative)})?\nReason: ${reason}`, async () => {
    await post(`/api/admin/cooperatives/${encoded(id)}/review`, body)
  }, () => cooperatives.value.some(item => item.id === id && item.status === status && item.reviewReason === reason))
}
async function loadOrder() {
  const id = orderId.value.trim()
  if (!id || pending.value) return
  await run(async () => {
    await refresh()
    const manifest = await props.request<Manifest>(`/api/consolidations/order/${encoded(id)}`)
    if (!disposed) selectManifest(manifest)
  })
}
async function createGrouping() {
  const order = orderId.value.trim()
  const cooperative = cooperativeId.value
  if (!order) return
  const body = Object.freeze({ manifestId: crypto.randomUUID(), orderId: order, ...(cooperative ? { cooperativeId: cooperative } : {}) })
  await start(`Validate grouping for the verified order?\nCooperative: ${cooperatives.value.find(item => item.id === cooperative)?.name || 'Operator-approved grouping without cooperative'}.\nThe server derives the actual merchant packages.`, async () => {
    const accepted = await props.request<Manifest>('/api/consolidations', true, 'POST', body)
    const saved = await props.request<Manifest>(`/api/consolidations/${encoded(accepted.manifestId)}`)
    if (!disposed) selectManifest(saved)
  }, () => {
    const saved = manifests.value.find(item => item.orderId === order && (item.cooperativeId ?? '') === cooperative)
    if (saved) selectManifest(saved)
    return Boolean(saved)
  })
}
async function receive(subOrderId: string) {
  const manifest = selected.value
  const metadata = receiptNote.value.trim()
  if (!manifest || !metadata) { error.value = 'Enter the physical receipt reference before confirming custody.'; return }
  const id = manifest.manifestId
  const body = Object.freeze({ metadata })
  await start(`Confirm actual SEQUO receipt of ${referenceText(manifest.sellerPackages.find(part => part.subOrderId === subOrderId), "subOrderId")} for order ${referenceText(manifest, "orderId")}?\nReceipt reference: ${metadata}`, async () => {
    await post(`/api/consolidations/${encoded(id)}/seller-packages/${encoded(subOrderId)}/collected`, body)
  }, () => group(id)?.sellerPackages.some(item => item.subOrderId === subOrderId && item.collected) === true)
}
async function seal() {
  const manifest = selected.value
  const packageId = finalPackageId.value.trim()
  if (!manifest || !packageId) return
  const id = manifest.manifestId
  const body = Object.freeze({ event: 'SequoCreatesFinalPackage', finalPackageId: packageId })
  await start(`Seal the final package for order ${referenceText(manifest, "orderId")}?\nVerify all merchant packages are physically in SEQUO custody.`, async () => {
    const result = await props.request<{ accepted: boolean; reason: string }>(`/api/consolidations/${encoded(id)}/transitions`, true, 'POST', body)
    if (!result.accepted) throw new Error(result.reason)
  }, () => group(id)?.finalPackageId === packageId && ['Consolidated', 'Dispatched'].includes(group(id)?.status ?? ''))
}
async function dispatch() {
  const manifest = selected.value
  if (!manifest) return
  const id = manifest.manifestId
  const body = Object.freeze({})
  await start(`${manifest.status === 'Dispatched' ? 'Verify recorded' : 'Dispatch'} final package ${referenceText(manifest, 'finalPackageId')} for order ${referenceText(manifest, 'orderId')}?\nThe server enforces one final dispatch.`, async () => {
    await post(`/api/consolidations/${encoded(id)}/dispatch-final-package`, body)
  }, () => group(id)?.status === 'Dispatched')
}
onMounted(() => { void run(async () => { await refresh(); if (props.initialManifestId) selectManifest(group(props.initialManifestId) ?? null) }) })
</script>

<template>
  <section class="consolidation-operations" aria-label="Consolidation and cooperative approval">
    <div class="panel-heading"><h3>Grouping and cooperative approval</h3><button class="secondary" type="button" :disabled="busy" @click="run(refresh)">Refresh grouping</button></div>
    <p>Validate the actual merchants and packed packages before grouping. Receipt confirmation records physical custody; it does not replace courier pickup.</p>
    <p v-if="busy" role="status">Loading operation…</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="stale" role="status">Current server state is unverified. Refresh before a new action.</p>
    <aside v-if="pending" class="consolidation-card">
      <strong>Unconfirmed action: {{ pending.description }}</strong>
      <p>The approved inputs stay frozen on retry. Refresh first if you need to revise them.</p>
      <button type="button" :disabled="busy" @click="retry">Retry saved grouping action</button>
      <button v-if="mayRevise" class="secondary" type="button" :disabled="busy || stale" @click="revise">Revise after server refresh</button>
    </aside>
    <h4>Cooperatives</h4>
    <p v-if="!busy && !cooperatives.length">No cooperatives to review.</p>
    <label>Decision reason<input v-model="reviewReason" :disabled="busy || Boolean(pending)" maxlength="2000" autocomplete="off" /></label>
    <article v-for="cooperative in cooperatives" :key="cooperative.id" class="consolidation-card">
      <strong>{{ cooperative.name }} · {{ cooperative.status }}</strong>
      <p>{{ cooperative.city }} · {{ cooperative.members.map(member => referenceText(member, 'merchantId')).join(', ') }}</p>
      <p>Reviewed by {{ referenceText(cooperative, 'reviewedByUserId') }} · {{ timestamp(cooperative.reviewedAt) }}<span v-if="cooperative.reviewReason"> · {{ cooperative.reviewReason }}</span></p>
      <button type="button" :disabled="busy || stale || Boolean(pending) || !reviewReason.trim() || cooperative.status === 'APPROVED'" @click="review(cooperative, 'APPROVED')">Approve cooperative</button>
      <button class="secondary" type="button" :disabled="busy || stale || Boolean(pending) || !reviewReason.trim() || cooperative.status === 'REJECTED'" @click="review(cooperative, 'REJECTED')">Reject cooperative</button>
      <ul><li v-for="(entry, index) in cooperative.history ?? []" :key="index">{{ entry.action }} · {{ referenceText(entry, 'actorUserId') }} · {{ timestamp(entry.createdAt) }} · {{ entry.metadata }}</li></ul>
    </article>
    <h4>Order grouping</h4>
    <form class="filter-row" @submit.prevent="createGrouping">
      <label>Paid order reference<AdminReferenceInput v-model="orderId" :field="referenceField('orderId', 'Paid order reference')" :request="request" :disabled="busy || Boolean(pending)" /></label>
      <label>Approved cooperative (optional)<select v-model="cooperativeId" :disabled="busy || Boolean(pending)"><option value="">Operator-approved grouping without cooperative</option><option v-for="cooperative in cooperatives.filter(item => item.status === 'APPROVED')" :key="cooperative.id" :value="cooperative.id">{{ cooperative.name }}</option></select></label>
      <button type="submit" :disabled="busy || stale || Boolean(pending) || !orderId.trim()">Validate grouping</button>
      <button class="secondary" type="button" :disabled="busy || Boolean(pending) || !orderId.trim()" @click="loadOrder">Load order manifest</button>
    </form>
    <p v-if="!busy && !manifests.length">No manifests recorded.</p>
    <ul><li v-for="manifest in manifests" :key="manifest.manifestId"><button class="secondary" type="button" :disabled="busy || stale || Boolean(pending)" @click="selectManifest(manifest)">{{ referenceText(manifest, 'orderId') }} · {{ manifest.status }}</button></li></ul>
    <article v-if="selected" class="consolidation-card">
      <h4>{{ referenceText(selected, 'manifestId') }} · {{ selected.status }}</h4>
      <p>Order {{ referenceText(selected, 'orderId') }} · Grouping approved by {{ referenceText(selected, 'approvedByUserId') }}<span v-if="selected.cooperativeId"> · {{ referenceText(selected, 'cooperativeId') }}</span></p>
      <label>Physical receipt reference<input v-model="receiptNote" :disabled="busy || Boolean(pending)" maxlength="2000" autocomplete="off" /></label>
      <ul><li v-for="part in selected.sellerPackages" :key="part.subOrderId">
        {{ referenceText(part, 'merchantId') }} · {{ referenceText(part, 'subOrderId') }} · {{ part.packageCount }} package(s) · {{ part.ready ? 'Prepared' : 'Awaiting preparation' }} · {{ part.collected ? 'Received by SEQUO' : 'Awaiting SEQUO receipt' }}
        <button class="secondary" type="button" :disabled="busy || stale || Boolean(pending) || part.collected || !part.ready || !receiptNote.trim() || selected.status !== 'ReadyForSequoPickup'" @click="receive(part.subOrderId)">Confirm SEQUO receipt</button>
      </li></ul>
      <form class="filter-row" @submit.prevent="seal"><label>Final package label<input v-model="finalPackageId" :disabled="busy || Boolean(pending)" required maxlength="128" autocomplete="off" /></label><button type="submit" :disabled="busy || stale || Boolean(pending) || selected.status !== 'InSequoCustody' || !finalPackageId.trim() ">Seal final package</button></form>
      <button type="button" :disabled="busy || stale || Boolean(pending) || !['Consolidated', 'Dispatched'].includes(selected.status)" @click="dispatch">{{ selected.status === 'Dispatched' ? 'Verify final dispatch' : 'Dispatch final package' }}</button>
      <h4>Operator history</h4>
      <ul><li v-for="(entry, index) in selected.history ?? []" :key="index">{{ entry.action }} · {{ referenceText(entry, 'actorUserId') }} · {{ timestamp(entry.createdAt) }} · {{ entry.metadata }}</li></ul>
    </article>
  </section>
</template>

<style scoped>
.consolidation-operations { border-top: 1px solid var(--line, #d7dedb); margin-top: 1rem; padding-top: 1rem; }
.consolidation-card { border: 1px solid var(--line, #d7dedb); border-radius: .5rem; padding: .75rem; margin: .75rem 0; }
label { display: block; margin: .5rem 0; }
input, select { display: block; max-width: 100%; }
button { margin: .2rem; }
li { overflow-wrap: anywhere; margin: .5rem 0; }
</style>
