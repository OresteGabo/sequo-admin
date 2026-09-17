<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type ViewId =
    | 'overview'
    | 'orders'
    | 'operations'
    | 'missions'
    | 'profiles'
    | 'deliveries'
    | 'hubs'
    | 'shops'
    | 'consolidations'
    | 'relay'
    | 'repairs'
    | 'claims'
    | 'customers'
    | 'commissions'
    | 'webhooks'
    | 'health'
    | 'returns'
    | 'settlements'
    | 'notifications'
    | 'support'
    | 'users'
    | 'audit'
    | 'settings'

type StatusTone = 'good' | 'warning' | 'danger' | 'neutral' | 'info'
type Role = 'Super admin' | 'Operations' | 'Support' | 'Finance'
type ThemeMode = 'light' | 'dark' | 'light-medium-contrast' | 'dark-medium-contrast' | 'light-high-contrast' | 'dark-high-contrast'
type NavItem = {
  id: ViewId
  label: string
  description: string
  icon: string
  count?: number
}
type NavGroup = { label: string; items: NavItem[] }
type WorkspaceRow = { values: string[]; tone: StatusTone }
type WorkspaceConfig = { kicker: string; title: string; description: string; summary: Array<{ label: string; value: string }>; columns: string[]; rows: WorkspaceRow[] }

const activeView = ref<ViewId>('overview')
const activeRole = ref<Role>('Super admin')
const query = ref('')
const selectedRisk = ref<'All' | StatusTone>('All')
const themeMode = ref<ThemeMode>('dark')

