<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import AdminIcon from "./AdminIcon.vue";
import AdminReferenceInput from "./AdminReferenceInput.vue";
import { hasAdminReference } from "./adminReferences";
import CatalogOptionsEditor from "./CatalogOptionsEditor.vue";
import MerchantStoreEditor from "./MerchantStoreEditor.vue";
import {
  adminControlCatalog,
  readAdminControl,
  runAdminControlAction,
  buildAdminControlRequest,
  type AdminControlDescriptor,
  type AdminControlField,
  type AdminControlAction,
  type AdminControlRequest,
  type AdminControlValues,
} from "./adminControls";

const props = defineProps<{
  category: string;
  request: AdminControlRequest;
  actorId: string;
  roles: readonly string[];
  refreshKey?: number;
}>();
const emit = defineEmits<{ changed: [] }>();
const services = computed(() =>
  adminControlCatalog.filter((item) => item.group === props.category),
);
const selectedId = ref("");
const selected = computed(
  () =>
    services.value.find((item) => item.id === selectedId.value) ??
    services.value[0],
);
const readValues = reactive<AdminControlValues>({});
const actionValues = reactive<AdminControlValues>({});
const records = ref<Record<string, unknown>[]>([]);
const selectedRecord = ref<Record<string, unknown> | null>(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const search = ref("");
const actionId = ref("");
const confirmationOpen = ref(false);
const reviewedValues = ref<AdminControlValues | null>(null);
const confirmationDialog = ref<HTMLElement | null>(null);
let confirmationTrigger: HTMLElement | null = null;
const result = ref<unknown>(null);
const uncertain = ref(false);
const completed = ref(false);
type PendingIntent = {
  actorId: string;
  controlId: string;
  actionId: string;
  values: AdminControlValues;
  acknowledged: boolean;
};
const pending = ref<PendingIntent | null>(null);
const loadedProductId = ref("");
const loadedMerchantId = ref("");
const lastReadAt = ref("");
let generation = 0;
const action = computed(() =>
  selected.value?.actions.find((item) => item.id === actionId.value),
);
const relatedControls = computed(() => {
  if (!selectedRecord.value) return [];
  const row = selectedRecord.value;
  const links: Record<string, { id: string; key: string; label: string }[]> = {
    users: [
      {
        id: "user-access-management",
        key: "userId",
        label: "Account access and roles",
      },
    ],
    merchants: [
      {
        id: "merchant-store-settings",
        key: "merchantId",
        label: "Store settings",
      },
    ],
    "catalog-products": [
      {
        id: "catalog-customizations",
        key: "productId",
        label: "Food options and supplements",
      },
    ],
    couriers: [
      { id: "courier-detail", key: "courierId", label: "Rider history" },
    ],
    "relay-site-management": [
      {
        id: "relay-site-detail",
        key: "relayPointId",
        label: "Assignment history",
      },
      {
        id: "relay-logical-slots",
        key: "relayPointId",
        label: "Storage slots",
      },
    ],
    "merchant-orders": [
      {
        id: "merchant-order-detail",
        key: "subOrderId",
        label: "Preparation detail",
      },
    ],
    "relay-parcels": [
      { id: "relay-parcel-detail", key: "parcelId", label: "Parcel history" },
    ],
    returns: [
      { id: "return-detail", key: "returnId", label: "Return custody history" },
    ],
  };
  return (links[selected.value?.id ?? ""] ?? [])
    .filter((link) =>
      services.value.some(
        (service) => service.id === link.id && service.supported,
      ),
    )
    .map((link) => ({
      ...link,
      values: { [link.key]: readAt(row, selected.value!.read!.rowId) },
    }));
});
const visibleRecords = computed(() => {
  const query = search.value.trim().toLowerCase();
  return query
    ? records.value.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(query),
      )
    : records.value;
});

