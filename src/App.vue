<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type ViewId =
  | 'overview'
  | 'operations'
  | 'profiles'
  | 'deliveries'
  | 'hubs'
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
  shortLabel: string
  description: string
  icon: string
  count?: number
}

type Metric = {
  label: string
  value: string
  detail: string
  tone: StatusTone
  trend: string
}

type WorkItem = {
  id: string
  title: string
  owner: string
  status: string
  risk: StatusTone
  action: string
  route: string
}

type TableRow = {
  id: string
  primary: string
  secondary: string
  status: string
  statusTone: StatusTone
  owner: string
  updated: string
  nextAction: string
}

type ActionRule = {
  title: string
  endpoint: string
  roles: Role[]
  requirement: string
}

const themeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Light MC', value: 'light-medium-contrast' },
  { label: 'Dark MC', value: 'dark-medium-contrast' },
  { label: 'Light HC', value: 'light-high-contrast' },
  { label: 'Dark HC', value: 'dark-high-contrast' },
]

const savedThemeMode = typeof window === 'undefined' ? null : window.localStorage.getItem('sequo-admin-theme')
const initialThemeMode = themeOptions.some((theme) => theme.value === savedThemeMode) ? (savedThemeMode as ThemeMode) : 'dark'

const activeView = ref<ViewId>('overview')
const activeRole = ref<Role>('Super admin')
const query = ref('')
const selectedRisk = ref<'All' | StatusTone>('All')
const themeMode = ref<ThemeMode>(initialThemeMode)

const isDarkMode = computed(() => themeMode.value.startsWith('dark'))

function toggleTheme() {
  themeMode.value = isDarkMode.value ? 'light' : 'dark'
}

