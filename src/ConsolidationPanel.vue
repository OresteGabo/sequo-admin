<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

type Request = <T>(path: string, retryAfterRefresh?: boolean, method?: 'GET' | 'POST', body?: unknown) => Promise<T>
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
const props = defineProps<{ request: Request }>()
const cooperatives = ref<Cooperative[]>([])
const manifests = ref<Manifest[]>([])
const selected = ref<Manifest | null>(null)
const orderId = ref('')
const cooperativeId = ref('')
const reviewReason = ref('')
const receiptNote = ref('')
const finalPackageId = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
let disposed = false
let pendingCreation: { orderId: string; manifestId: string } | null = null
onUnmounted(() => { disposed = true })
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—'
const encoded = encodeURIComponent

async function run(operation: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try { await operation(); if (!disposed) message.value = 'Server state refreshed.' }
  catch (caught) {
    if (!disposed) error.value = `${message.value.startsWith('Action saved') ? 'The action was saved, but readback failed. ' : ''}${caught instanceof Error && caught.message !== 'request_failed' ? caught.message : 'Action was not confirmed.'} Refresh before retrying; no local state has been marked complete.`
  } finally { if (!disposed) busy.value = false }
}
async function save<T = unknown>(path: string, body: unknown): Promise<T> {
  const saved = await props.request<T>(path, true, 'POST', body)
  if (!disposed) message.value = 'Action saved on server; refreshing records…'
  return saved
}
async function refresh() {
  const [markets, groups] = await Promise.all([
    props.request<Cooperative[]>('/api/admin/cooperatives'), props.request<Manifest[]>('/api/consolidations'),
  ])
  if (disposed) return
  cooperatives.value = markets; manifests.value = groups
  if (selected.value) selected.value = groups.find(group => group.manifestId === selected.value?.manifestId) ?? null
}
async function review(cooperative: Cooperative, status: 'APPROVED' | 'REJECTED') {
  if (!reviewReason.value.trim()) { error.value = 'Enter a reason for the cooperative decision.'; return }
  await run(async () => {
    await save(`/api/admin/cooperatives/${encoded(cooperative.id)}/review`, { status, reason: reviewReason.value.trim() })
    await refresh()
  })
}
async function loadOrder() {
  if (!orderId.value.trim()) return
  await run(async () => {
    const manifest = await props.request<Manifest>(`/api/consolidations/order/${encoded(orderId.value.trim())}`)
    if (!disposed) { selected.value = manifest; finalPackageId.value = manifest.finalPackageId ?? '' }
  })
}
async function createGrouping() {
  const order = orderId.value.trim()
  if (!order) return
  if (pendingCreation?.orderId !== order) pendingCreation = { orderId: order, manifestId: crypto.randomUUID() }
  const manifestId = pendingCreation.manifestId
  await run(async () => {
    const accepted = await save<Manifest>('/api/consolidations', { manifestId, orderId: order, ...(cooperativeId.value ? { cooperativeId: cooperativeId.value } : {}) })
    const saved = await props.request<Manifest>(`/api/consolidations/${encoded(accepted.manifestId)}`)
    if (!disposed) { selected.value = saved; finalPackageId.value = saved.finalPackageId ?? '' }
    await refresh()
  })
}
async function receive(subOrderId: string) {
  const manifest = selected.value
  if (!manifest || !receiptNote.value.trim()) { error.value = 'Enter the physical receipt reference before confirming custody.'; return }
  await run(async () => {
    await save(`/api/consolidations/${encoded(manifest.manifestId)}/seller-packages/${encoded(subOrderId)}/collected`, { metadata: receiptNote.value.trim() })
    await refresh()
  })
}
async function seal() {
  const manifest = selected.value
  if (!manifest || !finalPackageId.value.trim()) return
  await run(async () => {
    const result = await props.request<{ accepted: boolean; reason: string }>(`/api/consolidations/${encoded(manifest.manifestId)}/transitions`, true, 'POST', {
      event: 'SequoCreatesFinalPackage', finalPackageId: finalPackageId.value.trim(),
    })
    if (!result.accepted) throw new Error(result.reason)
    if (!disposed) message.value = 'Action saved on server; refreshing records…'
    await refresh()
  })
}
async function dispatch() {
  const manifest = selected.value
  if (!manifest) return
  await run(async () => {
    await save(`/api/consolidations/${encoded(manifest.manifestId)}/dispatch-final-package`, {})
    await refresh()
  })
}
onMounted(() => { void run(refresh) })
</script>

