<script setup lang="ts">
import { referenceText } from "./adminReferences";
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AdminControlRequest } from './adminControls'
import { prepareMerchantStore, readMerchantStore, restoreMerchantStoreIntent, storeDraft, writeMerchantStore, type MerchantStoreState, type StoreDraft, type StoreIntent } from './merchantStore'

const props = defineProps<{ merchantId: string; request: AdminControlRequest; actorId?: string }>()
const emit = defineEmits<{ changed: [] }>()
const current = ref<MerchantStoreState | null>(null)
const draft = ref<StoreDraft | null>(null)
const pending = ref<StoreIntent | null>(null)
const preview = ref<StoreIntent | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const consent = ref(false)
const storageFailed = ref(false)
const locked = computed(() => busy.value || !!pending.value || !!preview.value)
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
let generation = 0
onUnmounted(() => { generation++ })
const storageKey = () => props.actorId ? `sequo_store_pending:${encodeURIComponent(props.actorId)}:${encodeURIComponent(props.merchantId)}` : null
function persist(value: StoreIntent | null) {
  const key = storageKey()
  if (!key) return
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key) }
  catch { storageFailed.value = true }
}
const safeError = (caught: unknown) => caught instanceof Error ? caught.message : 'Store settings could not be confirmed. Refresh before editing.'
function show(value: MerchantStoreState) { current.value = value; draft.value = storeDraft(value) }
async function refresh() {
  if (busy.value || !props.merchantId.trim()) return
  const requestGeneration = generation
  busy.value = true; error.value = ''; notice.value = ''; current.value = null; draft.value = null; preview.value = null
  try {
    const fresh = await readMerchantStore(props.merchantId, props.request)
    if (requestGeneration !== generation) return
    show(fresh)
    if (pending.value && fresh.history.some(c => c.idempotencyKey === pending.value?.body.idempotencyKey)) {
      pending.value = null; persist(null); notice.value = 'Your reviewed change is recorded. Showing the current server settings.'; emit('changed')
    } else notice.value = pending.value ? 'This save remains unconfirmed. Review the server state before retrying the same change or discarding it.' : 'Current server settings loaded.'
  } catch (caught) { if (requestGeneration === generation) error.value = safeError(caught) }
  finally { if (requestGeneration === generation) busy.value = false }
}
function review() {
  if (!current.value || !draft.value || locked.value) return
  error.value = ''; consent.value = false
  try { preview.value = prepareMerchantStore(props.merchantId, current.value, draft.value) }
  catch (caught) { error.value = safeError(caught) }
}
async function save() {
  const intent = pending.value ?? preview.value
  if (!intent || busy.value || (!pending.value && !consent.value)) return
  const requestGeneration = generation
  pending.value = intent; persist(intent); preview.value = null; busy.value = true; error.value = ''; notice.value = ''; current.value = null; draft.value = null
  try {
    const fresh = await writeMerchantStore(intent, props.request, () => {})
    if (requestGeneration !== generation) return
    show(fresh); pending.value = null; persist(null); notice.value = 'Store change confirmed in server history. Showing current settings.'; emit('changed')
  } catch (caught) { if (requestGeneration === generation) error.value = safeError(caught) }
  finally { if (requestGeneration === generation) busy.value = false }
}
function discard() {
  if (busy.value || !current.value || !window.confirm('Discard the saved retry intent after reviewing current server settings? This does not undo any server change.')) return
  pending.value = null; preview.value = null; persist(null); draft.value = storeDraft(current.value)
}
watch(() => [props.merchantId, props.actorId], () => {
  generation++; current.value = null; draft.value = null; pending.value = null; preview.value = null; busy.value = false; error.value = ''; notice.value = ''; storageFailed.value = false
  const key = storageKey()
  if (key) { try { pending.value = restoreMerchantStoreIntent(JSON.parse(sessionStorage.getItem(key) ?? 'null'), props.merchantId) } catch { storageFailed.value = true } }
  void refresh()
}, { immediate: true })
</script>

