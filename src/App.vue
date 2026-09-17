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
  description: string
  icon: string
  count?: number
}

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
  { id: 'operations', label: 'Operations', description: 'Queues and actions', icon: 'M3 12h4l2-6 4 12 2-6h6', count: 8 },
  { id: 'profiles', label: 'Profiles', description: 'Activate and validate', icon: 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { id: 'deliveries', label: 'Deliveries', description: 'Missions and riders', icon: 'M3 7h11v8H3V7Zm11 3h3l4 4v1h-7v-5Z', count: 5 },
  { id: 'hubs', label: 'Hubs & Relay', description: 'Parcels and lockers', icon: 'M4 21V9l8-6 8 6v12H4Zm5 0v-7h6v7' },
  { id: 'returns', label: 'Returns', description: 'Receipts and refunds', icon: 'M3 7h11a5 5 0 1 1 0 10H8' },
  { id: 'settlements', label: 'Settlements', description: 'Payouts and finance', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6' },
  { id: 'support', label: 'Support', description: 'Investigations', icon: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z' },
  { id: 'settings', label: 'Settings', description: 'Preferences', icon: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z' },
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

const currentNav = computed<NavItem>(() => navItems.find(i => i.id === activeView.value) ?? navItems[0]!)
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
        <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-btn"
            :class="{ active: activeView === item.id }"
            @click="activeView = (item.id as ViewId)"
        >
          <svg viewBox="0 0 24 24"><path :d="item.icon" /></svg>
          <div class="nav-text">
            <strong>{{ item.label }}</strong>
          </div>
          <span v-if="item.count" class="nav-badge">{{ item.count }}</span>
        </button>
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
        v-for="item in navItems"
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

        <section class="bento-metrics">
          <article v-for="m in metrics" :key="m.label" class="bento-card">
            <header>
              <span>{{ m.label }}</span>
              <span class="status-dot" :class="m.tone"></span>
            </header>
            <strong>{{ m.value }}</strong>
            <p>{{ m.detail }}</p>
          </article>
        </section>

        <div class="grid-split">
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