watch(themeMode, (mode) => {
  window.localStorage.setItem('sequo-admin-theme', mode)
})

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Home', description: 'Live health', icon: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h3A1.5 1.5 0 0 1 10 5.5v3A1.5 1.5 0 0 1 8.5 10h-3A1.5 1.5 0 0 1 4 8.5v-3Zm10 0A1.5 1.5 0 0 1 15.5 4h3A1.5 1.5 0 0 1 20 5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 14 8.5v-3ZM4 15.5A1.5 1.5 0 0 1 5.5 14h3a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3Zm10 0a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z' },
  { id: 'operations', label: 'Operations', shortLabel: 'Ops', description: 'Queues and actions', icon: 'M3 12h4l2-6 4 12 2-6h6', count: 8 },
  { id: 'profiles', label: 'Profiles', shortLabel: 'Profiles', description: 'Activate and validate', icon: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8.5 10v-2.2a3.4 3.4 0 0 0-2-3.1m.5-12.4a4 4 0 0 1 0 7.8' },
  { id: 'deliveries', label: 'Deliveries', shortLabel: 'Delivery', description: 'Missions and riders', icon: 'M3 7h11v8H3V7Zm11 3h3l4 4v1h-7v-5ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', count: 5 },
  { id: 'hubs', label: 'Hubs and Relay', shortLabel: 'Hubs', description: 'Parcels, lockers, control', icon: 'M4 21V9l8-6 8 6v12H4Zm5 0v-7h6v7M8 10h.01M12 10h.01M16 10h.01' },
  { id: 'returns', label: 'Returns', shortLabel: 'Returns', description: 'Receipts and refunds', icon: 'M3 7h11a5 5 0 1 1 0 10H8m0 0 3-3m-3 3 3 3' },
  { id: 'settlements', label: 'Settlements', shortLabel: 'Money', description: 'Payouts and commissions', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6' },
  { id: 'notifications', label: 'Notifications', shortLabel: 'Inbox', description: 'Outbox and inbox', icon: 'M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4' },
  { id: 'support', label: 'Support', shortLabel: 'Support', description: 'Investigations', icon: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z' },
  { id: 'users', label: 'Users and Roles', shortLabel: 'Users', description: 'Sessions, permissions', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'audit', label: 'Audit Logs', shortLabel: 'Audit', description: 'Traceability', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'settings', label: 'Profile and Settings', shortLabel: 'Profile', description: 'Account, logout, controls', icon: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Zm8.5-3.5a7.8 7.8 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a8.8 8.8 0 0 0-2-1.2L15.7 3h-4l-.4 2.6a8.8 8.8 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7.8 7.8 0 0 0 6.8 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a8.8 8.8 0 0 0 2 1.2l.4 2.6h4l.4-2.6a8.8 8.8 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z' },
]

const metrics: Metric[] = [
  { label: 'Active missions', value: '184', detail: '23 delayed beyond SLA', tone: 'warning', trend: '+12 since 09:00' },
  { label: 'Pending validations', value: '47', detail: 'Profiles waiting for staff review', tone: 'info', trend: '18 merchants, 21 riders' },
  { label: 'Return bottlenecks', value: '11', detail: 'Refund blocked until receipt', tone: 'danger', trend: '3 high value' },
  { label: 'Payout queue', value: '8.4M CFA', detail: 'Ready for finance evaluation', tone: 'good', trend: '42 merchants' },
  { label: 'Notification failures', value: '19', detail: 'FCM retry queue', tone: 'warning', trend: 'Retrying safely' },
  { label: 'Paused couriers', value: '16', detail: 'Capacity below threshold in Lome', tone: 'danger', trend: '-9% capacity' },
]

const workItems: WorkItem[] = [
  { id: 'SQ-MSN-8821', title: 'Cancel stale mission offer', owner: 'Operations', status: 'Courier unresponsive', risk: 'danger', action: 'Cancel mission', route: '/api/delivery/missions/{missionId}/cancel' },
  { id: 'RID-2094', title: 'Pause rider after repeated failed PIN attempts', owner: 'Operations', status: 'Risk review', risk: 'danger', action: 'Pause rider', route: '/api/delivery/missions/couriers/pause' },
  { id: 'MER-418', title: 'Validate merchant profile and commission setup', owner: 'Merchant ops', status: 'KYC complete', risk: 'info', action: 'Activate profile', route: '/api/commissions/merchant-overrides/{merchantId}' },
  { id: 'RET-1172', title: 'Confirm physical return receipt', owner: 'Support', status: 'At Sequo hub', risk: 'warning', action: 'Confirm receipt', route: '/api/returns/{returnId}/physical-receipt' },
  { id: 'PAY-5560', title: 'Evaluate eligible merchant payouts', owner: 'Finance', status: 'Ready', risk: 'good', action: 'Evaluate payout', route: '/api/settlements/merchant-payouts/evaluate-eligible' },
]

const rows: Record<ViewId, TableRow[]> = {
  overview: [
    { id: 'MON-001', primary: 'Operations monitoring snapshot', secondary: 'Delivery, relay, notification, payout, and return health', status: 'Live', statusTone: 'good', owner: 'Admin', updated: 'Just now', nextAction: 'Refresh monitoring' },
    { id: 'VAL-047', primary: 'Profiles awaiting validation', secondary: 'Merchants, riders, hubs, and account cancellation requests', status: 'Needs review', statusTone: 'info', owner: 'Operations', updated: '11 min ago', nextAction: 'Open profiles' },
    { id: 'RISK-016', primary: 'Paused couriers affecting capacity', secondary: 'Lome availability below threshold', status: 'Capacity risk', statusTone: 'danger', owner: 'Operations', updated: '16 min ago', nextAction: 'Review riders' },
  ],
  operations: [
    { id: 'OPS-301', primary: 'Delivery shortfall in Lome North', secondary: 'Capacity under alert threshold for 38 minutes', status: 'Escalated', statusTone: 'danger', owner: 'Operations', updated: '2 min ago', nextAction: 'Reassign pooled missions' },
    { id: 'OPS-302', primary: 'Overdue merchant sub-orders', secondary: '14 packed late, 6 not accepted', status: 'SLA risk', statusTone: 'warning', owner: 'Merchant ops', updated: '8 min ago', nextAction: 'Publish overdue notices' },
    { id: 'OPS-303', primary: 'Relay parcel storage fees', secondary: 'Eligible assessment batch waiting', status: 'Ready', statusTone: 'good', owner: 'Hubs', updated: '21 min ago', nextAction: 'Assess fees' },
  ],
  profiles: [
    { id: 'MER-418', primary: 'Akouvi Market Store', secondary: 'Merchant profile, documents verified', status: 'Needs activation', statusTone: 'info', owner: 'Merchant ops', updated: '11 min ago', nextAction: 'Activate merchant' },
    { id: 'RID-2094', primary: 'Kossi A.', secondary: 'Courier profile flagged by support', status: 'Validate or cancel', statusTone: 'warning', owner: 'Operations', updated: '34 min ago', nextAction: 'Review rider' },
    { id: 'HUB-044', primary: 'Agoe Relay Partner', secondary: 'Opening hours and locker capacity submitted', status: 'Pending validation', statusTone: 'neutral', owner: 'Hubs', updated: '1 h ago', nextAction: 'Validate hub' },
    { id: 'CUS-9021', primary: 'Customer deletion request', secondary: 'Confirmation received, operational records retained', status: 'Restricted', statusTone: 'danger', owner: 'Support', updated: '2 h ago', nextAction: 'Approve cancellation' },
  ],
  deliveries: [
    { id: 'SQ-MSN-8821', primary: 'Merchant pickup to relay hub', secondary: 'Courier offer expired twice', status: 'Stale', statusTone: 'danger', owner: 'Operations', updated: '4 min ago', nextAction: 'Cancel or reassign' },
    { id: 'SQ-MSN-8809', primary: 'Direct delivery with problem report', secondary: 'Customer unavailable, proof redacted', status: 'Problem', statusTone: 'warning', owner: 'Support', updated: '19 min ago', nextAction: 'Resolve problem' },
    { id: 'SQ-MSN-8794', primary: 'Packed merchant sub-orders', secondary: 'Ready for dispatch batch', status: 'Ready', statusTone: 'good', owner: 'Operations', updated: '26 min ago', nextAction: 'Dispatch ready' },
  ],
  hubs: [
    { id: 'HUB-044', primary: 'Agoe Relay', secondary: 'Locker intake near capacity', status: 'Intake paused', statusTone: 'warning', owner: 'Hubs', updated: '13 min ago', nextAction: 'Update control state' },
    { id: 'PAR-771', primary: 'Relay parcel delayed', secondary: 'Storage fee assessment eligible', status: 'Delayed', statusTone: 'danger', owner: 'Hubs', updated: '45 min ago', nextAction: 'Assess fee' },
    { id: 'LOCK-14', primary: 'Locker maintenance', secondary: 'Door marked jammed by partner staff', status: 'Maintenance', statusTone: 'neutral', owner: 'Hubs', updated: '1 h ago', nextAction: 'Review availability' },
  ],
  returns: [
    { id: 'RET-1172', primary: 'Return awaiting physical receipt', secondary: 'Relay drop-off completed', status: 'Receipt needed', statusTone: 'warning', owner: 'Support', updated: '7 min ago', nextAction: 'Confirm receipt' },
    { id: 'RET-1168', primary: 'Refund pending finance', secondary: 'Receipt confirmed, amount 18,500 CFA', status: 'Refund ready', statusTone: 'good', owner: 'Finance', updated: '31 min ago', nextAction: 'Trigger refund' },
    { id: 'RET-1164', primary: 'Return outside 72 hour window', secondary: 'Admin override requested', status: 'Exception', statusTone: 'danger', owner: 'Support', updated: '54 min ago', nextAction: 'Review policy' },
  ],
  settlements: [
    { id: 'PAY-5560', primary: 'Merchant payout batch', secondary: '42 merchants eligible', status: 'Ready', statusTone: 'good', owner: 'Finance', updated: '9 min ago', nextAction: 'Evaluate eligible' },
    { id: 'LED-902', primary: 'Settlement ledger lookup', secondary: 'Source order SQ-77144', status: 'Investigating', statusTone: 'info', owner: 'Finance', updated: '24 min ago', nextAction: 'Open ledger' },
    { id: 'COM-118', primary: 'Commission override request', secondary: 'Reduce to 650 bps with reason', status: 'Approval needed', statusTone: 'warning', owner: 'Finance', updated: '1 h ago', nextAction: 'Set override' },
  ],
  notifications: [
    { id: 'FCM-410', primary: 'Outbox failure spike', secondary: 'SEQUO_RIDER push failures', status: 'Retrying', statusTone: 'warning', owner: 'Platform', updated: '5 min ago', nextAction: 'Inspect failures' },
    { id: 'MSG-880', primary: 'Unread support notices', secondary: 'High-priority return events', status: 'Unread', statusTone: 'info', owner: 'Support', updated: '17 min ago', nextAction: 'Open inbox' },
    { id: 'PREF-74', primary: 'Admin notification preference audit', secondary: 'Quiet hours changed', status: 'Recorded', statusTone: 'neutral', owner: 'Admin', updated: '2 h ago', nextAction: 'Review audit' },
  ],
  support: [
    { id: 'CASE-781', primary: 'Customer cannot release relay parcel', secondary: 'Identity verification required', status: 'Open', statusTone: 'warning', owner: 'Support', updated: '12 min ago', nextAction: 'Resolve scan' },
    { id: 'CASE-778', primary: 'Payment webhook mismatch', secondary: 'Provider amount does not match pending checkout', status: 'Escalated', statusTone: 'danger', owner: 'Support', updated: '28 min ago', nextAction: 'Investigate order' },
    { id: 'CASE-772', primary: 'Merchant rejection dispute', secondary: 'Perishable category policy', status: 'Reviewing', statusTone: 'info', owner: 'Merchant ops', updated: '1 h ago', nextAction: 'Open timeline' },
  ],
  users: [
    { id: 'USR-801', primary: 'Finance admin session', secondary: 'New device in Lome', status: 'Active', statusTone: 'good', owner: 'Security', updated: '6 min ago', nextAction: 'Review sessions' },
    { id: 'USR-773', primary: 'Support role change', secondary: 'Temporary access expiring today', status: 'Expiring', statusTone: 'warning', owner: 'Super admin', updated: '43 min ago', nextAction: 'Update role' },
    { id: 'USR-701', primary: 'Revoked refresh session', secondary: 'Logout-all completed', status: 'Revoked', statusTone: 'neutral', owner: 'Security', updated: '2 h ago', nextAction: 'Open audit' },
  ],
  audit: [
    { id: 'AUD-9931', primary: 'Courier paused', secondary: 'RID-2094, reason captured', status: 'Audited', statusTone: 'good', owner: 'Operations', updated: '3 min ago', nextAction: 'View details' },
    { id: 'AUD-9928', primary: 'Commission override edited', secondary: 'MER-418, 650 bps', status: 'High risk', statusTone: 'warning', owner: 'Finance', updated: '22 min ago', nextAction: 'Review reason' },
    { id: 'AUD-9914', primary: 'Hub control state changed', secondary: 'HUB-044 intake paused', status: 'Audited', statusTone: 'good', owner: 'Hubs', updated: '1 h ago', nextAction: 'Open history' },
  ],
  settings: [
    { id: 'ME-001', primary: 'Oreste G.', secondary: 'Signed in as Super admin', status: 'Active', statusTone: 'good', owner: 'Account', updated: 'Now', nextAction: 'Open profile' },
    { id: 'SEC-002', primary: 'Logout and session controls', secondary: 'Revoke current session or logout from all devices', status: 'Protected', statusTone: 'warning', owner: 'Security', updated: 'Available', nextAction: 'Log out' },
    { id: 'CFG-03', primary: 'Permission display', secondary: 'Frontend mirrors backend roles', status: 'Visible', statusTone: 'info', owner: 'Admin', updated: 'Always', nextAction: 'Test forbidden state' },
  ],
}

const actionRules: ActionRule[] = [
  { title: 'Activate, validate, or cancel profiles', endpoint: 'Auth, role, merchant, rider, and hub admin APIs', roles: ['Super admin', 'Operations', 'Support'], requirement: 'Show submitted evidence, require staff reason, and keep a visible audit trail.' },
  { title: 'Pause or unpause riders', endpoint: '/api/delivery/missions/couriers/pause', roles: ['Super admin', 'Operations'], requirement: 'Require reason, optional pausedUntil, and warn about delivery capacity.' },
  { title: 'Cancel or reassign missions', endpoint: '/api/delivery/missions/{missionId}/cancel', roles: ['Super admin', 'Operations'], requirement: 'Show mission, customer impact, merchant impact, and courier assignment.' },
  { title: 'Confirm return receipt', endpoint: '/api/returns/{returnId}/physical-receipt', roles: ['Super admin', 'Support'], requirement: 'Require condition, responsibility, and idempotency key.' },
  { title: 'Trigger refunds and payouts', endpoint: '/api/returns/{returnId}/refund', roles: ['Super admin', 'Finance'], requirement: 'Display amount in integer CFA and require finance confirmation.' },
  { title: 'Set commission overrides', endpoint: '/api/commissions/merchant-overrides/{merchantId}', roles: ['Super admin', 'Finance'], requirement: 'Require basis points, reason, before/after preview, and approval marker.' },
]

const currentNav = computed(() => navItems.find((item) => item.id === activeView.value) ?? navItems[0]!)
const currentRows = computed(() => rows[activeView.value])
const filteredRows = computed(() => {
  const searchTerm = query.value.trim().toLowerCase()

  return currentRows.value.filter((row) => {
    const riskMatches = selectedRisk.value === 'All' || row.statusTone === selectedRisk.value
    const searchMatches =
      !searchTerm ||
      [row.id, row.primary, row.secondary, row.status, row.owner, row.nextAction].some((value) =>
        value.toLowerCase().includes(searchTerm),
      )

    return riskMatches && searchMatches
  })
})

const allowedActionRules = computed(() =>
  actionRules.map((rule) => ({
    ...rule,
    allowed: rule.roles.includes(activeRole.value),
  })),
)

const visibleMetrics = computed(() => metrics.filter((metric) => selectedRisk.value === 'All' || metric.tone === selectedRisk.value))
const visibleWorkItems = computed(() =>
  workItems.filter((item) => {
    const riskMatches = selectedRisk.value === 'All' || item.risk === selectedRisk.value
    const searchTerm = query.value.trim().toLowerCase()
    const searchMatches =
      !searchTerm ||
      [item.id, item.title, item.owner, item.status, item.action, item.route].some((value) =>
        value.toLowerCase().includes(searchTerm),
      )

    return riskMatches && searchMatches
  }),
)

const openView = (view: ViewId) => {
  activeView.value = view
}

const riskOptions: Array<'All' | StatusTone> = ['All', 'danger', 'warning', 'info', 'good', 'neutral']
const bottomNav = navItems.filter((item) => ['overview', 'operations', 'profiles', 'deliveries', 'settings'].includes(item.id))
</script>

<template>
  <main class="admin-shell" :class="themeMode">
    <aside class="sidebar" aria-label="Sequo admin navigation">
      <button class="brand" type="button" @click="openView('overview')" aria-label="Open overview">
        <span class="brand-mark">S</span>
        <span>
          <strong>Sequo</strong>
          <small>Admin operations</small>
        </span>
      </button>

      <div class="role-switcher">
        <label for="role">Active role</label>
        <select id="role" v-model="activeRole">
          <option>Super admin</option>
          <option>Operations</option>
          <option>Support</option>
          <option>Finance</option>
        </select>
      </div>

      <nav class="nav-list" aria-label="Primary">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeView === item.id }"
          type="button"
          @click="openView(item.id)"
        >
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon"></path>
            </svg>
          </span>
          <span class="nav-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <span v-if="item.count" class="nav-count">{{ item.count }}</span>
        </button>
      </nav>

      <section class="session-card" aria-label="Signed in profile">
        <img class="avatar avatar-photo" src="/profile/sample-profile.jpeg" alt="Oreste G. profile photo" />
        <div>
          <strong>Oreste G.</strong>
          <small>{{ activeRole }}</small>
        </div>
        <button class="icon-button" type="button" aria-label="Log out">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5M15 12H3M21 4v16h-7"></path>
          </svg>
        </button>
      </section>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">Private internal dashboard</span>
          <h1>{{ currentNav.label }}</h1>
        </div>

        <div class="topbar-actions">
          <label class="search-box" for="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21"></path>
            </svg>
            <input id="search" v-model="query" type="search" placeholder="Search operations" />
          </label>
          <button
            class="theme-switch"
            type="button"
            :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
            :title="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme"
          >
            <svg v-if="isDarkMode" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.4 15.3A8.2 8.2 0 0 1 8.7 3.6 8.4 8.4 0 1 0 20.4 15.3Z"></path>
            </svg>
          </button>
          <button class="profile-button" type="button">
            <img class="avatar avatar-photo" src="/profile/sample-profile.jpeg" alt="Oreste G. profile photo" />
            <span>
              <strong>Profile</strong>
              <small>Logout menu</small>
            </span>
          </button>
        </div>
      </header>

      <section class="page-content">
        <section class="command-strip" aria-label="Operational controls">
          <div>
            <span class="eyebrow">API source</span>
            <strong>GET /api/admin/monitoring/operations</strong>
            <p>Use live monitoring first, then drill into mission, hub, return, settlement, and user workflows.</p>
          </div>
          <div class="filters" aria-label="Risk filter">
            <button
              v-for="option in riskOptions"
              :key="option"
              class="filter-button"
              :class="{ active: selectedRisk === option }"
              type="button"
              @click="selectedRisk = option"
            >
              {{ option }}
            </button>
          </div>
        </section>

        <section v-if="activeView === 'settings'" class="panel settings-panel" aria-label="Profile and display settings">
          <div class="settings-profile">
            <img class="settings-photo avatar-photo" src="/profile/sample-profile.jpeg" alt="Oreste G. profile photo" />
            <div>
              <span class="eyebrow">Signed in</span>
              <h2>Oreste G.</h2>
              <p>{{ activeRole }} · Profile, theme, and session controls.</p>
            </div>
          </div>

          <div class="theme-nest">
            <div>
              <span class="eyebrow">Display</span>
              <h3>Interface mode</h3>
              <p>Uses the replaceable theme-builder files in <code>src/assets/theme-builder</code>.</p>
            </div>
            <div class="theme-options" role="radiogroup" aria-label="Interface theme">
              <button
                v-for="theme in themeOptions"
                :key="theme.value"
                class="theme-option"
                :class="{ active: themeMode === theme.value }"
                type="button"
                role="radio"
                :aria-checked="themeMode === theme.value"
                @click="themeMode = theme.value"
              >
                <span>{{ theme.label }}</span>
              </button>
            </div>
          </div>
        </section>

        <section class="metric-grid" aria-label="Operations health">
          <article v-for="metric in visibleMetrics" :key="metric.label" class="metric-card" :class="metric.tone">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <p>{{ metric.detail }}</p>
            <small>{{ metric.trend }}</small>
          </article>
        </section>

        <section class="main-grid">
          <article class="panel action-panel">
            <div class="panel-head">
              <div>
                <span class="eyebrow">Action queue</span>
                <h2>Validate, activate, cancel, and recover safely</h2>
              </div>
              <button class="primary-button" type="button">Refresh</button>
            </div>

            <div class="work-list">
              <article v-for="item in visibleWorkItems" :key="item.id" class="work-item" :class="item.risk">
                <div>
                  <span class="record-id">{{ item.id }}</span>
                  <h3>{{ item.title }}</h3>
                  <p>{{ item.status }} · {{ item.owner }}</p>
                  <code>{{ item.route }}</code>
                </div>
                <button class="row-action" type="button">{{ item.action }}</button>
              </article>
            </div>
          </article>

          <aside class="panel safety-panel">
            <span class="eyebrow">Safe actions</span>
            <h2>Every risky mutation needs a reason</h2>
            <p>
              Dangerous operations should show the affected record, consequences, role permission,
              explicit confirmation, idempotency where required, and a visible audit trail.
            </p>

            <div class="rule-list">
              <article v-for="rule in allowedActionRules" :key="rule.title" class="rule-item" :class="{ disabled: !rule.allowed }">
                <span>{{ rule.allowed ? 'Allowed' : 'Forbidden for role' }}</span>
                <strong>{{ rule.title }}</strong>
                <small>{{ rule.requirement }}</small>
              </article>
            </div>
          </aside>
        </section>

        <section class="panel table-panel">
          <div class="panel-head table-head">
            <div>
              <span class="eyebrow">{{ currentNav.description }}</span>
              <h2>{{ currentNav.label }} records</h2>
            </div>
            <div class="table-tools">
              <button class="secondary-button" type="button">Export</button>
              <button class="primary-button" type="button">Create action</button>
            </div>
          </div>

          <div class="data-table" role="table" :aria-label="`${currentNav.label} table`">
            <div class="table-row table-header" role="row">
              <span role="columnheader">Record</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Owner</span>
              <span role="columnheader">Updated</span>
              <span role="columnheader">Next action</span>
            </div>
            <div v-for="row in filteredRows" :key="row.id" class="table-row" role="row">
              <span role="cell">
                <strong>{{ row.primary }}</strong>
                <small>{{ row.id }} · {{ row.secondary }}</small>
              </span>
              <span role="cell">
                <span class="status-chip" :class="row.statusTone">{{ row.status }}</span>
              </span>
              <span role="cell">{{ row.owner }}</span>
              <span role="cell">{{ row.updated }}</span>
              <span role="cell">
                <button class="inline-action" type="button">{{ row.nextAction }}</button>
              </span>
            </div>
            <div v-if="filteredRows.length === 0" class="empty-state">
              No records match the current filters.
            </div>
          </div>
        </section>
      </section>
    </section>

    <nav class="bottom-nav" aria-label="Mobile admin navigation">
      <button
        v-for="item in bottomNav"
        :key="item.id"
        class="bottom-nav-item"
        :class="{ active: activeView === item.id }"
        type="button"
        @click="openView(item.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path :d="item.icon"></path>
        </svg>
        <span>{{ item.shortLabel }}</span>
      </button>
    </nav>
  </main>
</template>