<template>
  <section class="panel merchant-store-editor" aria-label="Merchant store settings">
    <header class="editor-heading"><div><h3>Store availability and hours</h3><p>Changes apply to new quotes and checkout. Existing orders and payments stay unchanged.</p></div><button type="button" :disabled="busy" @click="refresh">Refresh store</button></header>
    <p v-if="busy" role="status">Reading or saving store settings…</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="storageFailed" class="error-text">The browser could not retain the retry intent. Keep this page open until the save is confirmed.</p>
    <div v-if="current" class="store-readback"><strong>{{ current.openStatus.replaceAll('_', ' ') }}</strong><span>Accepts new orders now: {{ current.canAcceptOrders ? 'Yes' : 'No' }}</span><span>Updated: {{ current.updatedAt }}</span><p v-if="!current.configured">No store policy is configured. Legacy ordering remains available. Saving creates an explicit policy; no hours are assumed.</p></div>
    <form v-if="draft" @submit.prevent="review">
      <fieldset :disabled="locked"><legend>Manual availability</legend>
        <label><input v-model="draft.open" type="checkbox"> Manually open</label><label><input v-model="draft.acceptingOrders" type="checkbox"> Accept new orders when open</label>
        <label>Store timezone
          <select v-model="draft.timezone" required>
            <option value="" disabled>Select timezone</option>
            <option value="Africa/Lome">Africa/Lome (Togo)</option>
            <option value="UTC">UTC</option>
            <option v-if="current?.timezone && !['Africa/Lome','UTC'].includes(current?.timezone ?? '')" :value="current?.timezone ?? ''">{{ current?.timezone }}</option>
          </select>
        </label>
        <label>Closure note<input v-model="draft.closureReason" maxlength="1000" placeholder="Optional customer-facing business note"></label>
      </fieldset>
      <fieldset :disabled="locked"><legend>Weekly schedule</legend><label><input v-model="draft.weeklyEnabled" type="checkbox"> Use weekly hours</label><p>With no weekly schedule, the manual flags control ordering. Open intervals include opening time and exclude closing time. Overnight ranges are unsupported.</p>
        <div v-if="draft.weeklyEnabled" class="weekly-hours"><div v-for="day in draft.openingHours" :key="day.dayOfWeek"><strong>{{ dayNames[day.dayOfWeek - 1] }}</strong><label><input v-model="day.closed" type="checkbox"> Closed</label><label>Opens<input v-model="day.opensAt" type="time" :disabled="day.closed" :required="!day.closed"></label><label>Closes<input v-model="day.closesAt" type="time" :disabled="day.closed" :required="!day.closed"></label></div></div>
      </fieldset>
      <fieldset :disabled="locked"><legend>Dated exceptions</legend>
        <div v-for="(exception,index) in draft.temporaryExceptions" :key="exception.id ?? index" class="exception-row"><label>Date<input v-model="exception.date" type="date" required></label><label><input v-model="exception.closed" type="checkbox"> Closed</label><label>Opens<input v-model="exception.opensAt" type="time" :disabled="exception.closed" :required="!exception.closed"></label><label>Closes<input v-model="exception.closesAt" type="time" :disabled="exception.closed" :required="!exception.closed"></label><label>Reason<input v-model="exception.reason" maxlength="1000"></label><button type="button" @click="draft.temporaryExceptions.splice(index,1)">Remove exception</button></div>
        <button type="button" :disabled="draft.temporaryExceptions.length >= 100" @click="draft.temporaryExceptions.push({id:null,date:'',closed:true,opensAt:null,closesAt:null,reason:null})">Add dated exception</button>
      </fieldset>
      <fieldset :disabled="locked"><legend>Temporary closure interval</legend><label><input v-model="draft.closureEnabled" type="checkbox" @change="draft.temporaryClosure ??= {id:null,startsAt:'',endsAt:'',reason:null}"> Close during an explicit interval</label>
        <template v-if="draft.closureEnabled && draft.temporaryClosure"><label>Starts at (UTC timestamp)<input v-model="draft.temporaryClosure.startsAt" placeholder="2026-11-08T10:00:00Z" required></label><label>Ends at (UTC timestamp)<input v-model="draft.temporaryClosure.endsAt" placeholder="2026-11-08T12:00:00Z" required></label><label>Reason<input v-model="draft.temporaryClosure.reason" maxlength="1000"></label></template>
      </fieldset>
      <label>Reason for this change<textarea v-model="draft.reason" :disabled="locked" maxlength="1000" required /></label><button type="submit" :disabled="locked">Review store change</button>
    </form>
    <section v-if="preview" class="change-preview"><h4>Review new-order policy</h4><p>Merchant {{ referenceText(current, 'merchantId') }} · {{ preview.body.open ? 'Manually open' : 'Paused' }} · {{ preview.body.acceptingOrders ? 'Accept orders within hours' : 'Reject new orders' }} · {{ preview.body.timezone }}</p><p>{{ preview.body.openingHours.length ? 'Weekly hours configured' : 'Manual hours' }}; {{ preview.body.temporaryExceptions.length }} dated exceptions; {{ preview.body.temporaryClosure ? 'temporary closure configured' : 'no timed closure' }}.</p><p>Reason: {{ preview.body.reason }}</p><label><input v-model="consent" type="checkbox"> I reviewed these changes and their effect on new orders.</label><button type="button" :disabled="!consent || busy" @click="save">Confirm store change</button><button type="button" :disabled="busy" @click="preview=null">Continue editing</button></section>
    <section v-if="pending" class="change-preview"><p>A reviewed save is not yet confirmed. Retry preserves the same settings, revision and retry key.</p><button type="button" :disabled="busy" @click="save">Retry reviewed change</button><button type="button" :disabled="busy || !current" @click="discard">Discard retry after refresh</button></section>
    <section v-if="current?.history.length"><h4>Store change history</h4><ul><li v-for="change in current.history" :key="change.id">{{ change.createdAt }} · {{ referenceText(change, 'actorUserId') }} · {{ change.reason }}</li></ul></section>
  </section>
</template>

<style scoped>
.merchant-store-editor { margin-top: 1rem; }.editor-heading { display:flex;justify-content:space-between;gap:1rem;align-items:start; }.store-readback,.merchant-store-editor form { display:grid;gap:.7rem; }.store-readback { margin-block:1rem; }fieldset { border:1px solid var(--border-color,#d3d8df);padding:1rem;display:grid;gap:.7rem; }label { display:grid;gap:.35rem; }label:has(input[type=checkbox]) { display:flex;align-items:center;gap:.5rem; }.weekly-hours>div,.exception-row { display:flex;flex-wrap:wrap;gap:.7rem;align-items:end;padding-block:.5rem; }.change-preview { border:1px solid var(--border-color,#d3d8df);padding:1rem;margin-top:1rem;display:grid;gap:.7rem; }input,select,textarea { max-width:100%; }button { width:fit-content; }
input[type="checkbox"] { width:16px; height:16px; min-height:16px; accent-color:var(--green); flex:0 0 auto; }
</style>
