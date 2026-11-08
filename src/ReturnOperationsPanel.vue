<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { canRecordRefundInstruction, refundInstructionConfirmed, refundInstructionState } from './refundInstructionState'

type Request = <T>(path: string, retryAfterRefresh?: boolean, method?: 'GET' | 'POST', body?: unknown) => Promise<T>
type Action = 'collection' | 'receipt' | 'inspection' | 'refund'
type History = { action: string; actorUserId: string | null; metadata: string | null; createdAt: string }
type ReturnRecord = {
  id: string; orderId: string; customerId: string; status: string; reason: string
  requestedAt: string; requestedRefundCfa: number; relayPointId: string | null; droppedAt: string | null
  receivedBySequoAt: string | null; receivingOperatorId: string | null; conditionAssessment: string | null
  responsibility: string | null; refundAmountCfa: number | null; updatedAt: string
  collectedBySequoAt?: string | null; collectingOperatorId?: string | null; collectionMetadata?: string | null
  inspectionDecision?: 'ACCEPTED' | 'REJECTED' | null; inspectedAt?: string | null; inspectingOperatorId?: string | null
  refundInstruction?: { id: string; amountCfa: number; currency: string; requestedAt: string; requestedByUserId: string | null; status: string; paymentStatus: string } | null
  refundDeadlineState?: string; refundDueAt?: string | null; refundInstructionState?: string | null; history?: History[]
}
type Intent = { returnId: string; action: Action; body: Record<string, string | number>; acknowledged: boolean }
const props = defineProps<{ request: Request; actorId: string }>()
const storageKey = `sequo_return_pending:${props.actorId}`
const statuses = ['Requested', 'AwaitingRelayDropoff', 'DroppedAtRelay', 'CollectedBySequo', 'ReceivedBySequo', 'RefundPending', 'Rejected']
const filter = ref('ALL')
const rows = ref<ReturnRecord[]>([])
const selected = ref<ReturnRecord | null>(null)
const lookupId = ref('')
const collectionNote = ref('')
const conditionAssessment = ref('')
const responsibility = ref('')
const inspectionDecision = ref('')
const inspectionAssessment = ref('')
const inspectionResponsibility = ref('')
const refundAmount = ref('')
const busy = ref(false)
const stale = ref(true)
const error = ref('')
const notice = ref('')
const mayRevise = ref(false)
const pending = ref<Intent | null>(restoreIntent())
let disposed = false
onUnmounted(() => { disposed = true })
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—'
const money = (value: number) => `${value.toLocaleString('en-US')} CFA`
const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/^./, first => first.toUpperCase())
const encoded = encodeURIComponent

