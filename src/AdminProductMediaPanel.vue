<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { AdminControlRequest } from './adminControls.ts'
import { decodeProductMedia, genericUploadIntent, mediaIntent, mediaPath, type ProductMediaState } from './adminProductMedia.ts'

const props = defineProps<{ request: AdminControlRequest; actorId: string; initialProductId?: string }>()
const productId = ref(props.initialProductId ?? '')
const state = shallowRef<ProductMediaState | null>(null)
const busy = ref(false); const error = ref(''); const message = ref(''); const reason = ref('')
const video = ref<HTMLVideoElement | null>(null)
const streaming = ref(false); const cameraStarting = ref(false); let stream: MediaStream | null = null
const capture = shallowRef<{ file: File; capturedAt: string; deviceId: string; url: string } | null>(null)
const genericFile = shallowRef<{ file: File; url: string } | null>(null); const genericApproved = ref(false)
const pending = shallowRef<{ path: string; body: unknown } | null>(null)
let generation = 0
const preview = computed(() => capture.value?.url ?? genericFile.value?.url ?? state.value?.previewDataUrl ?? (state.value?.product.imageUrl === state.value?.approvedGenericImageUrl ? state.value?.approvedGenericImageUrl : null))
function stopCamera() { stream?.getTracks().forEach(track => track.stop()); stream = null; streaming.value = false }
function clearCapture() { if (capture.value) URL.revokeObjectURL(capture.value.url); if (genericFile.value) URL.revokeObjectURL(genericFile.value.url); capture.value = null; genericFile.value = null; genericApproved.value = false }
function reset() { generation++; stopCamera(); clearCapture(); state.value = null; pending.value = null; reason.value = ''; error.value = ''; message.value = ''; busy.value = false }
watch(() => [props.actorId, props.initialProductId], () => { reset(); productId.value = props.initialProductId ?? '' })
watch(productId, () => reset())
onBeforeUnmount(reset)
function fail(value: unknown) { error.value = value instanceof Error ? value.message : 'Product media could not be read. Try again.' }
async function readback(id: string, version: number) {
  const result = await props.request<unknown>(mediaPath(id))
  if (version !== generation) return false
  state.value = decodeProductMedia(result, id)
  return true
}
async function load() {
  if (busy.value) return
  const id = productId.value.trim(); const version = ++generation
  stopCamera(); clearCapture(); state.value = null; error.value = ''; message.value = ''; busy.value = true
  try { await readback(id, version) } catch (e) { if (version === generation) fail(e) }
  finally { if (version === generation) busy.value = false }
}
async function startCamera() {
  if (!state.value || pending.value || busy.value || cameraStarting.value) return
  const version = generation; error.value = ''; stopCamera(); clearCapture()
  if (!navigator.mediaDevices?.getUserMedia) { error.value = 'Live camera capture requires camera access on HTTPS or localhost. Use a supported browser and allow the camera.'; return }
  cameraStarting.value = true
  try {
    const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    if (version !== generation) { camera.getTracks().forEach(track => track.stop()); return }
    stream = camera; streaming.value = true; await nextTick()
    if (video.value) { video.value.srcObject = camera; await video.value.play() }
  } catch { if (version === generation) { stopCamera(); error.value = 'The camera could not start. Allow camera access or use another camera-enabled browser.' } }
  finally { cameraStarting.value = false }
}
async function takePhoto() {
  const source = video.value
  if (!source?.videoWidth || !source.videoHeight) { error.value = 'Wait for a live camera image, then capture again.'; return }
  const version = generation
  const factor = Math.min(1, 1920 / Math.max(source.videoWidth, source.videoHeight))
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.floor(source.videoWidth * factor)); canvas.height = Math.max(1, Math.floor(source.videoHeight * factor))
  const context = canvas.getContext('2d'); if (!context) return
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (version !== generation) return
  stopCamera()
  if (!blob || blob.size > 8 * 1024 * 1024) { error.value = 'The camera image could not be prepared within the 8 MiB limit. Capture again.'; return }
  clearCapture()
  capture.value = { file: new File([blob], 'camera.jpg', { type: 'image/jpeg' }), capturedAt: new Date().toISOString(), deviceId: `admin-camera-${crypto.randomUUID()}`, url: URL.createObjectURL(blob) }
}
function chooseGeneric(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  clearCapture(); error.value = ''
  if (!file) return
  if (file.type !== 'image/jpeg' || !/\.jpe?g$/i.test(file.name) || file.size <= 0 || file.size > 8 * 1024 * 1024) { error.value = 'Choose a JPEG image of at most 8 MiB.'; return }
  genericFile.value = { file, url: URL.createObjectURL(file) }
}
async function submit(intent: { path: string; body: unknown }) {
  const id = state.value?.product.id; if (!id || busy.value) return
  const version = generation; pending.value = intent; error.value = ''; message.value = ''; busy.value = true
  try {
    await props.request(intent.path, true, 'POST', intent.body)
    if (version !== generation) return
    state.value = null
    if (await readback(id, version)) { pending.value = null; clearCapture(); message.value = 'Server state read back. Review the recorded photo and publication status below.' }
  } catch (e) {
    if (version === generation) { state.value = null; fail(e); error.value += ' The change may have reached the server. Retry the identical action or refresh and review; no local success is assumed.' }
  } finally { if (version === generation) busy.value = false }
}
async function act(action: 'generic' | 'generic-file' | 'camera' | 'ACTIVE' | 'INACTIVE') {
  const current = state.value; if (!current || pending.value || busy.value) return
  try {
    const key = crypto.randomUUID()
    let intent: { path: string; body: unknown }
    if (action === 'camera') {
      if (!capture.value) throw new Error('Capture an actual camera photograph first.')
      // Shared validation keeps reason, revision and retry identity identical to other media writes.
      const base = mediaIntent(current, reason.value, key, 'INACTIVE').body
      const body = new FormData()
      for (const [name, value] of Object.entries(base)) if (name !== 'status') body.set(name, value)
      body.set('file', capture.value.file); body.set('capturedAt', capture.value.capturedAt); body.set('deviceId', capture.value.deviceId)
      intent = { path: mediaPath(current.product.id) + '/photos/camera', body }
    } else if (action === 'generic-file') {
      if (!genericFile.value) throw new Error('Choose the standard product image to approve first.')
      intent = genericUploadIntent(current, reason.value, key, genericFile.value.file, genericApproved.value)
    } else intent = mediaIntent(current, reason.value, key, action)
    if (!window.confirm(`${action === 'camera' ? 'Upload this actual camera photograph' : action === 'generic' || action === 'generic-file' ? 'Approve and attach this generic image' : action === 'ACTIVE' ? 'Publish this product' : 'Deactivate this product'} for “${current.product.name}”? The server will record your identity and reason.`)) return
    await submit(intent)
  } catch (e) { fail(e) }
}
async function retry() {
  if (!pending.value || busy.value) return
  // A failed read clears displayed claims, while frozen intent retains its target and bytes.
  const intent = pending.value; const id = productId.value.trim(); const version = generation
  error.value = ''; busy.value = true
  try {
    await props.request(intent.path, true, 'POST', intent.body)
    if (version !== generation) return
    if (await readback(id, version)) { pending.value = null; clearCapture(); message.value = 'Server state read back after retry.' }
  } catch (e) { if (version === generation) { state.value = null; fail(e) } }
  finally { if (version === generation) busy.value = false }
}
async function reviewUncertain() { pending.value = null; await load() }
</script>

