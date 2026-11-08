export type AdminReadSection = 'deliveries' | 'payments' | 'commissions' | 'returns' | 'relay' | 'settings'

export type AdminReadGroup = {
  title: string
  summary?: string
  columns: [string, string, string]
  rows: { id: string; cells: [string, string, string] }[]
}

type AdminReadRequest = <T>(path: string) => Promise<T>

type Deliveries = {
  missions: {
    id: string; deliveryCode: string; orderId: string; courierId: string | null
    deliveryMode: string; destinationType: string; status: string; updatedAt: string
    deliveryOption?: { id: string; etaMinMinutes: number; etaMaxMinutes: number; deliveryFeeCfa: number; zoneId: string } | null
    assignmentWorkforceType?: string | null; subscriberPriority?: boolean; assignmentReason?: string | null
  }[]
  merchantSubOrderCounts: Record<string, number>
}
type Payments = {
  merchantPayouts: {
    id: string; merchantId: string; orderId: string; merchantNetCfa: number; status: string
    activeReturnHold: boolean; activeDisputeHold: boolean
  }[]
  webhookEvents: {
    id: string; provider: string; eventId: string; checkoutId: string
    amountCfa: number; status: string; receivedAt: string
  }[]
}
type Commissions = {
  defaultRateBps: number
  overrides: { merchantId: string; commissionRateBps: number; reason: string | null }[]
}
type Relay = {
  storageFeeAssessmentCount: number
  parcels: {
    id: string; relayPointId: string; lockerId: string | null; orderId: string | null
    returnId: string | null; status: string; depositedAt: string | null
  }[]
}
type ReturnRow = {
  id: string; orderId: string; status: string; requestedRefundCfa: number
  relayPointId: string | null; updatedAt: string
}
type DeliveryPricing = {
  active: {
    profile: string; minimumDeliveryFeeCfa: number; extraKmFeeCfa: number
    includedKm: number; effectiveFrom: string | null
  }
}
type BusinessParameters = {
  defaultCommissionRateBps: number; commissionOverrideCount: number
  relayStorageFeeAssessmentCount: number; relayExcludedProductPolicySource: string; returnWindowPolicySource: string
}

const prefix = '/api/admin/web'
const count = (value: number) => value.toLocaleString('en-US')
const money = (value: number) => `${count(value)} CFA`
const rate = (bps: number) => `${(bps / 100).toFixed(2)}%`
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString() : '—'
const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2')
  .replaceAll('_', ' ').toLowerCase().replace(/^./, (first) => first.toUpperCase())

