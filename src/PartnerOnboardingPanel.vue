<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { AdminControlRequest } from './adminControls'
import { blankPartnerDraft, draftFromDetails, partnerDetails, preparePartnerIntent, restorePartnerIntent, sendPartnerIntent, type PartnerKind, type PartnerApplication, type PartnerOperation, type PartnerPreview, type PartnerIntent } from './partnerOnboarding'
const props = defineProps<{ kind: PartnerKind; request: AdminControlRequest; actorId: string }>()
const emit = defineEmits<{ changed: []; manage: [operation: PartnerOperation] }>()
const label = computed(() => ({VENDOR:'vendor',RIDER:'rider',HUB:'hub'}[props.kind]))
const draft = reactive(blankPartnerDraft()), mode = ref<'DIRECT'|'APPLICATIONS'>('DIRECT'), state = ref('PENDING'), rows = ref<PartnerApplication[]>([]), selected = ref<PartnerApplication|null>(null)
const reason = ref(''), workforce = ref('Freelancer'), preview = ref<PartnerPreview|null>(null), reviewed = ref<PartnerIntent|null>(null), pending = ref<PartnerIntent|null>(null), result = ref<PartnerOperation|null>(null)
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), absent = ref(false)
let generation = 0
const storageKey = computed(() => `sequo_partner_pending:${props.actorId}:${props.kind}`)
const locked = computed(() => busy.value || pending.value !== null || reviewed.value !== null)
onBeforeUnmount(() => { generation++ })
function message(e: unknown) { return e instanceof Error ? e.message : 'The partner action could not be confirmed.' }
watch(() => [props.kind,props.actorId], () => {
  generation++; Object.assign(draft,blankPartnerDraft()); selected.value=null; preview.value=null; pending.value=null; reviewed.value=null; result.value=null; error.value=''; notice.value=''; loading.value=false; busy.value=false
  try { const saved=sessionStorage.getItem(storageKey.value); if(saved) { pending.value=restorePartnerIntent(saved,props.actorId,props.kind); notice.value='A reviewed action is saved. Check its result or retry the same details.' } } catch(e) { error.value=message(e) }
  void loadQueue()
}, { immediate:true })
async function loadQueue() {
  const current=generation; loading.value=true
  try { const data=await props.request<PartnerApplication[]>(`/api/admin/web/partner-applications?kind=${props.kind}&state=${state.value}`); if(current===generation) rows.value=data }
  catch(e) { if(current===generation) error.value=message(e) } finally { if(current===generation) loading.value=false }
}
function addDirect() { if(locked.value)return; mode.value='DIRECT'; selected.value=null; preview.value=null; result.value=null; reason.value=''; Object.assign(draft,blankPartnerDraft()) }
function reviewApplication(row: PartnerApplication) { if(locked.value)return; mode.value='APPLICATIONS'; selected.value=row; preview.value=null; result.value=row.operation; reason.value=''; workforce.value='Freelancer'; Object.assign(draft,draftFromDetails(row.details)) }
async function review() {
  if(locked.value)return; error.value=''; notice.value=''; const current=generation; busy.value=true
  try {
    const details=partnerDetails(props.kind,draft)
    if(!reason.value.trim()) throw Error('Add the reason for this registration or approval.')
    const data=await props.request<PartnerPreview>('/api/admin/web/onboarding/preview',true,'POST',{kind:props.kind,details})
    if(current!==generation)return
    preview.value=data; reviewed.value=preparePartnerIntent(props.actorId,props.kind,data,reason.value,crypto.randomUUID(),workforce.value,selected.value)
  } catch(e) { if(current===generation)error.value=message(e) } finally { if(current===generation)busy.value=false }
}
function reviewReject() {
  if(locked.value||!selected.value||selected.value.state!=='PENDING')return
  if(!reason.value.trim()) { error.value='Give the reason for declining this application.'; return }
  reviewed.value={actorId:props.actorId,kind:props.kind,action:'REJECT',applicationId:selected.value.id,body:{reason:reason.value.trim(),idempotencyKey:crypto.randomUUID(),expectedApplicationUpdatedAt:selected.value.updatedAt}}
}
async function confirm() {
  const intent=pending.value??reviewed.value; if(!intent||busy.value)return
  try { sessionStorage.setItem(storageKey.value,JSON.stringify(intent)) } catch { error.value='The reviewed action could not be saved for retry. No request was sent.'; return }
  pending.value=intent; reviewed.value=null; busy.value=true; error.value=''; const current=generation
  try {
    const operation=await sendPartnerIntent(props.request,intent); if(current!==generation)return
    result.value=operation; sessionStorage.removeItem(storageKey.value); pending.value=null; selected.value=null; preview.value=null; reason.value=''; Object.assign(draft,blankPartnerDraft())
    notice.value=operation.action==='REJECT'?'Application declined and review history saved.':`${label.value[0]!.toUpperCase()+label.value.slice(1)} registered. The person signs in through their own app to obtain the approved access.`
    emit('changed'); await loadQueue()
  } catch(e) { if(current===generation)error.value=`${message(e)} The exact reviewed action is retained for recovery.` } finally { if(current===generation)busy.value=false }
}
async function checkPending() {
  if(!pending.value||busy.value)return; const current=generation; busy.value=true; error.value=''
  try {
    const data=await props.request<{operation:PartnerOperation|null}>(`/api/admin/web/onboarding/operations/${encodeURIComponent(pending.value.body.idempotencyKey)}`)
    if(current!==generation)return
    if(data.operation) {
      if(data.operation.actorUserId!==props.actorId||data.operation.kind!==props.kind)throw Error('This operation belongs to another review.')
      result.value=data.operation; sessionStorage.removeItem(storageKey.value); pending.value=null; notice.value='The saved action is confirmed in server history.'; emit('changed'); await loadQueue()
    } else { absent.value=true; notice.value='No committed operation was found. Retry the same action, or refresh the application/account before editing.' }
  } catch(e) { error.value=message(e) } finally { busy.value=false }
}
function editUnrecorded() { if(!absent.value||busy.value)return; sessionStorage.removeItem(storageKey.value); pending.value=null; reviewed.value=null; preview.value=null; absent.value=false }
</script>
<template>
<section class="panel partner-onboarding" :aria-label="`${label} onboarding`">
  <div class="panel-heading"><div><h2>Add a {{ label }}</h2><p>Contact details and {{ kind==='VENDOR'?'shop':kind==='RIDER'?'delivery':'relay' }} profile, together. Existing accounts are matched automatically.</p></div><div class="partner-modes"><button class="secondary" :disabled="locked" @click="addDirect">Add directly</button><button class="secondary" :disabled="locked" @click="mode='APPLICATIONS'; loadQueue()">Applications <span>{{ rows.length }}</span></button></div></div>
  <p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-if="notice" class="status-note" role="status">{{ notice }}</p>
  <div v-if="result" class="partner-result" role="status"><strong>{{ result.action==='REJECT'?'Review saved':`${label} profile ready` }}</strong><p>{{ result.entityReference || result.applicationId }}<span v-if="result.userReference"> · Account {{ result.userReference }}</span></p><p>{{result.details.displayName}} · {{result.details.email || result.details.phoneNumber}}<span v-if="result.details.businessName"> · {{result.details.businessName}}</span></p><p v-if="result.details.vehicleType">Vehicle: {{result.details.vehicleType}}</p><p>Recorded by {{result.actorReference || 'Applicant'}} · {{new Date(result.createdAt).toLocaleString()}}<br />{{result.reason}}</p><button v-if="result.entityId" class="secondary" @click="emit('manage',result)">Open {{ label }} settings</button></div>
  <div v-if="mode==='APPLICATIONS' && !pending" class="partner-queue"><div class="partner-queue-tools"><h3>Partner applications</h3><label>Status<select v-model="state" :disabled="locked" @change="loadQueue"><option value="PENDING">Waiting for review</option><option value="APPROVED">Approved</option><option value="REJECTED">Declined</option></select></label><button class="secondary" :disabled="loading||locked" @click="loadQueue">Refresh applications</button></div><p v-if="loading">Loading applications…</p><p v-else-if="!rows.length" class="subtle">No {{ state==='PENDING'?'pending':state.toLowerCase() }} {{ label }} applications yet. Applicants can submit their own details on the public website.</p><ul v-else class="partner-application-list"><li v-for="row in rows" :key="row.id"><div><strong>{{ row.details.businessName || row.details.displayName }}</strong><p>{{ row.details.displayName }} · {{ row.details.phoneNumber || row.details.email }} · {{ row.details.city }}, {{ row.details.neighborhood }}</p><small>{{ new Date(row.submittedAt).toLocaleString() }} · {{ row.state }}</small></div><button class="secondary" :disabled="locked" @click="reviewApplication(row)">{{ row.state==='PENDING'?'Review application':'View review' }}</button></li></ul></div>
  <details v-if="selected"><summary>Original applicant details · {{ selected.id }}</summary><dl class="partner-summary"><template v-for="(value,key) in selected.details" :key="key"><dt>{{ key }}</dt><dd>{{ value || '—' }}</dd></template></dl><p v-if="selected.reviewReason">Review: {{ selected.reviewReason }}</p></details>
  <details v-if="selected?.history?.length"><summary>Application actor history</summary><ul><li v-for="entry in selected.history" :key="entry.id">{{entry.action}} · {{entry.actorReference || 'Applicant submission'}} · {{new Date(entry.createdAt).toLocaleString()}}<p>{{entry.reason}}</p></li></ul></details>
  <form v-if="!pending && (mode==='DIRECT'||selected?.state==='PENDING')" @submit.prevent="review">
    <fieldset :disabled="locked"><div class="action-field-grid"><label>Person’s full name<input v-model="draft.displayName" required maxlength="160" autocomplete="name" /></label><label>Email<input v-model="draft.email" type="email" maxlength="254" autocomplete="email" /></label><label>Phone with country code<input v-model="draft.phoneNumber" type="tel" maxlength="32" placeholder="+228…" autocomplete="tel" /></label><label v-if="kind!=='RIDER'">{{ kind==='VENDOR'?'Shop':'Hub' }} name<input v-model="draft.businessName" required :maxlength="kind==='HUB'?120:160" /></label><label>City<input v-model="draft.city" required maxlength="128" /></label><label>Neighborhood<input v-model="draft.neighborhood" required maxlength="128" /></label><label>Address / directions<textarea v-model="draft.landmark" maxlength="500" rows="2" /></label><template v-if="kind==='RIDER'"><label>Vehicle<select v-model="draft.vehicleType" required><option value="" disabled>Choose vehicle</option><option v-for="vehicle in ['Moto','Bicycle','Car','Van']" :key="vehicle">{{ vehicle }}</option></select></label><label>Recorded workforce<select v-model="workforce"><option value="Freelancer">Independent rider</option><option value="SequoSalaried">SEQUO salaried · confirmed contract</option></select></label></template><template v-else><label>Latitude{{kind==='HUB'?' *':' (optional)'}}<input v-model="draft.latitude" type="number" step="any" min="-90" max="90" :required="kind==='HUB'" /></label><label>Longitude{{kind==='HUB'?' *':' (optional)'}}<input v-model="draft.longitude" type="number" step="any" min="-180" max="180" :required="kind==='HUB'" /></label></template><label>Reason for {{ selected?'approval':'registration' }}<textarea v-model="reason" required maxlength="1000" rows="2" /></label></div></fieldset>
    <div class="partner-actions"><button type="submit" :disabled="locked">{{ busy?'Checking…':selected?'Review approval':`Review new ${label}` }}</button><button v-if="selected" type="button" class="secondary" :disabled="locked" @click="reviewReject">Decline application</button></div>
  </form>
  <div v-if="reviewed" class="partner-review" role="region" aria-label="Confirm partner review"><h3>{{ reviewed.action==='REJECT'?'Decline this application?':`Confirm ${label} ${selected?'approval':'registration'}` }}</h3><template v-if="reviewed.action!=='REJECT'"><p v-if="preview?.existingAccount"><strong>Existing account matched:</strong> {{ preview.existingAccount.displayName || preview.existingAccount.email || preview.existingAccount.phoneNumber }} · {{ preview.existingAccount.publicReference }}. Its current identity details are retained.</p><p v-else>A new account will be created with the reviewed contact details.</p><p>{{ reviewed.body.details?.displayName }} · {{ reviewed.body.details?.email || 'No email' }} · {{ reviewed.body.details?.phoneNumber || 'No phone' }}</p><p>{{ reviewed.body.details?.businessName }} · {{ reviewed.body.details?.city }}, {{ reviewed.body.details?.neighborhood }}<span v-if="kind==='RIDER'"> · {{ reviewed.body.details?.vehicleType }} · {{ reviewed.body.workforceType }}</span></p></template><p>{{ reviewed.body.reason }}</p><p v-if="reviewed.action!=='REJECT'">The account, approved role and {{ label }} profile are saved together with the review history.</p><p v-else>The decline reason is recorded without creating partner access.</p><div class="partner-actions"><button class="secondary" :disabled="busy" @click="reviewed=null;preview=null">Back to details</button><button :disabled="busy" @click="confirm">{{ reviewed.action==='REJECT'?'Confirm decline':'Confirm and register' }}</button></div></div>
  <div v-if="pending" class="partner-review"><h3>Saved action awaiting confirmation</h3><p>{{pending.body.details?.displayName}} · {{pending.body.details?.email || pending.body.details?.phoneNumber}}<span v-if="pending.body.details?.businessName"> · {{pending.body.details.businessName}}</span></p><p>{{pending.body.reason}}</p><p>Check server history before changing these reviewed details.</p><div class="partner-actions"><button class="secondary" :disabled="busy" @click="checkPending">Check saved result</button><button :disabled="busy" @click="confirm">Retry exact action</button><button v-if="absent" class="secondary" :disabled="busy" @click="editUnrecorded">Return to details after checking</button></div></div>
</section>
</template>
<style scoped>
.partner-onboarding{display:grid;gap:18px}.partner-modes,.partner-actions,.partner-queue-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.partner-modes span{margin-left:7px}.partner-onboarding fieldset{border:0;padding:0;min-width:0}.partner-onboarding label{display:grid;gap:6px}.partner-onboarding form{display:grid;gap:16px}.partner-review,.partner-result{padding:20px;border:1px solid var(--border);border-radius:14px;background:var(--surface-soft);overflow-wrap:anywhere}.partner-summary{display:grid;grid-template-columns:150px 1fr;gap:8px}.partner-summary dd{margin:0;overflow-wrap:anywhere}.partner-application-list{list-style:none;padding:0;display:grid;gap:12px}.partner-application-list li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;border:1px solid var(--border);border-radius:12px}.partner-application-list p{margin:6px 0}.partner-application-list small{color:var(--muted)}@media(max-width:700px){.partner-application-list li{display:grid}.partner-summary{grid-template-columns:1fr}.partner-summary dd{margin-bottom:10px}}
</style>
