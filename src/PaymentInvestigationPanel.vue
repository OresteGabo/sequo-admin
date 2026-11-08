<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { readPaymentCheckout, readPaymentCheckoutQueue, reconciliationLabel, type PaymentCheckout, type PaymentInvestigation, type PaymentReadRequest } from './paymentInvestigationReads'
const props = defineProps<{ request: PaymentReadRequest }>()
const rows = ref<PaymentCheckout[]>([])
const queueBusy = ref(false)
const queueError = ref('')
const lookupId = ref('')
const detail = ref<PaymentInvestigation | null>(null)
const detailBusy = ref(false)
const detailError = ref('')
let disposed = false
let generation = 0
onUnmounted(() => { disposed = true; generation++ })
const label = (value: string | null | undefined) => value ? value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().replace(/^./, first => first.toUpperCase()) : 'Unavailable'
const money = (row: PaymentCheckout) => `${row.amountCfa.toLocaleString('en-US')} ${row.currency ?? 'XOF'}`
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not recorded'
const message = (caught: unknown) => caught instanceof Error ? caught.message : 'Payment records could not be read. Refresh to try again.'
async function refreshQueue() {
  if (queueBusy.value) return
  generation++; rows.value = []; detail.value = null; detailError.value = ''; detailBusy.value = false
  queueBusy.value = true; queueError.value = ''
  try { const read = await readPaymentCheckoutQueue(props.request); if (!disposed) rows.value = read }
  catch (caught) { if (!disposed) queueError.value = message(caught) }
  finally { if (!disposed) queueBusy.value = false }
}
async function lookup(id = lookupId.value) {
  if (detailBusy.value || queueBusy.value) return
  lookupId.value = id
  const version = ++generation
  detail.value = null; detailError.value = ''; detailBusy.value = true
  try { const read = await readPaymentCheckout(id, props.request); if (!disposed && version === generation) detail.value = read }
  catch (caught) { if (!disposed && version === generation) detailError.value = message(caught) }
  finally { if (!disposed && version === generation) detailBusy.value = false }
}
onMounted(refreshQueue)
</script>

<template>
  <section class="payment-investigation" aria-label="Checkout payment investigation">
    <h3>Checkout payment investigation</h3>
    <p>Read stored checkouts and callback outcomes. This view cannot confirm a transfer or change payment state. A received validated event does not by itself confirm fulfillment.</p>
    <button class="secondary" type="button" :disabled="queueBusy || detailBusy" @click="refreshQueue">{{ queueBusy ? 'Reading checkouts…' : 'Refresh checkouts' }}</button>
    <p>Latest recorded checkouts (up to 50). Use the exact checkout ID to investigate an older record.</p>
    <p v-if="queueError" class="error-text" role="alert">{{ queueError }}</p>
    <p v-else-if="queueBusy" role="status">Loading checkouts…</p>
    <p v-else-if="!rows.length">No checkouts recorded.</p>
    <ul v-else class="checkout-queue"><li v-for="row in rows" :key="row.checkoutId">
      <button class="secondary" type="button" :disabled="detailBusy" @click="lookup(row.checkoutId)">{{ row.checkoutId }}</button>
      <p>{{ label(row.paymentProvider) }} · {{ money(row) }} · {{ label(row.status) }} · Updated {{ timestamp(row.updatedAt) }}</p>
    </li></ul>
    <form class="filter-row" @submit.prevent="lookup()">
      <label>Exact checkout ID<input v-model="lookupId" required maxlength="128" autocomplete="off" :disabled="detailBusy || queueBusy" /></label>
      <button type="submit" :disabled="detailBusy || queueBusy || !lookupId.trim()">{{ detailBusy ? 'Reading checkout…' : 'Read checkout' }}</button>
    </form>
    <p v-if="detailError" class="error-text" role="alert">{{ detailError }}</p>
    <article v-if="detail" class="checkout-detail">
      <h4>{{ detail.checkout.checkoutId }} · {{ label(detail.checkout.status) }}</h4>
      <dl><dt>Provider / amount</dt><dd>{{ label(detail.checkout.paymentProvider) }} · {{ money(detail.checkout) }}</dd>
        <dt>Payment reference</dt><dd>{{ detail.checkout.paymentReference }}</dd><dt>Provider reference</dt><dd>{{ detail.checkout.providerReference ?? 'Not recorded' }}</dd>
        <dt>Created</dt><dd>{{ timestamp(detail.checkout.createdAt) }}</dd><dt>Updated</dt><dd>{{ timestamp(detail.checkout.updatedAt) }}</dd>
        <dt>Checkout terminal time</dt><dd>{{ timestamp(detail.checkout.completedAt) }}</dd>
        <dt>Persisted order</dt><dd>{{ detail.checkout.orderId ?? 'No order linked' }}<template v-if="detail.checkout.orderId"> · {{ label(detail.checkout.orderStatus) }}</template></dd></dl>
      <h4>Received events and reconciliation outcomes</h4>
      <p>Latest 100 stored events for this checkout. Missing historical outcomes require review; no replay is performed here.</p>
      <p v-if="!detail.events.length">No callback events recorded for this checkout.</p>
      <ul v-else><li v-for="event in detail.events" :key="event.id">
        <strong>{{ event.eventId }} · {{ reconciliationLabel(event.reconciliationStatus) }}</strong>
        <p>Received normalized status: {{ label(event.status) }} · {{ event.amountCfa.toLocaleString('en-US') }} XOF · {{ label(event.provider) }}</p>
        <p>Payment reference {{ event.paymentReference }} · Provider reference {{ event.providerReference ?? 'Not recorded' }}</p>
        <p>Provider time {{ timestamp(event.occurredAt) }} · Received {{ timestamp(event.receivedAt) }} · Reconciled {{ timestamp(event.reconciledAt) }}</p>
        <p>Reason: {{ label(event.reconciliationReason) }}</p>
      </li></ul>
    </article>
  </section>
</template>

<style scoped>
.payment-investigation { border-top: 1px solid var(--line, #d7dedb); margin-top: 1rem; padding-top: 1rem; }
.checkout-detail { border: 1px solid var(--line, #d7dedb); border-radius: .5rem; padding: .75rem; margin: .75rem 0; }
input { display: block; width: 100%; box-sizing: border-box; }
li, p, dd, button { overflow-wrap: anywhere; }
.checkout-queue { max-height: 18rem; overflow: auto; }
dt { font-weight: 600; margin-top: .5rem; } dd { margin-left: 0; }
</style>
