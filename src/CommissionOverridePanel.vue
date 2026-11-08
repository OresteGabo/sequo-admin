<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { commissionIntentRecorded, commissionWritesSupported, createCommissionIntent, readCommission, validMerchantId, writeCommissionIntent, type CommissionIntent, type CommissionRead, type CommissionRequest } from './commissionOverrides'
const props = defineProps<{ request: CommissionRequest; actorId: string }>()
const emit = defineEmits<{ changed: [] }>()
const storageKey = `sequo_commission_pending:${props.actorId}`
const merchantId = ref(''); const percent = ref(''); const reason = ref('')
const current = ref<CommissionRead | null>(null); const stale = ref(true); const busy = ref(false)
const error = ref(''); const notice = ref(''); const preview = ref<CommissionIntent | null>(null)
const pending = ref<CommissionIntent | null>(restore())
let disposed = false
onUnmounted(() => { disposed = true })
const rate = (bps: number | undefined) => typeof bps === 'number' ? `${(bps / 100).toFixed(2)}%` : 'Unavailable'
const timestamp = (value: string) => new Date(value).toLocaleString()
function restore(): CommissionIntent | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as CommissionIntent | null
    if (saved?.actorId === props.actorId && typeof saved.merchantId === 'string' && validMerchantId(saved.merchantId) && ['SET', 'RESET'].includes(saved.action) &&
      Number.isSafeInteger(saved.beforeRateBps) && Number.isSafeInteger(saved.afterRateBps) && saved.body &&
      typeof saved.body.reason === 'string' && Boolean(saved.body.reason.trim()) && saved.body.reason.length <= 255 &&
      typeof saved.body.expectedRevision === 'string' && Boolean(saved.body.expectedRevision) &&
      typeof saved.body.idempotencyKey === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(saved.body.idempotencyKey) &&
      (saved.action !== 'SET' || saved.body.commissionRateBps === saved.afterRateBps)) return { ...saved, acknowledged: saved.acknowledged === true, body: Object.freeze(saved.body) }
  } catch { /* Invalid local drafts cannot become commission writes. */ }
  return null
}
function save(intent: CommissionIntent | null) {
  pending.value = intent
  if (intent) sessionStorage.setItem(storageKey, JSON.stringify(intent)); else sessionStorage.removeItem(storageKey)
}
function showRead(read: CommissionRead) {
  current.value = read; merchantId.value = read.merchantId; percent.value = (read.commissionRateBps / 100).toFixed(2); stale.value = false
}
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''; current.value = null; stale.value = true; preview.value = null
  try {
    const read = await readCommission(pending.value?.merchantId ?? merchantId.value, props.request)
    if (disposed) return
    showRead(read)
    if (pending.value && commissionIntentRecorded(read, pending.value)) { save(null); reason.value = ''; emit('changed'); notice.value = 'The server audit confirms your saved change. Current effective terms are shown below.' }
    else notice.value = pending.value ? 'Server state refreshed. The saved intent remains unconfirmed; review history before retrying or revising.' : 'Current effective terms read from the server.'
  } catch (caught) { if (!disposed) error.value = caught instanceof Error ? caught.message : 'Commission terms could not be read.' }
  finally { if (!disposed) busy.value = false }
}
function prepare(action: 'SET' | 'RESET') {
  if (busy.value || stale.value || pending.value || !current.value) return
  error.value = ''; notice.value = ''
  try { preview.value = createCommissionIntent(current.value, props.actorId, action, percent.value, reason.value, crypto.randomUUID()) }
  catch (caught) { error.value = caught instanceof Error ? caught.message : 'Review the proposed change.' }
}
async function submit() {
  if (busy.value) return
  const intent = pending.value ?? preview.value
  if (!intent) return
  save(intent); preview.value = null; busy.value = true; error.value = ''; notice.value = ''; current.value = null; stale.value = true
  try {
    const read = await writeCommissionIntent(intent, props.request, () => { if (!disposed) save({ ...intent, acknowledged: true }) })
    if (disposed) return
    showRead(read); save(null); reason.value = ''; emit('changed'); notice.value = 'Change confirmed by server audit and readback. Current effective terms are shown below.'
  } catch (caught) {
    if (!disposed) error.value = `${pending.value?.acknowledged ? 'Write response received, but readback is unconfirmed. ' : ''}${caught instanceof Error ? caught.message : 'The change was not confirmed.'} Refresh before revising; retries keep the same saved request.`
  } finally { if (!disposed) busy.value = false }
}
function revise() {
  if (busy.value || stale.value || !current.value) return
  save(null); preview.value = null; reason.value = ''; notice.value = 'Local saved intent discarded after server refresh. Review the current terms before preparing another change.'
}
onMounted(() => { if (pending.value) { merchantId.value = pending.value.merchantId; void refresh() } })
</script>

