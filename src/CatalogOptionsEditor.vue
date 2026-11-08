<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AdminControlRequest } from './adminControls'
import { catalogOptionDrafts, catalogOptionsMatch, prepareCatalogOptions, readCatalogOptions, writeCatalogOptions, type CatalogOptionGroup, type CatalogOptionGroupDraft, type CatalogOptionsIntent } from './catalogOptions'

const props = defineProps<{ productId: string; request: AdminControlRequest; actorId?: string }>()
const emit = defineEmits<{ changed: [] }>()
const current = ref<CatalogOptionGroup[] | null>(null)
const groups = ref<CatalogOptionGroupDraft[]>([])
const pending = ref<CatalogOptionsIntent | null>(null)
const preview = ref<CatalogOptionsIntent | null>(null)
const acknowledged = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const locked = computed(() => busy.value || !!preview.value || !!pending.value)
let generation = 0
onUnmounted(() => { generation++ })
const message = (caught: unknown) => caught instanceof Error ? caught.message : 'The option menu could not be confirmed. Refresh before editing.'
const freshOption = () => ({ clientId: crypto.randomUUID(), name: '', priceDeltaCfa: 0, active: true })
function addGroup() {
  if (locked.value || groups.value.length >= 20) return
  groups.value.push({ clientId: crypto.randomUUID(), name: '', minChoices: 0, maxChoices: 1, active: true, options: [freshOption()] })
}
function show(groupsFromServer: CatalogOptionGroup[]) {
  current.value = groupsFromServer
  groups.value = catalogOptionDrafts(groupsFromServer)
}
async function refresh() {
  if (busy.value || !props.productId.trim()) return
  const version = generation
  const productId = props.productId
  busy.value = true; error.value = ''; notice.value = ''; preview.value = null; current.value = null
  try {
    const result = await readCatalogOptions(productId, props.request)
    if (version !== generation) return
    show(result)
    if (pending.value && catalogOptionsMatch(result, pending.value.body)) {
      pending.value = null; acknowledged.value = false; emit('changed')
      notice.value = 'The server confirms the reviewed menu, including its saved option identities.'
    } else notice.value = pending.value ? 'The reviewed menu is not confirmed. Inspect the server state before retrying or discarding the saved intent.' : 'Full server menu loaded, including unavailable groups and options.'
  } catch (caught) { if (version === generation) error.value = message(caught) }
  finally { if (version === generation) busy.value = false }
}
function review() {
  if (locked.value || !current.value) return
  error.value = ''; notice.value = ''
  try { preview.value = prepareCatalogOptions(props.productId, current.value, groups.value) }
  catch (caught) { error.value = message(caught) }
}
async function submit() {
  const intent = pending.value ?? preview.value
  if (!intent || busy.value) return
  const version = generation
  pending.value = intent; preview.value = null; busy.value = true; error.value = ''; notice.value = ''; current.value = null
  try {
    const result = await writeCatalogOptions(intent, props.request, () => { if (version === generation) acknowledged.value = true })
    if (version !== generation) return
    show(result); pending.value = null; acknowledged.value = false; emit('changed')
    notice.value = 'Option menu confirmed by server readback. Saved option identities are retained.'
  } catch (caught) {
    if (version === generation) error.value = `${acknowledged.value ? 'The server acknowledged the save, but readback is not confirmed. ' : ''}${message(caught)} The reviewed request is kept unchanged.`
  } finally { if (version === generation) busy.value = false }
}
function discard() {
  if (!busy.value && current.value) {
    pending.value = null; preview.value = null; acknowledged.value = false; groups.value = catalogOptionDrafts(current.value)
    notice.value = 'Saved local intent discarded after reading the server. Review the loaded menu before making another change.'
  }
}
watch(() => [props.productId, props.actorId], () => {
  generation++; busy.value = false; current.value = null; groups.value = []; pending.value = null; preview.value = null; acknowledged.value = false; error.value = ''; notice.value = ''
  void refresh()
}, { immediate: true })
</script>

