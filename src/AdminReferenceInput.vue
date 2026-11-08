<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from "vue";
import type { AdminControlField, AdminControlRequest } from "./adminControls";
import { readAdminReferences, type AdminReference } from "./adminReferences";
const props = defineProps<{
  modelValue?: unknown;
  field: AdminControlField;
  request: AdminControlRequest;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const listId = useId();
const options = ref<AdminReference[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref("");
const selected = computed(() =>
  options.value.find((option) => option.id === props.modelValue),
);
let active = true;
onBeforeUnmount(() => {
  active = false;
});
async function load() {
  if (loading.value || loaded.value) return;
  loading.value = true;
  error.value = "";
  try {
    const rows = await readAdminReferences(props.field.name, props.request);
    if (active) {
      options.value = rows;
      loaded.value = true;
    }
  } catch {
    if (active)
      error.value =
        "Could not load choices. Use a known record ID or try this field again.";
  } finally {
    if (active) loading.value = false;
  }
}
</script>
<template>
  <span class="reference-input">
    <input
      :value="String(modelValue ?? '')"
      :disabled="disabled"
      :list="listId"
      :required="field.required"
      :maxlength="field.maxLength"
      :placeholder="field.placeholder || 'Choose a record or paste its ID'"
      autocomplete="off"
      @focus="load"
      @input="
        emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
    />
    <datalist :id="listId">
      <option
        v-for="option in options"
        :key="option.id"
        :value="option.id"
        :label="option.label"
      />
    </datalist>
    <small v-if="loading" role="status">Loading choices…</small
    ><small v-else-if="error" role="status">{{ error }}</small
    ><small v-else-if="selected">{{ selected.label }}</small>
  </span>
</template>
<style scoped>
.reference-input {
  display: grid;
  gap: 5px;
  min-width: 0;
}
small {
  color: var(--muted);
  font-weight: 400;
  font-size: 12px;
}
</style>