function readAt(row: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value &&
        typeof value === "object" &&
        !["__proto__", "prototype", "constructor"].includes(key)
          ? (value as Record<string, unknown>)[key]
          : undefined,
      row,
    );
}
function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(text).join(", ");
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${human(key)}: ${text(item)}`)
      .join(" · ");
  return String(value);
}
function human(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}
function format(value: unknown, kind?: string): string {
  if (value === null || value === undefined) return "—";
  if (kind === "money" && typeof value === "number")
    return `${value.toLocaleString()} CFA`;
  if (kind === "date" && typeof value === "string")
    return Number.isNaN(Date.parse(value))
      ? value
      : new Date(value).toLocaleString();
  if (kind === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (
      value.every((item) =>
        ["string", "number", "boolean"].includes(typeof item),
      ) &&
      value.join(", ").length <= 80
    )
      return value.join(", ") || "None";
    return `${value.length} ${value.length === 1 ? "entry" : "entries"}`;
  }
  if (typeof value === "object") return `${Object.keys(value).length} fields`;
  return text(value);
}
function reset(
  values: AdminControlValues,
  fields: readonly AdminControlField[] = [],
  row?: Record<string, unknown> | null,
) {
  Object.keys(values).forEach((key) => delete values[key]);
  fields.forEach((field) => {
    const existing =
      row && field.valueFrom ? readAt(row, field.valueFrom) : undefined;
    if (existing !== undefined && existing !== null)
      values[field.name] = existing;
    else if (field.defaultValue !== undefined)
      values[field.name] = field.defaultValue;
    else if (field.name === "idempotencyKey")
      values[field.name] = crypto.randomUUID();
  });
}
function canAct(item: AdminControlAction): boolean {
  return (
    item.supported &&
    (!(item as AdminControlAction & { allowedRoles?: readonly string[] })
      .allowedRoles?.length ||
      (
        item as AdminControlAction & { allowedRoles?: readonly string[] }
      ).allowedRoles!.some((role) => props.roles.includes(role)))
  );
}
function chooseRecord(row: Record<string, unknown>) {
  selectedRecord.value = row;
  if (pending.value) return;
  result.value = null;
  if (action.value) reset(actionValues, action.value.fields, row);
}
function chooseAction(id: string) {
  if (pending.value) {
    error.value = "Review the pending action before starting another one.";
    return;
  }
  actionId.value = id;
  confirmationOpen.value = false;
  result.value = null;
  notice.value = "";
  error.value = "";
  completed.value = false;
  reset(actionValues, action.value?.fields, selectedRecord.value);
}
async function refresh() {
  const service = selected.value;
  if (!service?.supported || !service.read || loading.value || busy.value)
    return;
  const requestGeneration = generation;
  const parameters = structuredClone({ ...readValues });
  try {
    buildAdminControlRequest(service.id, null, readValues);
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : "Choose a record to continue.";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const response = await readAdminControl(
      service.id,
      parameters,
      props.request,
    );
    if (requestGeneration !== generation) return;
    if (JSON.stringify(parameters) !== JSON.stringify({ ...readValues }))
      return;
    records.value = response.rows;
    const oldId =
      selectedRecord.value &&
      text(readAt(selectedRecord.value, service.read.rowId));
    selectedRecord.value = oldId
      ? (response.rows.find(
          (row) => text(readAt(row, service.read!.rowId)) === oldId,
        ) ?? null)
      : service.read.shape === "record"
        ? (response.rows[0] ?? null)
        : null;
    lastReadAt.value = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    loadedProductId.value =
      typeof parameters.productId === "string" ? parameters.productId : "";
    loadedMerchantId.value =
      typeof parameters.merchantId === "string" ? parameters.merchantId : "";
    if (!pending.value) uncertain.value = false;
  } catch (failure) {
    if (requestGeneration !== generation) return;
    records.value = [];
    selectedRecord.value = null;
    loadedProductId.value = "";
    loadedMerchantId.value = "";
    error.value =
      failure instanceof Error
        ? failure.message
        : "Could not load these records. Try again.";
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
function prepareAction() {
  if (
    !selected.value ||
    !action.value ||
    !canAct(action.value) ||
    busy.value ||
    uncertain.value
  )
    return;
  try {
    const values = structuredClone({ ...readValues, ...actionValues });
    buildAdminControlRequest(selected.value.id, action.value.id, values);
    reviewedValues.value = values;
    error.value = "";
    confirmationOpen.value = true;
  } catch (failure) {
    error.value =
      action.value.fields.some((field) => field.name === "expectedUpdatedAt") &&
      !actionValues.expectedUpdatedAt
        ? "Select the current record above before reviewing this action."
        : failure instanceof Error
          ? failure.message
          : "Check the highlighted details.";
  }
}
function storageKey(controlId = selected.value?.id) {
  return `sequo_admin_control_pending:${props.actorId}:${controlId}`;
}
function clearPending() {
  if (selected.value) sessionStorage.removeItem(storageKey());
  pending.value = null;
}
function resolveAfterReview() {
  if (!pending.value || busy.value) return;
  if (
    !window.confirm(
      "Have you checked the current server records for this action? Resolving this review will not repeat the request.",
    )
  )
    return;
  clearPending();
  uncertain.value = false;
  completed.value = false;
  chooseAction(actionId.value);
}
function reviewRetry() {
  if (
    !pending.value ||
    !action.value?.fields.some((field) => field.name === "idempotencyKey") ||
    busy.value
  )
    return;
  reviewedValues.value = structuredClone({ ...pending.value.values });
  confirmationOpen.value = true;
}
async function confirmAction() {
  if (
    !selected.value ||
    !action.value ||
    busy.value ||
    !canAct(action.value) ||
    (!pending.value && !reviewedValues.value)
  )
    return;
  const requestGeneration = generation;
  busy.value = true;
  confirmationOpen.value = false;
  error.value = "";
  notice.value = "";
  const values = pending.value?.values ?? reviewedValues.value!;
  try {
    if (!pending.value)
      pending.value = {
        actorId: props.actorId,
        controlId: selected.value.id,
        actionId: action.value.id,
        values,
        acknowledged: false,
      };
    sessionStorage.setItem(storageKey(), JSON.stringify(pending.value));
    const response = await runAdminControlAction(
      selected.value.id,
      action.value.id,
      values,
      props.request,
    );
    if (requestGeneration !== generation) return;
    result.value = response.response;
    if (response.readbackError) {
      pending.value.acknowledged = true;
      sessionStorage.setItem(storageKey(), JSON.stringify(pending.value));
      notice.value = response.readbackError;
      uncertain.value = true;
    } else {
      clearPending();
      completed.value = true;
      notice.value = response.readback
        ? "Action confirmed and current server records refreshed."
        : "The server acknowledged the action. Review the recorded result below.";
      if (response.readback?.controlId === selected.value.id) {
        records.value = response.readback.rows;
        const id =
          selectedRecord.value &&
          selected.value.read &&
          text(readAt(selectedRecord.value, selected.value.read.rowId));
        if (id && selected.value.read)
          selectedRecord.value =
            records.value.find(
              (row) => text(readAt(row, selected.value!.read!.rowId)) === id,
            ) ?? null;
      }
      emit("changed");
    }
  } catch (failure) {
    if (requestGeneration !== generation) return;
    uncertain.value = true;
    error.value = `${failure instanceof Error ? failure.message : "The request was not confirmed."} Refresh and inspect the record before trying again.`;
  } finally {
    if (requestGeneration === generation) busy.value = false;
  }
}
function activateService(service?: AdminControlDescriptor) {
  generation++;
  loading.value = false;
  busy.value = false;
  records.value = [];
  selectedRecord.value = null;
  search.value = "";
  error.value = "";
  notice.value = "";
  result.value = null;
  actionId.value = "";
  uncertain.value = false;
  confirmationOpen.value = false;
  completed.value = false;
  pending.value = null;
  loadedProductId.value = "";
  loadedMerchantId.value = "";
  reset(readValues, service?.read?.fields);
  reset(actionValues);
  if (service) {
    try {
      const stored = JSON.parse(
        sessionStorage.getItem(storageKey(service.id)) ?? "null",
      ) as PendingIntent | null;
      if (
        stored &&
        stored.actorId === props.actorId &&
        stored.controlId === service.id &&
        service.actions.some((item) => item.id === stored.actionId) &&
        stored.values &&
        typeof stored.values === "object" &&
        !Array.isArray(stored.values)
      ) {
        pending.value = stored;
        actionId.value = stored.actionId;
        Object.assign(actionValues, stored.values);
        uncertain.value = true;
        for (const field of service.read?.fields ?? [])
          if (stored.values[field.name] !== undefined)
            readValues[field.name] = stored.values[field.name];
        notice.value =
          "A previously submitted action needs review. Its original request has been preserved; inspect the server records before continuing.";
      }
    } catch {
      error.value =
        "Could not read the previous action review. Inspect the server records before repeating an action.";
      uncertain.value = true;
    }
  }
  if (
    service?.supported &&
    service.read &&
    !(service.read.fields ?? []).some(
      (field) => field.required && readValues[field.name] === undefined,
    )
  )
    void refresh();
}
watch(confirmationOpen, async (open) => {
  if (open) {
    confirmationTrigger = document.activeElement as HTMLElement;
    await nextTick();
    confirmationDialog.value?.querySelector<HTMLElement>("button")?.focus();
  } else if (confirmationTrigger?.isConnected) confirmationTrigger.focus();
});
function trapConfirmationFocus(event: KeyboardEvent) {
  if (event.key !== "Tab" || !confirmationDialog.value) return;
  const items = [
    ...confirmationDialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    ),
  ];
  const first = items[0],
    last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
async function openControl(controlId: string, values: AdminControlValues) {
  if (!services.value.some((service) => service.id === controlId) || busy.value)
    return;
  selectedId.value = controlId;
  await nextTick();
  Object.assign(readValues, values);
  await refresh();
}
async function openAction(
  controlId: string,
  nextActionId: string,
  values: AdminControlValues,
) {
  await openControl(controlId, {});
  if (pending.value || busy.value) {
    error.value = "Review the pending action before starting another one.";
    return;
  }
  chooseAction(nextActionId);
  Object.assign(actionValues, values);
}
watch(
  () => selected.value?.id,
  () => activateService(selected.value),
  { immediate: true },
);
watch(
  () => props.category,
  () => {
    selectedId.value = services.value[0]?.id ?? "";
  },
);
watch(
  () => props.refreshKey,
  () => {
    if (!busy.value && !confirmationOpen.value) void refresh();
  },
);
onBeforeUnmount(() => {
  generation++;
});
defineExpose({ refresh, openControl, openAction });
</script>

<template>
  <section
    v-if="services.length"
    class="operations-controls"
    aria-label="Service controls"
  >
    <div class="section-caption">
      <div>
        <span class="eyebrow">Manage this service</span>
        <h2>Operational controls</h2>
      </div>
      <span class="subtle"
        >{{ services.length }}
        {{ services.length === 1 ? "workspace" : "workspaces" }}</span
      >
    </div>
    <div
      class="control-services"
      role="tablist"
      aria-label="Service workspaces"
    >
      <button
        v-for="service in services"
        :key="service.id"
        type="button"
        class="service-tab"
        :disabled="busy || confirmationOpen"
        role="tab"
        :aria-selected="selected?.id === service.id"
        :class="{ selected: selected?.id === service.id }"
        @click="selectedId = service.id"
      >
        <span class="service-tab-icon"
          ><AdminIcon
            :name="service.supported ? 'catalog' : 'lock'"
            :size="17" /></span
        ><strong>{{ service.label }}</strong
        ><AdminIcon name="chevron_right" :size="16" />
      </button>
    </div>
    <article v-if="selected" class="panel control-workspace">
      <div class="panel-heading">
        <div>
          <h3>{{ selected.label }}</h3>
          <p>{{ selected.description }}</p>
        </div>
        <span v-if="lastReadAt" class="subtle">Updated {{ lastReadAt }}</span>
      </div>
      <div v-if="!selected.supported" class="empty-state compact-empty">
        <AdminIcon name="lock" :size="28" />
        <h3>Not available yet</h3>
        <p>
          {{
            selected.reason ||
            "This capability needs a supported server workflow before it can be controlled here."
          }}
        </p>
      </div>
      <template v-else>
        <form
          v-if="selected.read?.fields?.length"
          class="control-filter-grid"
          @submit.prevent="refresh"
        >
          <label v-for="field in selected.read.fields" :key="field.name"
            ><span
              >{{ field.label }}<small v-if="field.required"> *</small></span
            ><select
              v-if="field.type === 'boolean'"
              v-model="readValues[field.name]"
            >
              <option
                v-if="!field.required && field.defaultValue === undefined"
                :value="undefined"
              >
                Any
              </option>
              <option :value="true">Yes</option>
              <option :value="false">No</option></select
            ><select
              v-else-if="field.type === 'enum'"
              v-model="readValues[field.name]"
            >
              <option v-if="!field.required" value="">Any</option>
              <option
                v-for="option in field.options"
                :key="option"
                :value="option"
              >
                {{ human(option) }}
              </option></select
            ><AdminReferenceInput
              v-else-if="hasAdminReference(field.name)"
              v-model="readValues[field.name]"
              :field="field"
              :request="request"
            /><input
              v-else
              v-model="readValues[field.name]"
              :type="
                field.type === 'number'
                  ? 'number'
                  : field.type === 'datetime'
                    ? 'datetime-local'
                    : 'text'
              "
              :required="field.required"
              :placeholder="field.placeholder"
              :maxlength="field.maxLength"
              :min="field.min"
              :max="field.max"
              :step="field.integer ? 1 : 'any'"
            /><small v-if="field.description">{{
              field.description
            }}</small></label
          ><button type="submit" class="secondary" :disabled="loading || busy">
            <AdminIcon name="search" :size="16" />Load records
          </button>
        </form>
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <p v-if="notice" class="notice-text" role="status">{{ notice }}</p>
        <div v-if="selected.read" class="resource-toolbar">
          <div>
            <strong>{{ visibleRecords.length }}</strong>
            <span class="subtle">{{
              visibleRecords.length === 1 ? "record" : "records"
            }}</span>
          </div>
          <div class="resource-toolbar-actions">
            <label class="search-field"
              ><AdminIcon name="search" :size="16" /><input
                v-model="search"
                type="search"
                aria-label="Search loaded service records"
                placeholder="Search records…" /></label
            ><button
              class="icon-button secondary"
              type="button"
              :disabled="loading || busy"
              aria-label="Refresh service records"
              @click="refresh"
            >
              <AdminIcon
                name="refresh"
                :class="{ spinning: loading }"
                :size="17"
              />
            </button>
          </div>
        </div>
        <div v-if="loading" class="empty-state compact-empty" role="status">
          <span class="loader" />Loading current records…
        </div>
        <div
          v-else-if="selected.read && !visibleRecords.length && !error"
          class="empty-state compact-empty"
        >
          <AdminIcon name="inventory_2" :size="28" />
          <h3>No records to show</h3>
          <p>
            {{
              selected.read.fields?.some((field) => field.required)
                ? "Choose the required filters, then load records."
                : "Records will appear here when this service has activity."
            }}
          </p>
        </div>
        <div
          v-else-if="selected.read && visibleRecords.length"
          class="resource-table-wrap"
        >
          <table class="resource-table">
            <thead>
              <tr>
                <th v-for="column in selected.read.columns" :key="column.key">
                  {{ column.label }}
                </th>
                <th><span class="sr-only">Open record</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in visibleRecords"
                :key="text(readAt(row, selected.read.rowId)) || index"
                :class="{ 'row-selected': selectedRecord === row }"
              >
                <td v-for="column in selected.read.columns" :key="column.key">
                  {{ format(readAt(row, column.key), column.format) }}
                </td>
                <td>
                  <button
                    type="button"
                    class="text-button"
                    @click="chooseRecord(row)"
                  >
                    Manage<AdminIcon name="chevron_right" :size="15" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="relatedControls.length" class="related-controls">
          <button
            v-for="link in relatedControls"
            :key="link.id"
            class="secondary"
            type="button"
            @click="openControl(link.id, link.values)"
          >
            {{ link.label }}<AdminIcon name="arrow_forward" :size="15" />
          </button>
        </div>
        <MerchantStoreEditor
          v-if="
            selected.id === 'merchant-store-settings' &&
            loadedMerchantId &&
            loadedMerchantId === readValues.merchantId
          "
          :key="loadedMerchantId"
          :merchant-id="loadedMerchantId"
          :actor-id="actorId"
          :request="request"
          @changed="
            refresh();
            emit('changed');
          "
        />
        <CatalogOptionsEditor
          v-if="
            selected.id === 'catalog-customizations' &&
            loadedProductId &&
            loadedProductId === readValues.productId
          "
          :key="loadedProductId"
          :product-id="loadedProductId"
          :actor-id="actorId"
          :request="request"
          @changed="
            refresh();
            emit('changed');
          "
        />
        <div
          v-if="
            selected.actions.length && selected.id !== 'catalog-customizations'
          "
          class="control-action-area"
        >
          <div class="section-caption">
            <div>
              <h3>Actions</h3>
              <p>
                {{
                  selectedRecord
                    ? "Review the selected record, then choose an action."
                    : "Select a record above or choose a creation action."
                }}
              </p>
            </div>
            <select
              :value="actionId"
              :disabled="busy || confirmationOpen || !!pending"
              aria-label="Choose service action"
              @change="chooseAction(($event.target as HTMLSelectElement).value)"
            >
              <option value="">Choose an action…</option>
              <option
                v-for="item in selected.actions"
                :key="item.id"
                :value="item.id"
              >
                {{ item.label }}{{ canAct(item) ? "" : " · unavailable" }}
              </option>
            </select>
          </div>
          <form
            v-if="action"
            class="action-form"
            @submit.prevent="prepareAction"
          >
            <p v-if="!canAct(action)" class="notice-text">
              {{
                action.reason ||
                "This action needs an additional administrator permission."
              }}
            </p>
            <p v-else-if="action.description" class="subtle">
              {{ action.description }}
            </p>
            <fieldset
              :disabled="
                busy ||
                confirmationOpen ||
                !canAct(action) ||
                uncertain ||
                completed
              "
            >
              <div class="action-field-grid">
                <label
                  v-for="field in action.fields.filter(
                    (field) =>
                      !['idempotencyKey', 'expectedUpdatedAt'].includes(
                        field.name,
                      ),
                  )"
                  :key="field.name"
                  ><span
                    >{{ field.label
                    }}<small v-if="field.required"> *</small></span
                  ><select
                    v-if="field.type === 'boolean'"
                    v-model="actionValues[field.name]"
                  >
                    <option v-if="!field.required" :value="undefined">
                      Leave unchanged
                    </option>
                    <option :value="true">Yes</option>
                    <option :value="false">No</option></select
                  ><select
                    v-else-if="field.type === 'enum'"
                    v-model="actionValues[field.name]"
                  >
                    <option value="">
                      {{ field.required ? "Select…" : "Leave unchanged" }}
                    </option>
                    <option
                      v-for="option in field.options"
                      :key="option"
                      :value="option"
                    >
                      {{ human(option) }}
                    </option></select
                  ><textarea
                    v-else-if="
                      field.type === 'string' && (field.maxLength ?? 0) > 255
                    "
                    :value="String(actionValues[field.name] ?? '')"
                    @input="
                      actionValues[field.name] = (
                        $event.target as HTMLTextAreaElement
                      ).value
                    "
                    :required="field.required"
                    :maxlength="field.maxLength"
                    :placeholder="field.placeholder"
                    rows="3"
                  /><AdminReferenceInput
                    v-else-if="hasAdminReference(field.name)"
                    v-model="actionValues[field.name]"
                    :field="field"
                    :request="request"
                  /><input
                    v-else
                    v-model="actionValues[field.name]"
                    :type="
                      field.type === 'number'
                        ? 'number'
                        : field.type === 'datetime'
                          ? 'datetime-local'
                          : 'text'
                    "
                    :required="field.required"
                    :placeholder="field.placeholder"
                    :maxlength="field.maxLength"
                    :min="field.min"
                    :max="field.max"
                    :step="field.integer ? 1 : 'any'"
                  /><small v-if="field.description">{{
                    field.description
                  }}</small></label
                >
              </div>
              <div class="form-footer">
                <p class="subtle">
                  Changes are checked and recorded by the server.
                </p>
                <button
                  type="submit"
                  :disabled="busy || !canAct(action) || uncertain || completed"
                >
                  <span v-if="busy" class="loader small" /><AdminIcon
                    v-else
                    name="check"
                    :size="16"
                  />{{ busy ? "Saving…" : "Review action" }}
                </button>
              </div>
            </fieldset>
            <div v-if="uncertain" class="pending-action-tools">
              <button
                type="button"
                class="secondary"
                :disabled="busy"
                @click="refresh"
              >
                Refresh server records</button
              ><button
                v-if="
                  pending &&
                  action.fields.some((field) => field.name === 'idempotencyKey')
                "
                type="button"
                class="secondary"
                :disabled="busy"
                @click="reviewRetry"
              >
                Review exact retry</button
              ><button
                v-if="pending"
                type="button"
                class="text-button"
                :disabled="busy"
                @click="resolveAfterReview"
              >
                Resolve after review
              </button>
            </div>
            <button
              v-if="completed"
              type="button"
              class="secondary"
              @click="chooseAction(actionId)"
            >
              Start another action
            </button>
          </form>
        </div>
        <details v-if="selectedRecord" class="record-details">
          <summary>Selected record details</summary>
          <dl>
            <div v-for="(value, key) in selectedRecord" :key="key">
              <dt>{{ human(String(key)) }}</dt>
              <dd>{{ text(value) }}</dd>
            </div>
          </dl>
        </details>
        <details v-if="result !== null" class="record-details">
          <summary>Recorded server result</summary>
          <pre>{{ JSON.stringify(result, null, 2) }}</pre>
        </details>
      </template>
    </article>
    <div
      v-if="confirmationOpen && action"
      class="modal-backdrop"
      @click.self="confirmationOpen = false"
      @keydown.esc="confirmationOpen = false"
    >
      <section
        ref="confirmationDialog"
        class="confirm-dialog"
        @keydown="trapConfirmationFocus"
        role="dialog"
        aria-modal="true"
        aria-labelledby="control-confirm-title"
        tabindex="-1"
      >
        <div class="confirm-icon"><AdminIcon name="shield" :size="25" /></div>
        <h2 id="control-confirm-title">{{ action.label }}?</h2>
        <p>{{ action.confirmation }}</p>
        <dl class="confirmation-values">
          <div
            v-for="field in action.fields.filter(
              (field) =>
                !['idempotencyKey', 'expectedUpdatedAt'].includes(field.name) &&
                reviewedValues?.[field.name] !== undefined &&
                reviewedValues?.[field.name] !== '',
            )"
            :key="field.name"
          >
            <dt>{{ field.label }}</dt>
            <dd>{{ text(reviewedValues?.[field.name]) }}</dd>
          </div>
        </dl>
        <div class="dialog-actions">
          <button
            type="button"
            class="secondary"
            autofocus
            @click="confirmationOpen = false"
          >
            Cancel</button
          ><button type="button" :disabled="busy" @click="confirmAction">
            Confirm action<AdminIcon name="arrow_forward" :size="16" />
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
