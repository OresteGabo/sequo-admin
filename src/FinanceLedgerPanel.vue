<script setup lang="ts">
import { referenceText, referenceField } from "./adminReferences";
import AdminReferenceInput from './AdminReferenceInput.vue'
import { onUnmounted, ref } from 'vue'
import { readFinanceSource, type FinanceRequest, type FinanceSourceRead, type FinanceSourceType } from './financeReads'
const props = defineProps<{ request: import('./adminControls').AdminControlRequest }>()
const sourceType = ref<FinanceSourceType>('DeliveryMission')
const sourceId = ref('')
const result = ref<FinanceSourceRead | null>(null)
const busy = ref(false)
const error = ref('')
let disposed = false
onUnmounted(() => { disposed = true })
const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/^./, first => first.toUpperCase())
const money = (value: number | undefined) => typeof value === 'number' ? `${value.toLocaleString('en-US')} CFA` : 'Unavailable'
const rate = (value: number | undefined) => typeof value === 'number' ? `${(value / 100).toFixed(2)}%` : 'Unavailable'
const timestamp = (value: string | undefined) => value ? new Date(value).toLocaleString() : 'Unavailable'
async function refresh() {
  if (busy.value) return
  const kind = sourceType.value; const id = sourceId.value.trim()
  busy.value = true; error.value = ''; result.value = null
  try {
    const read = await readFinanceSource(kind, id, props.request)
    if (!disposed) result.value = read
  } catch (caught) {
    if (!disposed) error.value = caught instanceof Error ? caught.message : 'Finance records could not be read. Refresh to try again.'
  } finally { if (!disposed) busy.value = false }
}
</script>

<template>
  <section class="finance-ledger" aria-label="Finance source records">
    <h3>Finance source records</h3>
    <p>Use a mission reference or merchant order reference from the lists. Posted ledger entries record accruals and expenses; they do not confirm a provider transfer.</p>
    <form class="filter-row" @submit.prevent="refresh">
      <label>Finance source<select v-model="sourceType" :disabled="busy" @change="sourceId=''; result=null"><option value="DeliveryMission">Delivery mission ledger</option><option value="OrderItem">Merchant sub-order snapshot and ledger</option></select></label>
      <label>Source reference<AdminReferenceInput :key="sourceType" v-model="sourceId" :field="referenceField(sourceType === 'DeliveryMission' ? 'missionId' : 'subOrderId', 'Source reference')" :request="request" :disabled="busy" /></label>
      <button type="submit" :disabled="busy || !sourceId.trim()">{{ busy ? 'Reading finance records…' : 'Read finance records' }}</button>
    </form>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="!result && !busy && !error">No source selected.</p>
    <article v-if="result" class="finance-card">
      <h4>{{ label(result.sourceType) }} · {{ referenceText(result.snapshot ?? result.ledger?.[0], result.snapshot ? 'id' : 'sourceId') }}</h4>
      <p v-for="message in result.errors" :key="message" class="error-text" role="alert">{{ message }}</p>
      <template v-if="result.snapshot">
        <h4>Frozen merchant commission snapshot</h4>
        <p>Order {{ referenceText(result.snapshot, 'orderId') }} · Merchant {{ referenceText(result.snapshot, 'merchantId') }} · {{ label(result.snapshot.status) }} · {{ timestamp(result.snapshot.updatedAt) }}</p>
        <dl><dt>Item subtotal</dt><dd>{{ money(result.snapshot.itemSubtotalCfa) }}</dd><dt>Commission rate</dt><dd>{{ rate(result.snapshot.commissionRateBps) }}</dd><dt>Commission amount</dt><dd>{{ money(result.snapshot.commissionCfa) }}</dd><dt>Merchant net</dt><dd>{{ money(result.snapshot.merchantNetCfa) }}</dd></dl>
        <p>These amounts were stored with the sub-order. A later commission override does not rewrite the snapshot.</p>
      </template>
      <h4>Posted ledger</h4>
      <p v-if="result.ledger === null">Ledger unavailable; no balance is inferred.</p>
      <p v-else-if="!result.ledger.length">No ledger entries recorded for this source.</p>
      <ul v-else><li v-for="entry in result.ledger" :key="entry.id">
        <strong>{{ label(entry.account) }} · {{ label(entry.direction) }} · {{ money(entry.amountCfa) }}</strong>
        <p>{{ referenceText(entry) }} · {{ timestamp(entry.createdAt) }}</p>
        <p>{{ entry.description }}</p>
        <p v-if="entry.merchantId">Merchant {{ referenceText(entry, 'merchantId') }}</p><p v-if="entry.courierId">Courier {{ referenceText(entry, 'courierId') }} · {{ entry.workforceType ? label(entry.workforceType) : 'Workforce snapshot unavailable' }}</p><p v-if="entry.relayPointId">Relay {{ referenceText(entry, 'relayPointId') }}</p>
      </li></ul>
    </article>
  </section>
</template>

<style scoped>
.finance-ledger { border-top: 1px solid var(--line, #d7dedb); margin-top: 1rem; padding-top: 1rem; }
.finance-card { border: 1px solid var(--line, #d7dedb); border-radius: .5rem; padding: .75rem; margin: .75rem 0; }
label { display: block; margin: .75rem 0; }
input, select { display: block; width: 100%; max-width: 100%; box-sizing: border-box; }
li, p, dd { overflow-wrap: anywhere; }
dt { font-weight: 600; margin-top: .5rem; }
dd { margin-left: 0; }
</style>