<template>
  <section class="consolidation-operations" aria-label="Consolidation and cooperative approval">
    <div class="panel-heading"><h3>Grouping and cooperative approval</h3><button class="secondary" type="button" :disabled="busy" @click="run(refresh)">Refresh grouping</button></div>
    <p>Validate the actual merchants and packed packages before grouping. Receipt confirmation records physical custody; it does not replace courier pickup.</p>
    <p v-if="busy" role="status">Loading operation…</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <h4>Cooperatives</h4>
    <p v-if="!busy && !cooperatives.length">No cooperatives to review.</p>
    <label>Decision reason<input v-model="reviewReason" maxlength="2000" autocomplete="off" /></label>
    <article v-for="cooperative in cooperatives" :key="cooperative.id" class="consolidation-card">
      <strong>{{ cooperative.name }} · {{ cooperative.status }}</strong>
      <p>{{ cooperative.city }} · {{ cooperative.members.map(member => member.merchantId).join(', ') }}</p>
      <p>Reviewed by {{ cooperative.reviewedByUserId ?? 'Not reviewed' }} · {{ timestamp(cooperative.reviewedAt) }}<span v-if="cooperative.reviewReason"> · {{ cooperative.reviewReason }}</span></p>
      <button type="button" :disabled="busy || !reviewReason.trim() || cooperative.status === 'APPROVED'" @click="review(cooperative, 'APPROVED')">Approve cooperative</button>
      <button class="secondary" type="button" :disabled="busy || !reviewReason.trim() || cooperative.status === 'REJECTED'" @click="review(cooperative, 'REJECTED')">Reject cooperative</button>
      <ul><li v-for="(entry, index) in cooperative.history ?? []" :key="index">{{ entry.action }} · {{ entry.actorUserId ?? 'System' }} · {{ timestamp(entry.createdAt) }} · {{ entry.metadata }}</li></ul>
    </article>
    <h4>Order grouping</h4>
    <form class="filter-row" @submit.prevent="createGrouping">
      <label>Paid order ID<input v-model="orderId" required maxlength="128" autocomplete="off" /></label>
      <label>Approved cooperative (optional)<select v-model="cooperativeId"><option value="">Operator-approved grouping without cooperative</option><option v-for="cooperative in cooperatives.filter(item => item.status === 'APPROVED')" :key="cooperative.id" :value="cooperative.id">{{ cooperative.name }}</option></select></label>
      <button type="submit" :disabled="busy || !orderId.trim()">Validate grouping</button>
      <button class="secondary" type="button" :disabled="busy || !orderId.trim()" @click="loadOrder">Load order manifest</button>
    </form>
    <p v-if="!busy && !manifests.length">No manifests recorded.</p>
    <ul><li v-for="manifest in manifests" :key="manifest.manifestId"><button class="secondary" type="button" :disabled="busy" @click="selected = manifest; finalPackageId = manifest.finalPackageId ?? ''">{{ manifest.orderId }} · {{ manifest.status }}</button></li></ul>
    <article v-if="selected" class="consolidation-card">
      <h4>{{ selected.manifestId }} · {{ selected.status }}</h4>
      <p>Order {{ selected.orderId }} · Grouping approved by {{ selected.approvedByUserId ?? 'Legacy approval unavailable' }}<span v-if="selected.cooperativeId"> · {{ selected.cooperativeId }}</span></p>
      <label>Physical receipt reference<input v-model="receiptNote" maxlength="2000" autocomplete="off" /></label>
      <ul><li v-for="part in selected.sellerPackages" :key="part.subOrderId">
        {{ part.merchantId }} · {{ part.subOrderId }} · {{ part.packageCount }} package(s) · {{ part.ready ? 'Prepared' : 'Awaiting preparation' }} · {{ part.collected ? 'Received by SEQUO' : 'Awaiting SEQUO receipt' }}
        <button class="secondary" type="button" :disabled="busy || part.collected || !part.ready || !receiptNote.trim() || selected.status !== 'ReadyForSequoPickup'" @click="receive(part.subOrderId)">Confirm SEQUO receipt</button>
      </li></ul>
      <form class="filter-row" @submit.prevent="seal"><label>Final package ID<input v-model="finalPackageId" required maxlength="128" autocomplete="off" /></label><button type="submit" :disabled="busy || selected.status !== 'InSequoCustody' || !finalPackageId.trim()">Seal final package</button></form>
      <button type="button" :disabled="busy || !['Consolidated', 'Dispatched'].includes(selected.status)" @click="dispatch">{{ selected.status === 'Dispatched' ? 'Verify final dispatch' : 'Dispatch final package' }}</button>
      <h4>Operator history</h4>
      <ul><li v-for="(entry, index) in selected.history ?? []" :key="index">{{ entry.action }} · {{ entry.actorUserId ?? 'System' }} · {{ timestamp(entry.createdAt) }} · {{ entry.metadata }}</li></ul>
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
