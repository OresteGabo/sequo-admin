import { referenceText } from "./adminReferences.ts"
import { reconciliationLabel } from './paymentInvestigationReads.ts'
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
    customerDeliveryFeeCfa?: number; courierFeeCfa?: number; shortfallCfa?: number
  }[]
  merchantSubOrderCounts: Record<string, number>
}
type Payments = {
  merchantPayouts: {
    id: string; merchantId: string; orderId: string; merchantNetCfa: number; status: string
    activeReturnHold: boolean; activeDisputeHold: boolean
    sourceOrderItemId?: string; commissionCfa?: number; platformMarginCfa?: number
    payoutEligibleAt?: string; payoutDueBy?: string
  }[]
  webhookEvents: {
    id: string; provider: string; eventId: string; checkoutId: string
    amountCfa: number; status: string; receivedAt: string; reconciliationStatus?: string | null
  }[]
}
type Commissions = {
  defaultRateBps: number
  overrides: { merchantId: string; commissionRateBps: number; reason: string | null; updatedByUserId?: string; updatedAt?: string }[]
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
type BusinessParameter = {
  reference: number; key: string; label: string; state: string
  effectiveValues: Record<string, string>; source: string; changeAuthority: string
  changeProcedure: string; verification: string; pendingDecision?: string | null
}
type BusinessParameters = {
  parameters?: BusinessParameter[]; generatedAt?: string
  defaultCommissionRateBps: number; commissionOverrideCount: number
  relayStorageFeeAssessmentCount: number; relayExcludedProductPolicySource: string; returnWindowPolicySource: string
}

const prefix = '/api/admin/web'
const count = (value: number) => value.toLocaleString('en-US')
const money = (value: number) => `${count(value)} CFA`
const optionalMoney = (value: number | undefined) => typeof value === 'number' ? money(value) : 'Unavailable'
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
            `${referenceText(mission)} · Order ${referenceText(mission, "orderId")}`,
            [label(mission.deliveryOption?.id ?? mission.deliveryMode), label(mission.destinationType), mission.courierId ? referenceText(mission, 'courierId') : 'Unassigned',
              mission.assignmentWorkforceType ? label(mission.assignmentWorkforceType) : '',
              mission.subscriberPriority ? 'Subscriber priority' : '',
              mission.deliveryOption ? `${mission.deliveryOption.etaMinMinutes}–${mission.deliveryOption.etaMaxMinutes} min · ${money(mission.deliveryOption.deliveryFeeCfa)} · ${mission.deliveryOption.zoneId}` : 'ETA unavailable',
              mission.assignmentReason ?? ''].filter(Boolean).join(' · '),
            `${label(mission.status)} · ${timestamp(mission.updatedAt)}`,
          ],
        })),
      }, {
        title: 'Recorded delivery amounts',
        summary: 'Mission amounts are stored estimates/records. Read the mission ledger in Payments for posted courier payables and SEQUO shortfall; no provider transfer is inferred.',
        columns: ['Mission / order', 'Recorded customer / courier amount', 'Recorded shortfall / workforce'],
        rows: data.missions.map(mission => ({ id: mission.id, cells: [
          `${referenceText(mission)} · Order ${referenceText(mission, "orderId")} · ${mission.courierId ? referenceText(mission, 'courierId') : 'Unassigned'}`,
          `Customer ${optionalMoney(mission.customerDeliveryFeeCfa)} · Courier estimate ${optionalMoney(mission.courierFeeCfa)}`,
          `${optionalMoney(mission.shortfallCfa)} · ${mission.assignmentWorkforceType ? label(mission.assignmentWorkforceType) : 'Workforce snapshot unavailable'}`,
        ] })),
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
        title: 'Merchant payouts', summary: 'Stored settlement accruals and holds. Provider payment is confirmed only by its verified transfer state.', columns: ['Merchant / order / sub-order', 'Stored net / commission / margin', 'Status / holds / eligibility'],
        rows: data.merchantPayouts.map((payout) => ({
          id: payout.id,
          cells: [
            `${referenceText(payout, "merchantId")} · Order ${referenceText(payout, "orderId")} · Source ${referenceText(payout, "sourceOrderItemId")}`,
            `Net ${money(payout.merchantNetCfa)} · Commission ${optionalMoney(payout.commissionCfa)} · Margin ${optionalMoney(payout.platformMarginCfa)}`,

            [label(payout.status), payout.activeReturnHold ? 'Return hold' : '', payout.activeDisputeHold ? 'Dispute hold' : '',
              payout.payoutEligibleAt ? `Eligible ${timestamp(payout.payoutEligibleAt)}` : '', payout.payoutDueBy ? `Due ${timestamp(payout.payoutDueBy)}` : '']
              .filter(Boolean).join(' · '),
          ],
        })),
      }, {
        title: 'Payment events', summary: 'Received normalized callback statuses. Investigate the checkout to verify reconciliation; receipt alone does not confirm fulfillment.', columns: ['Provider / event', 'Checkout / amount', 'Status / received'],
        rows: data.webhookEvents.map((event) => ({
          id: event.id,
          cells: [
            `${label(event.provider)} · ${event.eventId}`,
            `${referenceText(event, "checkoutId")} · ${money(event.amountCfa)}`,
            `${label(event.status)} · ${reconciliationLabel(event.reconciliationStatus)} · ${timestamp(event.receivedAt)}`,
          ],
        })),
      }]
    }
    case 'commissions': {
      const data = await request<Commissions>(`${prefix}/commissions`)
      return [{
        title: 'Merchant commission overrides', summary: `Current default commission ${rate(data.defaultRateBps)}. Read a frozen sub-order snapshot in Finance source records to verify an existing order.`,
        columns: ['Merchant', 'Current commission', 'Reason / recorded operator'],
        rows: data.overrides.map((item) => ({
          id: item.merchantId, cells: [referenceText(item, "merchantId"), rate(item.commissionRateBps), [item.reason ?? '—', referenceText(item, 'updatedByUserId'), item.updatedAt ? timestamp(item.updatedAt) : ''].filter(Boolean).join(' · ')],
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
            `${referenceText(item)} · Order ${referenceText(item, "orderId")}`,
            `${label(item.status)} · ${timestamp(item.updatedAt)}`,
            `${money(item.requestedRefundCfa)} · ${referenceText(item, 'relayPointId')}`,
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
            [referenceText(parcel), parcel.orderId && `Order ${referenceText(parcel, "orderId")}`, parcel.returnId && `Return ${referenceText(parcel, "returnId")}`].filter(Boolean).join(' · '),
            `${referenceText(parcel, 'relayPointId')} · ${referenceText(parcel, 'lockerId')}`,
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
        title: 'Parameter inventory status', columns: ['Setting', 'Value', 'Scope'],
        summary: parameters.parameters?.length === 10
          ? `All ten signed Annex A.6 parameter families. Read at ${timestamp(parameters.generatedAt ?? null)}. Configuration does not imply policy approval.`
          : 'The complete parameter inventory is unavailable from this server. Refresh after the supported API is deployed; no policy values are inferred.',
        rows: ([
          ['Default commission', rate(parameters.defaultCommissionRateBps), 'Merchant commissions'],
          ['Merchant commission overrides', count(parameters.commissionOverrideCount), 'Merchant commissions'],
          ['Storage fee assessments', count(parameters.relayStorageFeeAssessmentCount), 'Recorded history'],
        ] satisfies [string, string, string][]).map(([name, value, scope]) => ({ id: name, cells: [name, value, scope] })),
      }, ...(parameters.parameters ?? []).map((parameter): AdminReadGroup => ({
        title: `${parameter.reference}. ${parameter.label}`,
        summary: `${label(parameter.state)}${parameter.pendingDecision ? ` · ${parameter.pendingDecision}` : ''}`,
        columns: ['Effective setting / control', 'Value / procedure', 'Scope'],
        rows: [
          ...Object.entries(parameter.effectiveValues).map(([name, value]) => ({ id: `${parameter.key}:${name}`, cells: [name, value, label(parameter.state)] as [string, string, string] })),
          { id: `${parameter.key}:source`, cells: ['Runtime source', parameter.source, 'Server read'] },
          { id: `${parameter.key}:authority`, cells: ['Who may change it', parameter.changeAuthority, 'SEQUO control'] },
          { id: `${parameter.key}:change`, cells: ['How to change it', parameter.changeProcedure, 'Approved change'] },
          { id: `${parameter.key}:verify`, cells: ['Verify the effective value', parameter.verification, 'Readback and regression'] },
        ],
      }))]
    }
  }
}