<template>
  <section class="panel catalog-options-editor" aria-label="Product options editor">
    <div class="options-heading"><div><h3>Options &amp; supplements</h3><p>Build a clear choice for your customers. Prices are supplements to the product price, in CFA.</p></div><button type="button" class="secondary" :disabled="busy || !!preview" @click="refresh">{{ busy ? 'Reading or saving…' : 'Reload server menu' }}</button></div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <aside v-if="pending" class="options-review" aria-label="Unconfirmed menu change"><h4>Reviewed change awaiting confirmation</h4><p>{{ pending.body.groups.length }} groups · {{ pending.removedGroups }} groups and {{ pending.removedOptions }} options removed.</p><p>Refresh to inspect the server. Retrying keeps the same reviewed menu and checks the current server state first.</p><button type="button" :disabled="busy" @click="submit">Verify / retry reviewed change</button><button type="button" class="secondary" :disabled="busy || !current" @click="discard">Discard saved intent after review</button></aside>
    <form v-if="current && !pending" @submit.prevent="review">
      <p v-if="!groups.length" class="options-empty">This product has no options. Add a group such as “Size” or “Extras”, or leave it as a plain product.</p>
      <article v-for="(group, groupIndex) in groups" :key="group.clientId" class="option-group">
        <div class="options-heading"><h4>Choice group {{ groupIndex + 1 }}</h4><button type="button" class="secondary" :disabled="locked" @click="groups.splice(groupIndex, 1)">Remove group</button></div>
        <div class="action-field-grid"><label>Group name<input v-model="group.name" required maxlength="120" placeholder="Size, sauce, extras…" :disabled="locked" /></label><label>Minimum choices<input v-model="group.minChoices" type="number" min="0" max="50" step="1" required :disabled="locked" /></label><label>Maximum choices<input v-model="group.maxChoices" type="number" min="0" max="50" step="1" required :disabled="locked" /></label><label class="options-toggle"><input v-model="group.active" type="checkbox" :disabled="locked" /> Group available</label></div>
        <p class="options-hint">Minimum 0 makes the group optional. Minimum 1 makes a choice required. Unavailable options remain recorded.</p>
        <div v-for="(option, optionIndex) in group.options" :key="option.clientId" class="option-row action-field-grid"><label>Option name<input v-model="option.name" required maxlength="140" placeholder="Regular, large, extra cheese…" :disabled="locked" /></label><label>Supplement (CFA)<input v-model="option.priceDeltaCfa" type="number" min="0" max="2147483647" step="1" required :disabled="locked" /></label><label class="options-toggle"><input v-model="option.active" type="checkbox" :disabled="locked" /> Available</label><button type="button" class="secondary" :disabled="locked" @click="group.options.splice(optionIndex, 1)">Remove option</button></div>
        <button type="button" class="secondary" :disabled="locked || group.options.length >= 50" @click="group.options.push(freshOption())">+ Add option</button>
      </article>
      <div class="options-actions"><button type="button" class="secondary" :disabled="locked || groups.length >= 20" @click="addGroup">+ Add choice group</button><button type="submit" :disabled="locked">Review menu changes</button></div>
    </form>
    <aside v-if="preview" class="options-review" aria-label="Confirm product options"><h4>Confirm this product’s option menu</h4><p>{{ preview.body.groups.length }} groups · {{ preview.body.groups.reduce((count, group) => count + group.options.length, 0) }} options.</p><p v-if="preview.removedGroups || preview.removedOptions" class="error-text">This removes {{ preview.removedGroups }} groups and {{ preview.removedOptions }} options from future catalog choices.</p><p>Existing order snapshots keep their recorded selections. The server validates eligibility, prices and choices; the saved menu must be read back before confirmation.</p><button type="button" :disabled="busy" @click="submit">Confirm and save menu</button><button type="button" class="secondary" :disabled="busy" @click="preview = null">Keep editing</button></aside>
  </section>
</template>

<style scoped>
.catalog-options-editor { margin-top: 1rem; }
.options-heading, .options-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
.options-heading h3, .options-heading h4 { margin: .2rem 0; }
.option-group, .options-review { border: 1px solid var(--line, #dce5e0); border-radius: 1rem; padding: 1rem; margin: 1rem 0; }
.option-row { border-top: 1px solid var(--line, #dce5e0); padding: .8rem 0; align-items: end; }
label { display: flex; flex-direction: column; gap: .35rem; }
.options-toggle { flex-direction: row; align-items: center; min-height: 2.5rem; }
.options-toggle input { width: auto; }
input { width: 100%; box-sizing: border-box; }
.options-hint, .options-empty { color: var(--muted, #62746d); }
.options-review { background: var(--soft, #f3f7f4); }
p, button { overflow-wrap: anywhere; }
</style>