const isDarkMode = computed(() => themeMode.value.startsWith('dark'))
function toggleTheme() {
  themeMode.value = isDarkMode.value ? 'light' : 'dark'
}

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', description: 'Live health status', icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h3A1.5 1.5 0 0 1 10 5.5v3A1.5 1.5 0 0 1 8.5 10h-3A1.5 1.5 0 0 1 4 8.5v-3Zm10 0A1.5 1.5 0 0 1 15.5 4h3A1.5 1.5 0 0 1 20 5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 14 8.5v-3ZM4 15.5A1.5 1.5 0 0 1 5.5 14h3a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3Zm10 0a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z' },
  { id: 'orders', label: 'Orders', description: 'Daily order ledger', icon: 'M6 3h12l2 4H4l2-4Zm-2 4h16v13H4V7Zm4 4h8M8 15h5', count: 24 },
  { id: 'operations', label: 'Operations', description: 'Queues and actions', icon: 'M3 12h4l2-6 4 12 2-6h6', count: 8 },
  { id: 'missions', label: 'Missions', description: 'Courier workflow', icon: 'M4 12h16M12 4v16M6 6l12 12M18 6 6 18', count: 5 },
  { id: 'profiles', label: 'Profiles', description: 'Activate and validate', icon: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { id: 'deliveries', label: 'Deliveries', description: 'Missions and riders', icon: 'M3 7h11v8H3V7Zm11 3h3l4 4v1h-7v-5Z', count: 5 },
  { id: 'hubs', label: 'Hubs & Relay', description: 'Parcels and lockers', icon: 'M4 21V9l8-6 8 6v12H4Zm5 0v-7h6v7' },
  { id: 'shops', label: 'Online Shops', description: 'Merchant storefronts', icon: 'M4 8h16l-1 12H5L4 8Zm3 0a5 5 0 0 1 10 0M8 12h.01M16 12h.01', count: 6 },
  { id: 'consolidations', label: 'Consolidations', description: 'Multi-shop packages', icon: 'M4 7h16M4 12h16M4 17h16M7 4v16M17 4v16' },
  { id: 'relay', label: 'Relay Parcels', description: 'Pickup and storage', icon: 'M3 7h18v14H3V7Zm4-4h10l2 4H5l2-4ZM8 12h8M8 16h5' },
  { id: 'repairs', label: 'Repairs', description: 'Damaged assets', icon: 'm14.7 6.3 3 3M4 20l5.4-5.4m0 0L16 8l-2-2-6.6 6.6m2 2L12 16l2 2-3.4 3H4v-4.6l3.4-3.4Z', count: 7 },
  { id: 'claims', label: 'Claims', description: 'Customer problems', icon: 'M12 20h.01M12 16v-4m0-8a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', count: 12 },
  { id: 'customers', label: 'Customers', description: 'Accounts and care', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 2a4 4 0 0 0 0-8', },
  { id: 'users', label: 'Users and Roles', description: 'Access and permissions', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'commissions', label: 'Commissions', description: 'Merchant overrides', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6' },
  { id: 'returns', label: 'Returns', description: 'Receipts and refunds', icon: 'M3 7h11a5 5 0 1 1 0 10H8' },
  { id: 'settlements', label: 'Settlements', description: 'Payouts and finance', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6' },
  { id: 'support', label: 'Support', description: 'Investigations', icon: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z' },
  { id: 'notifications', label: 'Notifications', description: 'Inbox and delivery', icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4', count: 19 },
  { id: 'audit', label: 'Audit Logs', description: 'Immutable trace', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'webhooks', label: 'Payment Webhooks', description: 'Provider events', icon: 'M12 3v18M3 12h18M7 7l10 10M17 7 7 17' },
  { id: 'health', label: 'System Health', description: 'API readiness', icon: 'M3 12h4l2-6 4 12 2-6h6' },
  { id: 'settings', label: 'Settings', description: 'Preferences', icon: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5ZM19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21.3a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.1H2.7a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.4 8.6a1.8 1.8 0 0 0-.36-1.98L4 6.58a2.1 2.1 0 0 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 9 4.01a1.8 1.8 0 0 0 1.1-1.65V2.1a2.1 2.1 0 0 1 4.2 0v.26a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1h.26a2.1 2.1 0 0 1 0 4.2h-.26A1.8 1.8 0 0 0 19.4 15Z' },
]

const navGroups: NavGroup[] = [
  { label: 'Monitor', items: navItems.filter((item) => ['overview', 'orders', 'operations', 'missions', 'deliveries'].includes(item.id)) },
  { label: 'Network', items: navItems.filter((item) => ['hubs', 'relay', 'consolidations', 'repairs'].includes(item.id)) },
  { label: 'Commerce', items: navItems.filter((item) => ['shops', 'returns', 'settlements', 'commissions'].includes(item.id)) },
  { label: 'People', items: navItems.filter((item) => ['profiles', 'customers', 'users'].includes(item.id)) },
  { label: 'Control room', items: navItems.filter((item) => ['claims', 'support', 'notifications', 'audit', 'webhooks', 'health', 'settings'].includes(item.id)) },
]

const metrics = [
  { label: 'Active missions', value: '184', tone: 'warning' as StatusTone, detail: '23 delayed beyond SLA' },
  { label: 'Pending validations', value: '47', tone: 'info' as StatusTone, detail: 'Waiting for review' },
  { label: 'Return bottlenecks', value: '11', tone: 'danger' as StatusTone, detail: 'Refund blocked' },
  { label: 'Payout queue', value: '8.4M', tone: 'good' as StatusTone, detail: 'Ready for finance' },
  { label: 'FCM failures', value: '19', tone: 'warning' as StatusTone, detail: 'Retrying safely' },
  { label: 'Paused couriers', value: '16', tone: 'danger' as StatusTone, detail: 'Capacity below threshold' },
]

const workItems = [
  { id: 'SQ-8821', title: 'Cancel stale mission offer', status: 'Courier unresponsive', tone: 'danger' as StatusTone, action: 'Cancel' },
  { id: 'RID-2094', title: 'Pause rider after failed PINs', status: 'Risk review', tone: 'danger' as StatusTone, action: 'Review' },
  { id: 'MER-418', title: 'Validate merchant commissions', status: 'KYC complete', tone: 'info' as StatusTone, action: 'Activate' },
]

const tableRows = [
  { id: 'OPS-301', primary: 'Delivery shortfall in Lome North', status: 'Escalated', tone: 'danger' as StatusTone, owner: 'Operations', updated: '2m ago' },
  { id: 'MER-418', primary: 'Akouvi Market Store setup', status: 'Needs activation', tone: 'info' as StatusTone, owner: 'Merchant ops', updated: '11m ago' },
  { id: 'PAY-5560', primary: 'Merchant payout execution batch', status: 'Ready', tone: 'good' as StatusTone, owner: 'Finance', updated: '9m ago' },
]

const orders = [
  { id: 'ORD-80421', customer: 'Mawuli K.', route: 'Tokoin → Adidogome', status: 'In transit', tone: 'info' as StatusTone, total: '18,400 CFA', updated: '2 min ago' },
  { id: 'ORD-80420', customer: 'Ama D.', route: 'Bè → Agoè', status: 'Needs rider', tone: 'warning' as StatusTone, total: '9,800 CFA', updated: '6 min ago' },
  { id: 'ORD-80419', customer: 'Kossi A.', route: 'Lomé Port → Hedzranawoé', status: 'Delivered', tone: 'good' as StatusTone, total: '26,500 CFA', updated: '12 min ago' },
  { id: 'ORD-80418', customer: 'Sena T.', route: 'Gblinkomé → Centre', status: 'Problem reported', tone: 'danger' as StatusTone, total: '12,200 CFA', updated: '18 min ago' },
]

const hubs = [
  { name: 'Lomé Central', city: 'Lomé', parcels: '842', capacity: '78%', status: 'Healthy', tone: 'good' as StatusTone, updated: 'Live' },
  { name: 'Tokoin Relay', city: 'Lomé', parcels: '316', capacity: '94%', status: 'Near capacity', tone: 'warning' as StatusTone, updated: '4 min ago' },
  { name: 'Kara Station', city: 'Kara', parcels: '128', capacity: '41%', status: 'Healthy', tone: 'good' as StatusTone, updated: '8 min ago' },
  { name: 'Atakpamé Locker', city: 'Atakpamé', parcels: '0', capacity: 'Offline', status: 'Needs visit', tone: 'danger' as StatusTone, updated: '31 min ago' },
]

const shops = [
  { name: 'Akouvi Market', owner: 'MER-418', orders: '128 today', status: 'Active', tone: 'good' as StatusTone, updated: '8 min ago' },
  { name: 'Togolese Pantry', owner: 'MER-392', orders: '64 today', status: 'Pending review', tone: 'warning' as StatusTone, updated: '22 min ago' },
  { name: 'Kara Fresh', owner: 'MER-377', orders: '31 today', status: 'Paused', tone: 'danger' as StatusTone, updated: '1 hr ago' },
]

const repairs = [
  { asset: 'Locker ATK-04', location: 'Atakpamé', issue: 'Declared destroyed', status: 'Inspection required', tone: 'danger' as StatusTone, owner: 'Field team', updated: '31 min ago' },
  { asset: 'Scanner TOK-12', location: 'Tokoin Relay', issue: 'Battery failure', status: 'Parts requested', tone: 'warning' as StatusTone, owner: 'Hub ops', updated: '1 hr ago' },
  { asset: 'Bike RDR-2094', location: 'Lomé Central', issue: 'Brake wear', status: 'Scheduled', tone: 'info' as StatusTone, owner: 'Fleet', updated: '2 hr ago' },
]

const claims = [
  { id: 'CLM-1184', customer: 'Sena T.', order: 'ORD-80418', issue: 'Parcel arrived damaged', status: 'Needs evidence', tone: 'warning' as StatusTone, age: '18 min' },
  { id: 'CLM-1183', customer: 'Koffi E.', order: 'ORD-80376', issue: 'Wrong item received', status: 'Assigned', tone: 'info' as StatusTone, age: '42 min' },
  { id: 'CLM-1182', customer: 'Ama D.', order: 'ORD-80354', issue: 'Delivery never arrived', status: 'Escalated', tone: 'danger' as StatusTone, age: '2 hr' },
]

const customers = [
  { name: 'Mawuli K.', id: 'CUS-09281', orders: '24', status: 'Good standing', tone: 'good' as StatusTone, lastSeen: '2 min ago' },
  { name: 'Ama D.', id: 'CUS-08012', orders: '9', status: 'Claim open', tone: 'warning' as StatusTone, lastSeen: '6 min ago' },
  { name: 'Sena T.', id: 'CUS-07743', orders: '17', status: 'Under review', tone: 'danger' as StatusTone, lastSeen: '18 min ago' },
]

const workspaceConfigs: Partial<Record<ViewId, WorkspaceConfig>> = {
  operations: {
    kicker: 'Operator queue', title: 'Operations', description: 'Resolve live exceptions before they become customer-facing incidents.',
    summary: [{ value: '8', label: 'open queues' }, { value: '23', label: 'past SLA' }, { value: '4', label: 'unassigned' }],
    columns: ['Queue', 'Issue', 'Status', 'Owner', 'Action'], rows: [
      { values: ['OPS-301', 'Delivery shortfall · Lome North', 'Escalated', 'Nadia K.', 'Assign'], tone: 'danger' },
      { values: ['OPS-298', 'Courier failed pickup PIN', 'Investigating', 'Mawuli S.', 'Open'], tone: 'warning' },
      { values: ['OPS-294', 'Tokoin locker at 94% capacity', 'Watching', 'Hub team', 'Review'], tone: 'info' },
    ],
  },
  missions: {
    kicker: 'Courier control', title: 'Missions', description: 'Assign riders, resolve problems, and move deliveries through their next safe state.',
    summary: [{ value: '184', label: 'active' }, { value: '16', label: 'paused riders' }, { value: '5', label: 'problem missions' }],
    columns: ['Mission', 'Route', 'State', 'Courier', 'Action'], rows: [
      { values: ['MIS-8821', 'Tokoin → Adidogome', 'Offer expired', 'Unassigned', 'Reassign'], tone: 'danger' },
      { values: ['MIS-8817', 'Lome Central → Bè', 'At pickup', 'Rider K. Afi', 'Track'], tone: 'info' },
      { values: ['MIS-8809', 'Kara Station → Centre', 'Accepted', 'A. Komlan', 'Inspect'], tone: 'good' },
    ],
  },
  deliveries: {
    kicker: 'Delivery board', title: 'Deliveries', description: 'Monitor direct, relay, pickup, and consolidation deliveries.',
    summary: [{ value: '129', label: 'in transit' }, { value: '31', label: 'at relay' }, { value: '9', label: 'delayed' }],
    columns: ['Delivery', 'Destination', 'Progress', 'Rider', 'Action'], rows: [
      { values: ['DLV-4412', 'Hedzranawoé', 'Out for delivery', 'E. Mensah', 'Track'], tone: 'good' },
      { values: ['DLV-4408', 'Agoè', 'Waiting at relay', 'Hub handoff', 'Release'], tone: 'info' },
      { values: ['DLV-4399', 'Lome Port', 'Delayed 42 min', 'P. Kossi', 'Escalate'], tone: 'warning' },
    ],
  },
  profiles: {
    kicker: 'Validation desk', title: 'Profiles', description: 'Activate merchants, riders, and hub partners after identity and compliance review.',
    summary: [{ value: '47', label: 'pending review' }, { value: '12', label: 'missing documents' }, { value: '6', label: 'high risk' }],
    columns: ['Profile', 'Type', 'Status', 'Submitted', 'Action'], rows: [
      { values: ['MER-418 · Akouvi Market', 'Merchant', 'KYC complete', 'Today · 09:42', 'Activate'], tone: 'good' },
      { values: ['RID-2094 · K. Afi', 'Rider', 'ID image unclear', 'Today · 09:17', 'Review'], tone: 'warning' },
      { values: ['HUB-018 · Atakpamé Locker', 'Relay partner', 'Awaiting agreement', 'Yesterday', 'Validate'], tone: 'info' },
    ],
  },
  consolidations: {
    kicker: 'Multi-shop fulfilment', title: 'Consolidations', description: 'Collect seller packages and dispatch one final delivery for the customer.',
    summary: [{ value: '18', label: 'open manifests' }, { value: '7', label: 'awaiting seller' }, { value: '3', label: 'ready to dispatch' }],
    columns: ['Manifest', 'Order', 'Packages', 'State', 'Action'], rows: [
      { values: ['MAN-2409', 'ORD-80421', '3 / 3 collected', 'Ready for dispatch', 'Dispatch'], tone: 'good' },
      { values: ['MAN-2408', 'ORD-80402', '1 / 2 collected', 'Waiting on merchant', 'Nudge'], tone: 'warning' },
      { values: ['MAN-2404', 'ORD-80388', '2 / 2 collected', 'Problem reported', 'Resolve'], tone: 'danger' },
    ],
  },
  relay: {
    kicker: 'Parcel network', title: 'Relay parcels', description: 'Release pickups, monitor storage fees, and keep locker contents accountable.',
    summary: [{ value: '316', label: 'stored parcels' }, { value: '21', label: 'due today' }, { value: '4', label: 'storage fees' }],
    columns: ['Parcel', 'Hub', 'Locker', 'Status', 'Action'], rows: [
      { values: ['PAR-7104 · ORD-80420', 'Tokoin Relay', 'L-14', 'Pickup code ready', 'Release'], tone: 'info' },
      { values: ['PAR-7098 · ORD-80392', 'Lome Central', 'L-03', 'Overdue 2 days', 'Assess fee'], tone: 'warning' },
      { values: ['PAR-7087 · ORD-80376', 'Kara Station', 'Counter', 'Problem reported', 'Inspect'], tone: 'danger' },
    ],
  },
  returns: {
    kicker: 'Reverse logistics', title: 'Returns and refunds', description: 'Confirm physical receipt before approving customer refunds.',
    summary: [{ value: '11', label: 'awaiting receipt' }, { value: '6', label: 'at relay' }, { value: '3.2M', label: 'CFA pending' }],
    columns: ['Return', 'Order', 'Requested', 'Status', 'Action'], rows: [
      { values: ['RET-2041', 'ORD-80354', '12,500 CFA', 'At relay drop-off', 'Receive'], tone: 'info' },
      { values: ['RET-2038', 'ORD-80291', '38,000 CFA', 'Receipt verified', 'Refund'], tone: 'good' },
      { values: ['RET-2031', 'ORD-80188', '7,900 CFA', 'Condition disputed', 'Review'], tone: 'danger' },
    ],
  },
  settlements: {
    kicker: 'Finance control', title: 'Settlements', description: 'Evaluate eligible merchant payouts and inspect the immutable money ledger.',
    summary: [{ value: '42', label: 'merchants ready' }, { value: '8.4M', label: 'CFA payable' }, { value: '2', label: 'held batches' }],
    columns: ['Batch', 'Merchants', 'Amount', 'Status', 'Action'], rows: [
      { values: ['SET-2026-09-17-A', '42 merchants', '8,420,000 CFA', 'Eligible', 'Evaluate'], tone: 'good' },
      { values: ['SET-2026-09-16-B', '18 merchants', '2,180,500 CFA', 'Held for review', 'Inspect'], tone: 'warning' },
      { values: ['LED-90081', 'Akouvi Market', '418,200 CFA', 'Ledger mismatch', 'Reconcile'], tone: 'danger' },
    ],
  },
  commissions: {
    kicker: 'Merchant finance', title: 'Commission overrides', description: 'Review exceptional merchant rates and record the reason for every change.',
    summary: [{ value: '12', label: 'active overrides' }, { value: '3', label: 'expiring this week' }, { value: '0', label: 'unreviewed changes' }],
    columns: ['Merchant', 'Default rate', 'Override', 'Updated', 'Action'], rows: [
      { values: ['Akouvi Market · MER-418', '12%', '9% · launch period', 'Today · 08:31', 'Edit'], tone: 'info' },
      { values: ['Kara Fresh · MER-377', '12%', '15% · cold chain', 'Yesterday', 'Review'], tone: 'warning' },
      { values: ['Togolese Pantry · MER-392', '12%', 'None', '—', 'Set rate'], tone: 'neutral' },
    ],
  },
  support: {
    kicker: 'Service desk', title: 'Support investigations', description: 'Give agents the context to answer customers and hand off operational problems.',
    summary: [{ value: '14', label: 'open tickets' }, { value: '3', label: 'waiting customer' }, { value: '2', label: 'escalated' }],
    columns: ['Ticket', 'Customer', 'Topic', 'Priority', 'Action'], rows: [
      { values: ['SUP-4421', 'Sena T.', 'Damaged parcel · ORD-80418', 'High', 'Open'], tone: 'danger' },
      { values: ['SUP-4418', 'Koffi E.', 'Pickup code not received', 'Normal', 'Reply'], tone: 'info' },
      { values: ['SUP-4409', 'Ama D.', 'Refund timing', 'Waiting customer', 'Follow up'], tone: 'warning' },
    ],
  },
  users: {
    kicker: 'Access control', title: 'Users and roles', description: 'Manage staff access, sessions, and the boundary between operations and finance.',
    summary: [{ value: '28', label: 'staff accounts' }, { value: '4', label: 'roles' }, { value: '1', label: 'suspicious session' }],
    columns: ['User', 'Role', 'Last sign-in', 'Access', 'Action'], rows: [
      { values: ['Nadia K. · nadia@sequo.tg', 'Operations', 'Today · 09:51', 'Active', 'Edit'], tone: 'good' },
      { values: ['Mawuli S. · mawuli@sequo.tg', 'Support', 'Today · 08:24', 'Active', 'View'], tone: 'info' },
      { values: ['finance@sequo.tg', 'Finance', 'Yesterday · 17:42', 'Review needed', 'Secure'], tone: 'warning' },
    ],
  },
  notifications: {
    kicker: 'Message delivery', title: 'Notifications', description: 'Monitor customer, rider, merchant, and hub messages across push and in-app channels.',
    summary: [{ value: '19', label: 'failed today' }, { value: '98.6%', label: 'delivered' }, { value: '6', label: 'muted events' }],
    columns: ['Event', 'Audience', 'Channel', 'Status', 'Action'], rows: [
      { values: ['DELIVERY_PROBLEM_REPORTED', 'Customer + support', 'Push + inbox', '19 retries', 'Retry'], tone: 'danger' },
      { values: ['RELAY_PARCEL_DELAYED', 'Hub staff', 'Push', 'Delivered', 'Inspect'], tone: 'good' },
      { values: ['RETURN_PIN_CREATED', 'Customer', 'SMS + inbox', 'Delivered', 'View'], tone: 'info' },
    ],
  },
  audit: {
    kicker: 'Traceability', title: 'Audit logs', description: 'Review who changed an operational state, when it happened, and which record was affected.',
    summary: [{ value: '1,842', label: 'events today' }, { value: '0', label: 'tamper alerts' }, { value: '7', label: 'admin actions' }],
    columns: ['Time', 'Actor', 'Event', 'Resource', 'Action'], rows: [
      { values: ['09:51:42', 'Nadia K. · Operations', 'Courier paused', 'RID-2094', 'Inspect'], tone: 'warning' },
      { values: ['09:47:08', 'System policy', 'Payment webhook accepted', 'CHK-18021', 'View'], tone: 'good' },
      { values: ['09:39:15', 'Oreste G. · Admin', 'Refund approved', 'RET-2038', 'Inspect'], tone: 'info' },
    ],
  },
  webhooks: {
    kicker: 'Provider connectivity', title: 'Payment webhooks', description: 'Verify provider events, replay safe failures, and investigate mismatched references.',
    summary: [{ value: '284', label: 'received today' }, { value: '281', label: 'accepted' }, { value: '3', label: 'needs review' }],
    columns: ['Provider event', 'Reference', 'Amount', 'Status', 'Action'], rows: [
      { values: ['Yas Togo · payment.completed', 'PAY-5560', '18,400 CFA', 'Accepted', 'View'], tone: 'good' },
      { values: ['Moov Africa · payment.pending', 'PAY-5557', '9,800 CFA', 'Waiting', 'Monitor'], tone: 'warning' },
      { values: ['Yas Togo · amount mismatch', 'PAY-5549', '42,000 CFA', 'Rejected', 'Investigate'], tone: 'danger' },
    ],
  },
  health: {
    kicker: 'Platform status', title: 'System health', description: 'Check API dependencies before operators trust the dashboard state.',
    summary: [{ value: '99.98%', label: 'API uptime' }, { value: '184 ms', label: 'median latency' }, { value: '0', label: 'open incidents' }],
    columns: ['Service', 'Region', 'Latency', 'Status', 'Action'], rows: [
      { values: ['Sequo API', 'Lomé', '184 ms', 'Healthy', 'Inspect'], tone: 'good' },
      { values: ['Yas Togo webhook', 'Provider edge', '412 ms', 'Degraded', 'Monitor'], tone: 'warning' },
      { values: ['Notification queue', 'Lomé', '—', 'Retrying 19', 'Open'], tone: 'danger' },
    ],
  },
  settings: {
    kicker: 'Workspace preferences', title: 'Settings', description: 'Control your admin profile, display preferences, session security, and operator defaults.',
    summary: [{ value: 'Super admin', label: 'current role' }, { value: 'Dark', label: 'theme' }, { value: '2', label: 'active sessions' }],
    columns: ['Preference', 'Current value', 'Scope', 'Updated', 'Action'], rows: [
      { values: ['Theme', 'Dark', 'This browser', 'Just now', 'Change'], tone: 'info' },
      { values: ['Quick scan on open', 'Enabled', 'Hub workflows', 'Today · 08:12', 'Edit'], tone: 'good' },
      { values: ['Session security', '2 active devices', 'Oreste G.', 'Today · 07:44', 'Review'], tone: 'warning' },
    ],
  },
}

const currentNav = computed<NavItem>(() => navItems.find(i => i.id === activeView.value) ?? navItems[0]!)
const activeWorkspace = computed(() => workspaceConfigs[activeView.value])
const mobileNavItems = computed(() => navItems.filter((item) => ['overview', 'orders', 'missions', 'claims', 'settings'].includes(item.id)))
const filteredOrders = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return orders
  return orders.filter((order) => Object.values(order).some((value) => String(value).toLowerCase().includes(q)))
})
const filteredRows = computed(() => {
  const q = query.value.toLowerCase()
  return tableRows.filter(r => !q || r.primary.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
})
</script>

<template>
  <main class="admin-shell" :class="themeMode">
    <aside class="sidebar">
      <button class="brand-section" @click="activeView = 'overview'">
        <div class="brand-logo">S</div>
        <div class="brand-info">
          <strong>Sequo</strong>
          <small>Admin Command Center</small>
        </div>
      </button>

      <div class="role-box">
        <label for="role-select">Access Role</label>
        <select id="role-select" v-model="activeRole">
          <option>Super admin</option>
          <option>Operations</option>
          <option>Support</option>
          <option>Finance</option>
        </select>
      </div>

      <nav class="nav-links">
        <section v-for="group in navGroups" :key="group.label" class="nav-group">
          <span class="nav-group-label">{{ group.label }}</span>
          <button
              v-for="item in group.items"
              :key="item.id"
              class="nav-btn"
              :class="{ active: activeView === item.id }"
              :title="item.description"
              @click="activeView = item.id"
          >
            <svg viewBox="0 0 24 24"><path :d="item.icon" /></svg>
            <div class="nav-text">
              <strong>{{ item.label }}</strong>
            </div>
            <span v-if="item.count" class="nav-badge">{{ item.count }}</span>
          </button>
        </section>
      </nav>

      <div class="user-profile-card">
        <img class="user-avatar" src="/profile/sample-profile.jpeg" alt="Avatar" />
        <div class="user-details">
          <strong>Oreste G.</strong>
          <small>{{ activeRole }}</small>
        </div>
      </div>
    </aside>

    <nav class="mobile-nav" aria-label="Mobile primary navigation">
      <button
        v-for="item in mobileNavItems"
        :key="item.id"
        class="mobile-nav-btn"
        :class="{ active: activeView === item.id }"
        type="button"
        :aria-label="item.label"
        :aria-current="activeView === item.id ? 'page' : undefined"
        @click="activeView = item.id"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
        <span>{{ item.label }}</span>
        <b v-if="item.count">{{ item.count }}</b>
      </button>
    </nav>

    <div class="workspace">
      <header class="topbar">
        <div class="topbar-titles">
          <span class="eyebrow">Dashboard / {{ activeView }}</span>
          <h1>{{ currentNav.label }}</h1>
        </div>
        <div class="topbar-tools">
          <div class="search-input-wrap">
            <svg viewBox="0 0 24 24"><path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21"/></svg>
            <input v-model="query" type="search" placeholder="Search system..." />
          </div>
          <button class="icon-action-btn" @click="toggleTheme" title="Toggle Theme">
            <svg viewBox="0 0 24 24">
              <path v-if="isDarkMode" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              <path v-else d="M20.4 15.3A8.2 8.2 0 0 1 8.7 3.6 8.4 8.4 0 1 0 20.4 15.3Z" />
            </svg>
          </button>
        </div>
      </header>

      <div class="content-container">
        <section class="command-bar">
          <div>
            <span class="eyebrow">Active Filter State</span>
            <strong>Showing all operational systems</strong>
          </div>
          <div class="filter-pills">
            <button
                v-for="opt in ['All', 'danger', 'warning', 'info', 'good']"
                :key="opt"
                class="pill"
                :class="{ active: selectedRisk === opt }"
                @click="selectedRisk = (opt as any)"
            >
              {{ opt }}
            </button>
          </div>
        </section>

        <section v-if="activeView === 'orders'" class="page-section">
          <div class="section-heading"><div><span class="eyebrow">Daily ledger · cached locally for fast search</span><h2>Orders</h2><p>Search, inspect, and intervene in the live order flow.</p></div><button class="btn-primary">Export orders</button></div>
          <div class="summary-strip"><span><strong>1,284</strong> orders today</span><span><strong>94.2%</strong> delivered on time</span><span><strong>24</strong> need attention</span></div>
          <div class="panel record-panel"><div class="data-table"><div class="table-row table-header"><span>Order</span><span>Route</span><span>Status</span><span>Total</span><span>Updated</span></div><div v-for="row in filteredOrders" :key="row.id" class="table-row"><div><strong>{{ row.id }}</strong><small>{{ row.customer }}</small></div><div>{{ row.route }}</div><div><span class="badge" :class="row.tone">{{ row.status }}</span></div><div>{{ row.total }}</div><div>{{ row.updated }}</div></div></div></div>
        </section>

        <section v-else-if="activeView === 'hubs'" class="page-section">
          <div class="section-heading"><div><span class="eyebrow">Network control</span><h2>Hubs and relay points</h2><p>Watch parcel capacity, locker health, and field visits.</p></div><button class="btn-primary">Add hub</button></div>
          <div class="summary-strip"><span><strong>18</strong> active hubs</span><span><strong>72%</strong> network capacity</span><span><strong>3</strong> require attention</span></div>
          <div class="panel record-panel"><div class="data-table"><div class="table-row table-header"><span>Hub</span><span>City</span><span>Parcels</span><span>Capacity</span><span>Status</span></div><div v-for="row in hubs" :key="row.name" class="table-row"><div><strong>{{ row.name }}</strong><small>{{ row.updated }}</small></div><div>{{ row.city }}</div><div>{{ row.parcels }}</div><div>{{ row.capacity }}</div><div><span class="badge" :class="row.tone">{{ row.status }}</span></div></div></div></div>
        </section>

        <section v-else-if="activeView === 'shops'" class="page-section">
          <div class="section-heading"><div><span class="eyebrow">Commerce network</span><h2>Online shops</h2><p>Manage merchant storefronts and their order readiness.</p></div><button class="btn-primary">Invite shop</button></div>
          <div class="panel record-panel"><div class="data-table"><div class="table-row table-header"><span>Shop</span><span>Owner</span><span>Orders</span><span>Status</span><span>Updated</span></div><div v-for="row in shops" :key="row.owner" class="table-row"><div><strong>{{ row.name }}</strong></div><div>{{ row.owner }}</div><div>{{ row.orders }}</div><div><span class="badge" :class="row.tone">{{ row.status }}</span></div><div>{{ row.updated }}</div></div></div></div>
        </section>

        <section v-else-if="activeView === 'repairs'" class="page-section">
          <div class="section-heading"><div><span class="eyebrow">Asset care queue</span><h2>Repairs and damaged assets</h2><p>Turn field declarations into inspections, parts, and resolved work.</p></div><button class="btn-primary">Create work order</button></div>
          <div class="panel record-panel"><div class="data-table"><div class="table-row table-header"><span>Asset</span><span>Issue</span><span>Status</span><span>Owner</span><span>Updated</span></div><div v-for="row in repairs" :key="row.asset" class="table-row"><div><strong>{{ row.asset }}</strong><small>{{ row.location }}</small></div><div>{{ row.issue }}</div><div><span class="badge" :class="row.tone">{{ row.status }}</span></div><div>{{ row.owner }}</div><div>{{ row.updated }}</div></div></div></div>
        </section>

        <section v-else-if="activeView === 'claims'" class="page-section">
          <div class="section-heading"><div><span class="eyebrow">Customer care</span><h2>Claims and problems</h2><p>Review evidence, assign ownership, and keep customers informed.</p></div><button class="btn-primary">New claim</button></div>
          <div class="panel record-panel"><div class="data-table"><div class="table-row table-header"><span>Claim</span><span>Problem</span><span>Order</span><span>Status</span><span>Age</span></div><div v-for="row in claims" :key="row.id" class="table-row"><div><strong>{{ row.id }}</strong><small>{{ row.customer }}</small></div><div>{{ row.issue }}</div><div>{{ row.order }}</div><div><span class="badge" :class="row.tone">{{ row.status }}</span></div><div>{{ row.age }}</div></div></div></div>
        </section>

        <section v-else-if="activeView === 'customers'" class="page-section">
          <div class="section-heading"><div><span class="eyebrow">Customer directory</span><h2>Customers</h2><p>See account health, order history, and open problems.</p></div><button class="btn-primary">Export directory</button></div>
          <div class="panel record-panel"><div class="data-table"><div class="table-row table-header"><span>Customer</span><span>Orders</span><span>Account</span><span>Last seen</span><span>Action</span></div><div v-for="row in customers" :key="row.id" class="table-row"><div><strong>{{ row.name }}</strong><small>{{ row.id }}</small></div><div>{{ row.orders }}</div><div><span class="badge" :class="row.tone">{{ row.status }}</span></div><div>{{ row.lastSeen }}</div><div><button class="btn-primary compact-button">Open</button></div></div></div></div>
        </section>

        <section v-else-if="activeWorkspace" class="page-section workspace-page">
          <div class="section-heading"><div><span class="eyebrow">{{ activeWorkspace.kicker }}</span><h2>{{ activeWorkspace.title }}</h2><p>{{ activeWorkspace.description }}</p></div><div class="heading-actions"><button class="btn-secondary">Export</button><button class="btn-primary">Add record</button></div></div>
          <div class="summary-strip"><span v-for="item in activeWorkspace.summary" :key="item.label"><strong>{{ item.value }}</strong> {{ item.label }}</span></div>
          <div class="panel record-panel workspace-table"><div class="data-table"><div class="table-row table-header"><span v-for="column in activeWorkspace.columns" :key="column">{{ column }}</span></div><div v-for="row in activeWorkspace.rows" :key="row.values[0]" class="table-row"><div v-for="(value, index) in row.values" :key="`${row.values[0]}-${index}`"><span v-if="index === 2" class="badge" :class="row.tone">{{ value }}</span><button v-else-if="index === row.values.length - 1" class="btn-primary compact-button">{{ value }}</button><span v-else>{{ value }}</span></div></div></div></div>
        </section>

        <section v-if="activeView === 'overview'" class="bento-metrics">
          <article v-for="m in metrics" :key="m.label" class="bento-card">
            <header>
              <span>{{ m.label }}</span>
              <span class="status-dot" :class="m.tone"></span>
            </header>
            <strong>{{ m.value }}</strong>
            <p>{{ m.detail }}</p>
          </article>
        </section>

        <div v-if="activeView === 'overview'" class="grid-split">
          <section class="panel">
            <div class="panel-header">
              <h2>Operational Feed</h2>
              <button class="btn-primary">Export Logs</button>
            </div>
            <div class="data-table">
              <div class="table-row table-header">
                <span>Record</span>
                <span>Status</span>
                <span>Owner</span>
                <span>Updated</span>
                <span>Action</span>
              </div>
              <div v-for="row in filteredRows" :key="row.id" class="table-row">
                <div><strong>{{ row.primary }}</strong><small style="color:var(--text-muted);display:block;">{{ row.id }}</small></div>
                <div><span class="badge" :class="row.tone">{{ row.status }}</span></div>
                <div>{{ row.owner }}</div>
                <div>{{ row.updated }}</div>
                <div><button class="btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">Inspect</button></div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2>Quick Actions</h2>
            </div>
            <div class="action-list">
              <div v-for="item in workItems" :key="item.id" class="action-row">
                <div>
                  <strong style="font-size: 0.85rem; display:block;">{{ item.title }}</strong>
                  <small style="color: var(--text-muted);">{{ item.id }} · {{ item.status }}</small>
                </div>
                <button class="btn-primary" style="background:var(--surface-hover); color:var(--text); border:1px solid var(--border);">{{ item.action }}</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </main>
</template>