<template>
  <section class="commission-override" aria-label="Merchant commission editor">
    <h3>Merchant commission editor</h3>
    <p>Changes affect future commission calculations. Existing order and settlement snapshots retain their recorded rates. Category commission rules are not configured here.</p>
    <form class="filter-row" @submit.prevent="refresh"><label>Merchant ID<input v-model="merchantId" maxlength="128" required autocomplete="off" :disabled="busy || Boolean(pending) || Boolean(preview)" /></label><button class="secondary" type="submit" :disabled="busy || !merchantId.trim() || Boolean(preview)">{{ busy ? 'Reading or saving…' : 'Read current commission' }}</button></form>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <aside v-if="pending" class="commission-card">
      <h4>Saved {{ pending.action === 'SET' ? 'override' : 'reset' }} intent for {{ pending.merchantId }}</h4>
      <p>{{ rate(pending.beforeRateBps) }} → {{ rate(pending.afterRateBps) }} · {{ pending.body.reason }}</p>
      <p>The saved request and retry key remain unchanged until the server audit confirms this operation.</p>
      <button type="button" :disabled="busy" @click="submit">Retry saved commission change</button>
      <button v-if="current && !stale" class="secondary" type="button" :disabled="busy" @click="revise">Discard saved intent after review</button>
    </aside>
    <article v-if="current" class="commission-card">
      <h4>{{ current.merchantId }} · Effective {{ rate(current.commissionRateBps) }}</h4>
      <p>Source: {{ current.override ? 'Merchant override' : 'Server default' }} · Default {{ rate(current.defaultRateBps) }} · Allowed {{ rate(current.minRateBps) }}–{{ rate(current.maxRateBps) }}</p>
      <p v-if="current.override">Last override: {{ current.override.updatedByUserId }} · {{ timestamp(current.override.updatedAt) }} · {{ current.override.reason ?? 'No reason recorded' }}</p>
      <p v-if="!commissionWritesSupported(current)" class="error-text">Policy, revision or history metadata is unavailable. This record remains read-only.</p>
      <form @submit.prevent="prepare('SET')">
        <label>Proposed commission (%)<input v-model="percent" inputmode="decimal" required :disabled="busy || stale || Boolean(pending) || Boolean(preview) || !commissionWritesSupported(current)" /></label>
        <label>Reason<textarea v-model="reason" required maxlength="255" :disabled="busy || stale || Boolean(pending) || Boolean(preview) || !commissionWritesSupported(current)" /></label>
        <button type="submit" :disabled="busy || stale || Boolean(pending) || Boolean(preview) || !commissionWritesSupported(current) || !reason.trim()">Review override change</button>
        <button class="secondary" type="button" :disabled="busy || stale || Boolean(pending) || Boolean(preview) || !current.override || !commissionWritesSupported(current) || !reason.trim()" @click="prepare('RESET')">Review reset to default</button>
      </form>
      <h4>Server commission history</h4><p v-if="!current.history?.length">No historical changes recorded. Older override details do not imply a complete audit history.</p>
      <ul><li v-for="entry in current.history ?? []" :key="entry.id"><strong>{{ entry.action }} · {{ rate(entry.beforeRateBps) }} → {{ rate(entry.afterRateBps) }}</strong><p>{{ entry.actorUserId ?? 'Actor unavailable' }} · {{ timestamp(entry.createdAt) }} · {{ entry.reason ?? 'No reason recorded' }}</p><p>{{ entry.id }}</p></li></ul>
    </article>
    <aside v-if="preview" class="commission-card" role="region" aria-label="Confirm commission change">
      <h4>Confirm {{ preview.action === 'SET' ? 'merchant override' : 'reset to server default' }}</h4>
      <p>Merchant {{ preview.merchantId }} · {{ rate(preview.beforeRateBps) }} → {{ rate(preview.afterRateBps) }}</p><p>Reason: {{ preview.body.reason }}</p>
      <p>The server will reject a stale revision. Existing order snapshots retain their recorded rates.</p>
      <button type="button" :disabled="busy" @click="submit">Confirm commission change</button><button class="secondary" type="button" :disabled="busy" @click="preview = null">Cancel change</button>
    </aside>
  </section>
</template>

<style scoped>
.commission-override { border-top: 1px solid var(--line, #d7dedb); padding-top: 1rem; margin-top: 1rem; }
.commission-card { border: 1px solid var(--line, #d7dedb); border-radius: .5rem; padding: .75rem; margin: .75rem 0; }
input, textarea { display: block; width: 100%; box-sizing: border-box; } textarea { min-height: 4rem; }
button { margin: .2rem; } li, p, button { overflow-wrap: anywhere; }
</style>
