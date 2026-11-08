<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AdminReferenceInput from './AdminReferenceInput.vue'
import type { AdminControlRequest } from './adminControls'
import { enrollmentStorageKey, prepareEnrollment, readEnrollment, restoreEnrollment, submitEnrollment, type EnrollmentIntent, type EnrollmentKind, type EnrollmentSnapshot } from './adminEnrollment'
const props = defineProps<{ kind: EnrollmentKind; request: AdminControlRequest; actorId?: string; initialUserId?: string }>()
const emit = defineEmits<{ changed: [entityId: string] }>()
const userId = ref(''), name = ref(''), workforceType = ref(''), vehicleType = ref(''), reason = ref('')
const snapshot = ref<EnrollmentSnapshot | null>(null), pending = ref<EnrollmentIntent | null>(null), preview = ref<EnrollmentIntent | null>(null)
const loading = ref(false), busy = ref(false), recoveryBlocked = ref(false), error = ref(''), notice = ref('')
let generation = 0
const title = computed(() => props.kind === 'merchant' ? 'Enroll a merchant' : 'Enroll a rider profile')
const locked = computed(() => loading.value || busy.value || recoveryBlocked.value || pending.value !== null)
const userField = { name: 'userId', label: 'Existing account', type: 'string' as const, location: 'body' as const, maxLength: 128, required: true }
function message(value: unknown) { return value instanceof Error ? value.message : 'Could not verify enrollment. Refresh and try again.' }
function storageKey() { if (!props.actorId) throw Error('A verified staff session is required.'); return enrollmentStorageKey(props.actorId, props.kind) }
watch(() => [props.actorId, props.kind, props.initialUserId], () => {
  generation++; userId.value = props.initialUserId ?? ''; snapshot.value = null; pending.value = null; preview.value = null
  name.value = ''; workforceType.value = ''; vehicleType.value = ''; reason.value = ''; error.value = ''; notice.value = ''; loading.value = false; busy.value = false; recoveryBlocked.value = false
  if (!props.actorId) return
  try {
    const saved = sessionStorage.getItem(storageKey())
    if (saved) { pending.value = restoreEnrollment(saved, props.actorId, props.kind); userId.value = pending.value.userId; notice.value = 'A previously submitted enrollment is saved. Refresh server history before reviewing an exact retry.' }
  } catch { recoveryBlocked.value = true; error.value = 'The saved enrollment could not be restored. Investigate its server history before starting another; no write was sent. Sign out to clear invalid saved intents after investigation.' }
}, { immediate: true })
watch(userId, () => { generation++; loading.value = false; snapshot.value = null; preview.value = null; if (!pending.value) notice.value = '' })
onBeforeUnmount(() => { generation++ })
async function load() {
  const current = ++generation; loading.value = true; error.value = ''; snapshot.value = null
  try { const record = await readEnrollment(props.request, userId.value.trim()); if (current === generation) snapshot.value = record }
  catch (failure) { if (current === generation) error.value = message(failure) }
  finally { if (current === generation) loading.value = false }
}
function discardSaved() {
  if (!pending.value || !snapshot.value || snapshot.value.history.some(h => h.idempotencyKey === pending.value?.body.idempotencyKey)) return
  try { sessionStorage.removeItem(storageKey()); pending.value = null; preview.value = null; notice.value = 'The saved intent was discarded after checking current server history. Review a new action only if enrollment is still required.' }
  catch { error.value = 'Could not clear the saved intent. No write was sent.' }
}
function review() {
  error.value = ''; notice.value = ''
  try {
    if (recoveryBlocked.value) throw Error('Investigate the invalid saved enrollment before starting another.')
    if (pending.value) { preview.value = pending.value; return }
    if (!snapshot.value || !props.actorId) throw Error('Load the existing account before reviewing enrollment.')
    preview.value = prepareEnrollment(props.kind, props.actorId, { userId: userId.value.trim(), name: name.value, workforceType: workforceType.value, vehicleType: vehicleType.value, reason: reason.value }, snapshot.value, crypto.randomUUID())
  } catch (failure) { error.value = message(failure) }
}
async function confirm() {
  const intent = preview.value; if (!intent || busy.value) return
  try { sessionStorage.setItem(storageKey(), JSON.stringify(intent)) }
  catch { error.value = 'The exact enrollment could not be saved for safe retry. No write was sent.'; return }
  pending.value = intent; preview.value = null; busy.value = true; error.value = ''; const current = generation
  try {
    const result = await submitEnrollment(props.request, intent)
    if (current !== generation) return
    snapshot.value = result.snapshot; sessionStorage.removeItem(storageKey()); pending.value = null
    notice.value = `Enrollment confirmed by server history: ${result.operation.entityId}. ${props.kind === 'merchant' ? 'The owner must sign in again for its new scope. Configure the store location and operating hours before taking orders.' : 'The recorded workforce and vehicle are ready for the existing assignment policy; this action records no payment.'}`
    emit('changed', result.operation.entityId)
  } catch (failure) { if (current === generation) error.value = message(failure) }
  finally { if (current === generation) busy.value = false }
}
</script>
<template>
  <section class="panel enrollment-panel">
    <div class="panel-heading"><div><h2>{{ title }}</h2><p>Choose an existing {{ kind === 'merchant' ? 'merchant' : 'rider' }} account to register its {{ kind === 'merchant' ? 'store' : 'delivery profile' }}.</p></div></div>
    <p class="subtle">A super administrator can manage account access and roles in Users.</p>
    <form class="enrollment-lookup" @submit.prevent="load">
      <label>Existing account<AdminReferenceInput v-if="!pending" v-model="userId" :field="userField" :request="request" /><input v-else :value="userId" disabled /></label>
      <button class="secondary" type="submit" :disabled="loading || busy || !actorId || !userId.trim()">{{ loading ? 'Loading account…' : 'Refresh account and history' }}</button>
    </form>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-if="notice" class="status-note" role="status">{{ notice }}</p>
    <div v-if="snapshot" class="enrollment-account"><strong>{{ snapshot.user.displayName || snapshot.user.email || snapshot.user.id }}</strong><small>{{ snapshot.user.id }} · {{ snapshot.user.status }} · {{ snapshot.user.roles.join(', ') }}</small><p v-if="kind === 'courier' && snapshot.courier">Existing rider: {{ snapshot.courier.id }}. Use the workforce controls to manage it.</p><p v-if="kind === 'merchant' && snapshot.merchants.length">Existing merchants: {{ snapshot.merchants.map(m => `${m.name} (${m.id})`).join(', ') }}</p></div>
    <form v-if="snapshot || pending" @submit.prevent="review">
      <fieldset class="action-field-grid" :disabled="locked">
        <label v-if="kind === 'merchant'">Merchant name<input v-model="name" required maxlength="160" /></label>
        <template v-else><label>Recorded workforce<select v-model="workforceType" required><option value="" disabled>Choose workforce</option><option value="SequoSalaried">SEQUO salaried</option><option value="Freelancer">Independent rider</option></select></label><label>Vehicle<select v-model="vehicleType" required><option value="" disabled>Choose vehicle</option><option v-for="v in ['Moto','Bicycle','Car','Van']" :key="v" :value="v">{{ v }}</option></select></label></template>
        <label>Enrollment reason<textarea v-model="reason" required maxlength="1000" rows="3" /></label>
      </fieldset>
      <button v-if="!pending" type="submit" class="secondary" :disabled="locked || !actorId">Review enrollment</button>
    </form>
    <div v-if="pending" class="pending-action-tools"><p>Your reviewed details are saved for retry. Refresh to check whether registration completed.</p><button class="secondary" type="button" :disabled="loading || busy" @click="review">Review exact saved enrollment</button><button v-if="snapshot && !snapshot.history.some(h => h.idempotencyKey === pending?.body.idempotencyKey)" class="secondary" type="button" :disabled="loading || busy" @click="discardSaved">Discard saved intent after checking history</button></div>
    <details v-if="snapshot?.history.length"><summary>Enrollment actor history</summary><ul><li v-for="entry in snapshot.history" :key="entry.id">{{ entry.kind }} · {{ entry.entityId }} · {{ entry.actorUserId }} · {{ entry.createdAt }}<p>{{ entry.reason }}</p></li></ul></details>
    <div v-if="preview" class="enrollment-review" role="region" aria-label="Review enrollment"><h3>Confirm {{ kind === 'merchant' ? 'merchant' : 'rider' }} enrollment</h3><dl><dt>Existing account</dt><dd>{{ preview.userId }}</dd><dt v-if="kind === 'merchant'">Merchant name</dt><dd v-if="kind === 'merchant'">{{ preview.body.name }}</dd><template v-else><dt>Workforce and vehicle</dt><dd>{{ preview.body.workforceType }} · {{ preview.body.vehicleType }}</dd></template><dt>Reason</dt><dd>{{ preview.body.reason }}</dd></dl><p>Confirm the selected account and these details before saving.</p><button type="button" class="secondary" :disabled="busy" @click="preview = null">Cancel</button><button type="button" class="secondary" :disabled="busy" @click="confirm">Confirm enrollment</button></div>
  </section>
</template>
<style scoped>
.enrollment-panel{display:grid;gap:16px}.enrollment-lookup{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.enrollment-lookup label{flex:1;min-width:220px}.enrollment-panel label,.enrollment-account{display:grid;gap:6px}.enrollment-account{padding:14px;border:1px solid var(--border);border-radius:12px;overflow-wrap:anywhere}.enrollment-account small{color:var(--muted)}fieldset{border:0;padding:0;margin:0 0 14px;min-width:0}.enrollment-review{padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft)}dd{margin:4px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}.enrollment-review button+button{margin-left:10px}details li{overflow-wrap:anywhere}
</style>