<template>
  <section class="media-panel" aria-labelledby="media-panel-heading">
    <header><div><h3 id="media-panel-heading">Product photos and publication</h3><p>Use a live photograph when the product policy requires it, or the SEQUO-approved image for a standard product.</p></div></header>
    <form class="media-load" @submit.prevent="load"><label>Existing product ID<input v-model="productId" :disabled="busy || !!pending" autocomplete="off" /></label><button :disabled="busy || !!pending" type="submit">{{ busy ? 'Reading…' : 'Read product' }}</button></form>
    <p v-if="error" role="alert" class="media-error">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <div v-if="pending" class="media-warning"><p>An action is awaiting verification. The frozen retry keeps the same product, revision, reason, image bytes and retry key. Leaving or reloading this page discards the local retry; inspect server state before starting another action.</p><button :disabled="busy" @click="retry">Retry identical action</button><button :disabled="busy" @click="reviewUncertain">Refresh and review server state</button></div>
    <div v-if="state" class="media-state">
      <div><h4>{{ state.product.name }}</h4><p>{{ state.product.status }} · {{ state.product.kind }} · {{ state.product.photoRequired ? 'Camera photo required' : 'Existing product photo policy' }}</p><p>Recorded capture: {{ state.product.cameraVerified ? 'Uploaded through camera validation' : 'No validated camera upload' }}<span v-if="state.product.capturedAtLabel"> · {{ state.product.capturedAtLabel }}</span></p></div>
      <img v-if="preview" :src="preview" alt="Current or newly captured product photograph" class="media-preview" /><p v-else>No preview is available for this product.</p>
      <div v-if="state.product.kind === 'SellerSpecific'" class="media-camera"><video v-if="streaming" ref="video" autoplay playsinline muted aria-label="Live product camera" /><button :disabled="busy || !!pending || streaming || cameraStarting" @click="startCamera">Start live camera</button><button v-if="streaming" :disabled="busy" @click="takePhoto">Capture photograph</button><button v-if="streaming" @click="stopCamera">Cancel camera</button><p>JPEG only, at most 8 MiB. The server validates and stores the upload.</p></div>
      <div v-else><label>Standard product image (JPEG, up to 8 MiB)<input type="file" accept="image/jpeg,.jpg,.jpeg" :disabled="busy || !!pending" @change="chooseGeneric" /></label><label class="generic-approval"><input v-model="genericApproved" type="checkbox" :disabled="busy || !!pending || !genericFile" />I approve this generic image for this standard product on behalf of SEQUO.</label><p v-if="!state.approvedGenericImageUrl">No preset generic image is configured. You can explicitly approve and upload a standard product image here.</p></div>
      <label>Reason for change<textarea v-model="reason" maxlength="1000" :disabled="busy || !!pending" /></label>
      <div class="media-actions"><button v-if="state.product.kind === 'SellerSpecific'" :disabled="busy || !!pending || !capture || !reason.trim()" @click="act('camera')">Upload captured photo</button><template v-else><button :disabled="busy || !!pending || !genericFile || !genericApproved || !reason.trim()" @click="act('generic-file')">Approve and upload generic image</button><button v-if="state.approvedGenericImageUrl" :disabled="busy || !!pending || !reason.trim()" @click="act('generic')">Use preset approved image</button></template><button :disabled="busy || !!pending || !reason.trim() || state.product.status === 'ACTIVE'" @click="act('ACTIVE')">Publish product</button><button :disabled="busy || !!pending || !reason.trim() || state.product.status !== 'ACTIVE'" @click="act('INACTIVE')">Deactivate product</button></div>
      <details><summary>Recorded media and publication history ({{ state.history.length }})</summary><ul><li v-for="event in state.history" :key="event.id">{{ event.createdAt }} · {{ event.action }} · {{ event.actorUserId }} — {{ event.reason }}</li></ul><p v-if="!state.history.length">No new media audit events. Existing legacy photos are retained.</p></details>
    </div>
  </section>