function restoreIntent(): Intent | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as Intent | null
    if (value && typeof value.returnId === 'string' && ['collection', 'receipt', 'inspection', 'refund'].includes(value.action) &&
      value.body && typeof value.body.idempotencyKey === 'string') return value
  } catch { /* A corrupt local draft must never become an API action. */ }
  return null
}
function saveIntent(intent: Intent | null) {
  pending.value = intent
  if (intent) sessionStorage.setItem(storageKey, JSON.stringify(intent))
  else sessionStorage.removeItem(storageKey)
}
function applied(record: ReturnRecord, action: Action, body: Intent['body']) {
  if (action === 'collection') return Boolean(record.collectedBySequoAt)
  if (action === 'receipt') return Boolean(record.receivedBySequoAt)
  if (action === 'inspection') return Boolean(record.inspectionDecision)
  return refundInstructionConfirmed(record, body.amountCfa)
}
async function run(operation: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''; mayRevise.value = false
  try { await operation() }
  catch (caught) {
    if (!disposed) {
      stale.value = true
      error.value = `${pending.value?.acknowledged ? 'The action was saved, but readback failed. ' : ''}${caught instanceof Error && caught.message !== 'request_failed' ? caught.message : 'Action was not confirmed.'} Refresh the server state or retry the saved action.`
    }
  } finally { if (!disposed) busy.value = false }
}
async function readback(id = selected.value?.id ?? pending.value?.returnId) {
  const [records, detail] = await Promise.all([
    props.request<ReturnRecord[]>(`/api/returns${filter.value === 'ALL' ? '' : `?status=${encoded(filter.value)}`}`),
    id ? props.request<ReturnRecord>(`/api/returns/${encoded(id)}`) : Promise.resolve(null),
  ])
  if (disposed) return
  if (detail?.id !== selected.value?.id) {
    collectionNote.value = ''; conditionAssessment.value = ''; responsibility.value = ''
    inspectionDecision.value = ''; inspectionAssessment.value = ''; inspectionResponsibility.value = ''
    refundAmount.value = ''
  }
  rows.value = records; selected.value = detail; stale.value = false
  if (detail) {
    lookupId.value = detail.id
    if (pending.value?.returnId === detail.id) {
      if (applied(detail, pending.value.action, pending.value.body)) saveIntent(null)
      else mayRevise.value = true
    }
    if (!pending.value) refundAmount.value = String(detail.refundAmountCfa ?? detail.requestedRefundCfa)
  }
  notice.value = 'Server state refreshed.'
}
function refresh() { void run(() => readback()) }
function open(id: string) { void run(() => readback(id)) }
async function mutate(action: Action, body?: Record<string, string | number>) {
  const detail = selected.value
  if (!pending.value && (!detail || stale.value || !body)) return
  if (!pending.value && action === 'refund' && (!detail || !canRecordRefundInstruction(detail))) return
  const intent = pending.value ?? { returnId: requireId(detail), action, body: Object.freeze({ ...body, idempotencyKey: crypto.randomUUID() }), acknowledged: false }
  saveIntent(intent)
  await run(async () => {
    const suffix = { collection: 'collection', receipt: 'physical-receipt', inspection: 'inspection', refund: 'refund' }[intent.action]
    await props.request(`/api/returns/${encoded(intent.returnId)}/${suffix}`, true, 'POST', intent.body)
    if (disposed) return
    saveIntent({ ...intent, acknowledged: true })
    await readback(intent.returnId)
  })
}
function requireId(record: ReturnRecord | null): string { if (!record) throw new Error('Select a return first.'); return record.id }
function collect() { void mutate('collection', { metadata: collectionNote.value.trim() }) }
function receive() { void mutate('receipt', { conditionAssessment: conditionAssessment.value.trim(), responsibility: responsibility.value }) }
function inspect() { void mutate('inspection', { decision: inspectionDecision.value, conditionAssessment: inspectionAssessment.value.trim(), responsibility: inspectionResponsibility.value }) }
function instructRefund() { void mutate('refund', { amountCfa: Number(refundAmount.value) }) }
function revise() {
  if (!mayRevise.value || stale.value || busy.value) return
  saveIntent(null); mayRevise.value = false; notice.value = 'Review the refreshed return before submitting a revised action.'
}
onMounted(() => { void run(() => readback(pending.value?.returnId)) })
</script>