export async function readAdminSection(section: AdminReadSection, request: AdminReadRequest): Promise<AdminReadGroup[]> {
  switch (section) {
    case 'deliveries': {
      const data = await request<Deliveries>(`${prefix}/deliveries`)
      return [{
        title: 'Delivery missions', columns: ['Mission / order', 'Assignment', 'Status / updated'],
        rows: data.missions.map((mission) => ({
          id: mission.id,
          cells: [
            `${mission.deliveryCode} · Order ${mission.orderId}`,
            [label(mission.deliveryOption?.id ?? mission.deliveryMode), label(mission.destinationType), mission.courierId ?? 'Unassigned',
              mission.assignmentWorkforceType ? label(mission.assignmentWorkforceType) : '',
              mission.subscriberPriority ? 'Subscriber priority' : '',
              mission.deliveryOption ? `${mission.deliveryOption.etaMinMinutes}–${mission.deliveryOption.etaMaxMinutes} min · ${money(mission.deliveryOption.deliveryFeeCfa)} · ${mission.deliveryOption.zoneId}` : 'ETA unavailable',
              mission.assignmentReason ?? ''].filter(Boolean).join(' · '),
            `${label(mission.status)} · ${timestamp(mission.updatedAt)}`,
          ],
        })),
      }, {
        title: 'Merchant fulfillment', columns: ['State', 'Sub-orders', 'Scope'],
        rows: Object.entries(data.merchantSubOrderCounts).map(([status, total]) => ({
          id: status, cells: [label(status), count(total), 'All merchant sub-orders'],
        })),
      }]
    }
    case 'payments': {
      const data = await request<Payments>(`${prefix}/payments`)
      return [{
        title: 'Merchant payouts', columns: ['Merchant / order', 'Net payout', 'Status'],
        rows: data.merchantPayouts.map((payout) => ({
          id: payout.id,
          cells: [
            `${payout.merchantId} · Order ${payout.orderId}`,
            money(payout.merchantNetCfa),
            [label(payout.status), payout.activeReturnHold ? 'Return hold' : '', payout.activeDisputeHold ? 'Dispute hold' : '']
              .filter(Boolean).join(' · '),
          ],
        })),
      }, {
        title: 'Payment events', columns: ['Provider / event', 'Checkout / amount', 'Status / received'],
        rows: data.webhookEvents.map((event) => ({
          id: event.id,
          cells: [
            `${label(event.provider)} · ${event.eventId}`,
            `${event.checkoutId} · ${money(event.amountCfa)}`,
            `${label(event.status)} · ${timestamp(event.receivedAt)}`,
          ],
        })),
      }]
    }
    case 'commissions': {
      const data = await request<Commissions>(`${prefix}/commissions`)
      return [{
        title: 'Merchant commission overrides', summary: `Default commission ${rate(data.defaultRateBps)}`,
        columns: ['Merchant', 'Commission', 'Reason'],
        rows: data.overrides.map((item) => ({
          id: item.merchantId, cells: [item.merchantId, rate(item.commissionRateBps), item.reason ?? '—'],
        })),
      }]
    }
    case 'returns': {
      const data = await request<ReturnRow[]>(`${prefix}/returns`)
      return [{
        title: 'Return requests', columns: ['Return / order', 'Stage / updated', 'Requested refund / relay'],
        rows: data.map((item) => ({
          id: item.id,
          cells: [
            `${item.id} · Order ${item.orderId}`,
            `${label(item.status)} · ${timestamp(item.updatedAt)}`,
            `${money(item.requestedRefundCfa)} · ${item.relayPointId ?? '—'}`,
          ],
        })),
      }]
    }
    case 'relay': {
      const data = await request<Relay>(`${prefix}/relay`)
      return [{
        title: 'Relay parcels', summary: `${count(data.storageFeeAssessmentCount)} storage fee assessments`,
        columns: ['Parcel / reference', 'Relay / locker', 'Status / deposit'],
        rows: data.parcels.map((parcel) => ({
          id: parcel.id,
          cells: [
            [parcel.id, parcel.orderId && `Order ${parcel.orderId}`, parcel.returnId && `Return ${parcel.returnId}`].filter(Boolean).join(' · '),
            `${parcel.relayPointId} · ${parcel.lockerId ?? '—'}`,
            `${label(parcel.status)} · ${timestamp(parcel.depositedAt)}`,
          ],
        })),
      }]
    }
    case 'settings': {
      const [{ active }, parameters] = await Promise.all([
        request<DeliveryPricing>(`${prefix}/delivery-pricing`),
        request<BusinessParameters>(`${prefix}/business-parameters`),
      ])
      return [{
        title: 'Delivery pricing', columns: ['Setting', 'Value', 'Profile'],
        rows: ([
          ['Minimum delivery price', money(active.minimumDeliveryFeeCfa)],
          ['Price per extra kilometer', money(active.extraKmFeeCfa)],
          ['Included distance', `${count(active.includedKm)} km`],
          ['Effective from', timestamp(active.effectiveFrom)],
        ] satisfies [string, string][]).map(([name, value]) => ({ id: name, cells: [name, value, active.profile] })),
      }, {
        title: 'Business parameters', columns: ['Setting', 'Value', 'Scope'],
        rows: ([
          ['Default commission', rate(parameters.defaultCommissionRateBps), 'Merchant commissions'],
          ['Merchant commission overrides', count(parameters.commissionOverrideCount), 'Merchant commissions'],
          ['Storage fee assessments', count(parameters.relayStorageFeeAssessmentCount), 'Relay operations'],
          ['Excluded product policy source', parameters.relayExcludedProductPolicySource, 'Relay operations'],
          ['Return window policy source', parameters.returnWindowPolicySource, 'Returns'],
        ] satisfies [string, string, string][]).map(([name, value, scope]) => ({ id: name, cells: [name, value, scope] })),
      }]
    }
  }
}