</template>

<style scoped>
.media-panel { border:1px solid var(--border,#dce5df); border-radius:14px; background:var(--surface,#fff); padding:22px; margin-top:22px; }
h3,h4 { margin:0 0 8px; } p { font-size:13px; line-height:1.5; color:var(--muted,#53665c); }
.media-load,.media-actions { display:flex; flex-wrap:wrap; align-items:end; gap:10px; margin:14px 0; }
label { display:flex; flex-direction:column; gap:6px; font-size:13px; flex:1; } input,textarea { font:inherit; padding:10px; border:1px solid #baccc1; border-radius:7px; } textarea { min-height:65px; }
button { border:1px solid #b6cbbd; border-radius:8px; padding:10px 14px; color:#164d35; background:#f4f8f5; cursor:pointer; } button:disabled { opacity:.5; cursor:default; }
.media-preview,.media-camera video { display:block; max-width:256px; max-height:256px; object-fit:contain; border-radius:8px; margin:12px 0; }
.media-camera button { margin:0 8px 8px 0; } .media-warning { border:1px solid #d6ac49; padding:12px; background:#fffaf0; border-radius:8px; } .media-warning button { margin-right:8px; }
.media-error { color:#9a302e; } details { margin-top:20px; font-size:13px; } li { margin:8px 0; overflow-wrap:anywhere; }
.generic-approval { flex-direction:row; align-items:center; margin:12px 0; } .generic-approval input { width:16px; height:16px; min-height:16px; flex:0 0 auto; }
</style>