<template>
  <section class="return-operations" aria-label="Return operations">
    <div class="panel-heading"><h3>Return collection, receipt, inspection and refund instruction</h3><button class="secondary" type="button" :disabled="busy" @click="refresh">Refresh returns</button></div>
    <p>Record collection, physical receipt and an explicit condition decision before instructing a refund. A refund instruction does not confirm a provider payment.</p>
    <p>Processing deadline pending written clarification of the contract’s “3” unit. No automatic deadline is applied.</p>
    <p v-if="busy" role="status">Loading return operation…</p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <aside v-if="pending" class="return-card">
      <strong>Unconfirmed {{ pending.action }} action for {{ pending.returnId }}</strong>
      <p>The saved action and its retry key are retained until server readback. Inputs remain unchanged on retry.</p>
      <button type="button" :disabled="busy" @click="mutate(pending.action)">Retry saved action</button>
      <button v-if="mayRevise" class="secondary" type="button" :disabled="busy || stale" @click="revise">Revise after server refresh</button>
    </aside>
    <label>Return queue<select v-model="filter" :disabled="busy" @change="refresh"><option value="ALL">All returns</option><option v-for="status in statuses" :key="status" :value="status">{{ label(status) }}</option></select></label>
    <form @submit.prevent="open(lookupId.trim())"><label>Return ID<input v-model="lookupId" maxlength="128" required autocomplete="off" :disabled="busy || Boolean(pending)" /></label><button class="secondary" type="submit" :disabled="busy || !lookupId.trim() || Boolean(pending)">Load return</button></form>
    <p v-if="!busy && !rows.length">No returns in this queue.</p>
    <ul><li v-for="row in rows" :key="row.id"><button class="secondary" type="button" :disabled="busy || Boolean(pending && pending.returnId !== row.id)" @click="open(row.id)">{{ row.id }} · Order {{ row.orderId }} · {{ label(row.status) }} · {{ money(row.requestedRefundCfa) }}</button></li></ul>
    <article v-if="selected" class="return-card">
      <h4>{{ selected.id }} · {{ label(selected.status) }}</h4>
      <p>Order {{ selected.orderId }} · {{ selected.reason }}</p>
      <dl>
        <dt>Requested</dt><dd>{{ timestamp(selected.requestedAt) }}</dd>
        <dt>Relay drop-off</dt><dd>{{ selected.relayPointId ?? 'No relay drop-off recorded' }} · {{ timestamp(selected.droppedAt) }}</dd>
        <dt>SEQUO collection</dt><dd>{{ timestamp(selected.collectedBySequoAt) }} · {{ selected.collectingOperatorId ?? 'Actor unavailable' }}<span v-if="selected.collectionMetadata"> · {{ selected.collectionMetadata }}</span></dd>
        <dt>Physical receipt</dt><dd>{{ timestamp(selected.receivedBySequoAt) }} · {{ selected.receivingOperatorId ?? 'Not received' }}</dd>
        <dt>Condition decision</dt><dd>{{ selected.inspectionDecision ? label(selected.inspectionDecision) : 'Inspection pending' }} · {{ timestamp(selected.inspectedAt) }} · {{ selected.inspectingOperatorId ?? 'Not inspected' }} · {{ selected.conditionAssessment ?? 'Not assessed' }} · {{ selected.responsibility ?? 'Responsibility not recorded' }}</dd>
        <dt>Refund instruction</dt>
        <dd v-if="refundInstructionState(selected) === 'REQUESTED' && selected.refundInstruction">{{ label(selected.refundInstruction.status) }} · {{ money(selected.refundInstruction.amountCfa) }} · {{ timestamp(selected.refundInstruction.requestedAt) }} · {{ selected.refundInstruction.requestedByUserId ?? 'Actor unavailable' }} · Provider: {{ label(selected.refundInstruction.paymentStatus) }}</dd>
        <dd v-else-if="refundInstructionState(selected) === 'REQUESTED'">Instruction recorded; audit details unavailable. Refresh before further action. Provider payment unconfirmed.</dd>
        <dd v-else-if="refundInstructionState(selected) === 'LEGACY_REVIEW_REQUIRED'">Legacy refund requires operator review. No new instruction can be recorded. Provider payment unconfirmed.</dd>
        <dd v-else-if="refundInstructionState(selected) === 'NOT_INSTRUCTED'">Not instructed. Provider payment unconfirmed.</dd>
        <dd v-else>Refund instruction state unavailable. Refresh before further action.</dd>
        <dt>Refund deadline</dt><dd>{{ selected.refundDueAt ? timestamp(selected.refundDueAt) : 'Pending written clarification; deadline unconfigured' }}</dd>
      </dl>
      <form v-show="selected.status === 'DroppedAtRelay' && !selected.collectedBySequoAt" @submit.prevent="collect"><label>Collection receipt note<textarea v-model="collectionNote" required maxlength="1000" :disabled="busy || Boolean(pending)" /></label><button type="submit" :disabled="busy || stale || Boolean(pending) || selected.status !== 'DroppedAtRelay' || Boolean(selected.collectedBySequoAt) || !collectionNote.trim()">Record SEQUO collection</button></form>
      <form v-show="selected.status === 'CollectedBySequo'" @submit.prevent="receive">
        <label>Physical receipt note<textarea v-model="conditionAssessment" required maxlength="1000" :disabled="busy || Boolean(pending)" /></label>
        <label>Responsibility<select v-model="responsibility" :disabled="busy || Boolean(pending)"><option value="" disabled>Select responsibility</option><option>Merchant</option><option>Sequo</option><option>Courier</option></select></label>
        <button type="submit" :disabled="busy || stale || Boolean(pending) || selected.status !== 'CollectedBySequo' || !selected.collectedBySequoAt || !conditionAssessment.trim() || !responsibility">Confirm physical receipt</button>
      </form>
      <form v-show="selected.status === 'ReceivedBySequo' && !selected.inspectionDecision" @submit.prevent="inspect">
        <label>Condition inspection decision<select v-model="inspectionDecision" :disabled="busy || Boolean(pending)"><option value="" disabled>Select decision</option><option value="ACCEPTED">Accept return condition</option><option value="REJECTED">Reject return condition</option></select></label>
        <label>Condition inspection assessment<textarea v-model="inspectionAssessment" required maxlength="1000" :disabled="busy || Boolean(pending)" /></label>
        <label>Inspected responsibility<select v-model="inspectionResponsibility" :disabled="busy || Boolean(pending)"><option value="" disabled>Select responsibility</option><option>Merchant</option><option>Sequo</option><option>Courier</option></select></label>
        <button type="submit" :disabled="busy || stale || Boolean(pending) || selected.status !== 'ReceivedBySequo' || Boolean(selected.inspectionDecision) || !inspectionDecision || !inspectionAssessment.trim() || !inspectionResponsibility">Record condition decision</button>
      </form>
      <form v-show="selected.status === 'ReceivedBySequo' && selected.inspectionDecision === 'ACCEPTED' && canRecordRefundInstruction(selected)" @submit.prevent="instructRefund">
        <label>Refund instruction amount (CFA)<input v-model="refundAmount" type="number" required min="1" :max="selected.requestedRefundCfa" step="1" :disabled="busy || Boolean(pending)" /></label>
        <button type="submit" :disabled="busy || stale || Boolean(pending) || !canRecordRefundInstruction(selected) || selected.status !== 'ReceivedBySequo' || !selected.receivedBySequoAt || selected.inspectionDecision !== 'ACCEPTED' || !selected.conditionAssessment || !selected.responsibility || !Number.isSafeInteger(Number(refundAmount)) || Number(refundAmount) <= 0 || Number(refundAmount) > selected.requestedRefundCfa">Record refund instruction</button>
      </form>
      <h4>Server actor history</h4><p v-if="!selected.history?.length">No actor history available for this legacy record.</p>
      <ul><li v-for="(entry, index) in selected.history ?? []" :key="index">{{ label(entry.action) }} · {{ entry.actorUserId ?? 'Actor unavailable' }} · {{ timestamp(entry.createdAt) }} · {{ entry.metadata }}</li></ul>
    </article>
  </section>
</template>

<style scoped>
.return-operations { margin-top: 1rem; }
.return-card { border: 1px solid var(--line, #d7dedb); border-radius: .5rem; padding: .75rem; margin: .75rem 0; }
label { display: block; margin: .75rem 0; }
input, select, textarea { display: block; width: 100%; max-width: 100%; box-sizing: border-box; }
textarea { min-height: 4rem; }
button { margin: .2rem; }
li, dd { overflow-wrap: anywhere; }
dt { font-weight: 600; margin-top: .5rem; }
dd { margin-left: 0; }
</style>
