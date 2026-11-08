<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import type { AdminControlField, AdminControlRequest } from "./adminControls";
import { adminReferenceKinds, rememberLegacyReference, readAdminReferences, resolveAdminReference, type AdminReference } from "./adminReferences";
import { isValidReference } from "./humanReference";
const props = defineProps<{ modelValue?: unknown; field: AdminControlField; request: AdminControlRequest; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const listId = useId();
const options = ref<AdminReference[]>([]), loading = ref(false), loaded = ref(false), error = ref("");
const input = ref(""), legacy = ref(false), resolving = ref(false), canonicalId = ref("");
const selected = computed(() => options.value.find(option => option.id === props.modelValue));
let skipEmpty = false;
let active = true, generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => { active = false; generation++; clearTimeout(timer); });
async function resolve(value: string, legacyMode: boolean, publish = true) {
  const ticket = ++generation; resolving.value = true; error.value = "";
  try {
    const row = await resolveAdminReference(props.field.name, value, props.request, legacyMode);
    if (!active || ticket !== generation) return;
    canonicalId.value = row.id; input.value = row.publicReference; legacy.value = false;
    if (publish) emit("update:modelValue", row.id);
  } catch (cause) {
    if (active && ticket === generation) { canonicalId.value = ""; error.value = cause instanceof Error ? cause.message : "Could not verify this reference."; if (publish) emit("update:modelValue", ""); }
  } finally { if (active && ticket === generation) resolving.value = false; }
}
function edit(value: string) {
  clearTimeout(timer); generation++; resolving.value = false; input.value = value; canonicalId.value = ""; error.value = "";
  skipEmpty = Boolean(props.modelValue); emit("update:modelValue", "");
  if (!value.trim()) return;
  if (legacy.value) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.trim())) { error.value = "Enter a valid existing legacy ID."; return; }
    canonicalId.value = value.trim(); rememberLegacyReference(props.field.name, canonicalId.value); emit("update:modelValue", canonicalId.value); return;
  }
  if (!isValidReference(value, adminReferenceKinds[props.field.name])) { error.value = "Check the reference: enter the nine letters and numbers shown on the record."; return; }
  timer = setTimeout(() => void resolve(value, legacy.value), 250);
}
watch(() => props.modelValue, value => {
  const id = typeof value === "string" ? value : "";
  if (!id && skipEmpty) { skipEmpty = false; return; }
  if (id === canonicalId.value) return;
  generation++; clearTimeout(timer); canonicalId.value = id;
  if (!id) { input.value = ""; error.value = ""; return; }
  const known = options.value.find(option => option.id === id);
  if (known?.publicReference) { input.value = known.publicReference; return; }
  input.value = "";
  void resolve(id, true, false);
}, { immediate: true });
watch(() => [props.field.name, props.request], (current, previous) => { if (current[0] === previous[0] && current[1] === previous[1]) return; generation++; clearTimeout(timer); resolving.value = false; loading.value = false; emit("update:modelValue", ""); loaded.value = false; options.value = []; input.value = ""; canonicalId.value = ""; error.value = ""; });
async function load() {
  if (loading.value || loaded.value) return;
  const ticket = generation; loading.value = true;
  try { const rows = await readAdminReferences(props.field.name, props.request); if (active && ticket === generation) { options.value = rows; loaded.value = true; } }
  catch { if (active && ticket === generation) error.value = "Could not load choices. Enter a reference or refresh this field."; }
  finally { if (active) loading.value = false; }
}
</script>
<template>
  <span class="reference-input">
    <input :value="input" :disabled="disabled" :list="listId" :required="field.required" :maxlength="legacy ? 128 : 64" :placeholder="legacy ? 'Existing internal ID' : 'XXX-XXX-XXX'" autocomplete="off" :aria-invalid="Boolean(error)" @focus="load" @input="edit(($event.target as HTMLInputElement).value)" />
    <datalist :id="listId"><option v-for="option in options.filter(row => row.publicReference)" :key="option.id" :value="option.publicReference" :label="option.label" /></datalist>
    <small v-if="resolving || loading" role="status">{{ resolving ? 'Verifying reference…' : 'Loading choices…' }}</small><small v-else-if="error" role="status">{{ error }}</small><small v-else-if="selected">{{ selected.label }}</small>
    <label class="legacy-option"><input type="checkbox" :checked="legacy" :disabled="disabled || resolving" @change="legacy = ($event.target as HTMLInputElement).checked; edit('')" />Use an existing legacy ID</label>
  </span>
</template>
<style scoped>
.reference-input { display:grid; gap:5px; min-width:0; }
small,.legacy-option { color:var(--muted); font-weight:400; font-size:12px; }
.legacy-option { display:flex; gap:6px; align-items:center; }
.legacy-option input { width:14px; height:14px; min-height:14px; flex:0 0 auto; }
</style>
