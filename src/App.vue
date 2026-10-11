<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type SectionId =
  | 'dashboard'
  | 'users'
  | 'merchants'
  | 'orders'
  | 'deliveries'
  | 'payments'
  | 'commissions'
  | 'relay'
  | 'settings'

type Section = {
  id: SectionId
  label: string
  endpoint: string
  readiness: 'Live API' | 'Mock until wired' | 'Read-only'
  description: string
}

type RoleCode =
  | 'CUSTOMER'
  | 'MERCHANT_OWNER'
  | 'MERCHANT_STAFF'
  | 'COURIER'
  | 'RELAY_PARTNER'
  | 'SUPPORT_AGENT'
  | 'ADMIN'
  | 'SUPER_ADMIN'

type CurrentUser = {
  id: string
  email?: string | null
  phoneNumber?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  provider: string
  status: string
  active: boolean
  roles: RoleCode[]
}

type AuthTokens = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

const apiBaseUrl = import.meta.env.VITE_SEQUO_API_BASE_URL ?? 'http://localhost:8080'
const activeSection = ref<SectionId>('dashboard')
const email = ref('')
const accessToken = ref('')
const refreshToken = ref('')
const currentUser = ref<CurrentUser | null>(null)
const authError = ref('')
const authLoading = ref(false)
const deviceId = getOrCreateDeviceId()
const isAdmin = computed(() => Boolean(currentUser.value?.active && currentUser.value.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')))
const isAuthenticated = computed(() => Boolean(accessToken.value.trim() && isAdmin.value))

const sections: Section[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    endpoint: '/api/admin/web/overview',
    readiness: 'Live API',
    description: 'Operational totals and links for the internal admin workspace.',
  },
  {
    id: 'users',
    label: 'Users',
    endpoint: '/api/admin/web/users',
    readiness: 'Read-only',
    description: 'Admin-safe account list without password hashes, OAuth tokens, or secrets.',
  },
  {
    id: 'merchants',
    label: 'Merchants',
    endpoint: '/api/admin/web/merchants',
    readiness: 'Read-only',
    description: 'Merchant profile and commission context for support and operations.',
  },
  {
    id: 'orders',
    label: 'Orders',
    endpoint: '/api/admin/web/orders',
    readiness: 'Read-only',
    description: 'Customer order status, totals, payment status, and fulfillment priority.',
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    endpoint: '/api/admin/web/deliveries',
    readiness: 'Live API',
    description: 'Delivery missions and merchant sub-order counts for dispatch decisions.',
  },
  {
    id: 'payments',
    label: 'Payments',
    endpoint: '/api/admin/web/payments',
    readiness: 'Read-only',
    description: 'Merchant payout accruals and sanitized payment webhook history.',
  },
  {
    id: 'commissions',
    label: 'Commissions',
    endpoint: '/api/admin/web/commissions',
    readiness: 'Live API',
    description: 'Default commission and merchant overrides; mutation remains in API-specific routes.',
  },
  {
    id: 'relay',
    label: 'Relay points',
    endpoint: '/api/admin/web/relay',
    readiness: 'Read-only',
    description: 'Relay parcels and storage-fee assessment count for relay operations.',
  },
  {
    id: 'settings',
    label: 'Settings',
    endpoint: '/api/admin/web/business-parameters',
    readiness: 'Live API',
    description: 'Contract MVP business parameters: delivery pricing, commissions, returns, relay policy references.',
  },
]

const defaultSection = sections[0] as Section
const active = computed<Section>(() => sections.find((section) => section.id === activeSection.value) ?? defaultSection)
const metrics = computed(() => [
  { label: 'API base', value: apiBaseUrl.replace(/^https?:\/\//, '') },
  { label: 'Auth mode', value: isAuthenticated.value ? 'Admin verified' : 'Login required' },
  { label: 'Endpoint', value: active.value.endpoint },
])

const mockRows: Record<SectionId, string[][]> = {
  dashboard: [
    ['Operations snapshot', '/api/admin/monitoring/operations', 'Available'],
    ['Admin web overview', '/api/admin/web/overview', 'Available'],
    ['Health', '/actuator/health', 'Available'],
  ],
  users: [
    ['Admin user', 'ADMIN / SUPER_ADMIN', 'Read-only list'],
    ['Support user', 'SUPPORT_AGENT', 'Not enough for admin web shell'],
  ],
  merchants: [
    ['Merchant profile', 'Commission rate, status, wallet provider', 'Sensitive wallet ref hidden'],
    ['Storefront moderation', 'Pending backend workflow', 'Disabled in MVP shell'],
  ],
  orders: [
    ['Order ledger', 'Totals, route, payment status', 'Read-only'],
    ['Return/refund actions', '/api/returns', 'Use existing route with confirmation later'],
  ],
  deliveries: [
    ['Mission control', '/api/delivery/missions', 'Existing operational routes'],
    ['Rider scoped routes', '/api/rider/missions', 'Mobile rider app route'],
  ],
  payments: [
    ['Merchant payouts', '/api/settlements/merchant-payouts', 'Existing route'],
    ['Webhook events', '/api/admin/web/payments', 'Sanitized read model'],
  ],
  commissions: [
    ['Merchant override read', '/api/commissions/merchant-overrides/{merchantId}', 'Existing route'],
    ['Admin facade', '/api/admin/web/commissions', 'Read model'],
  ],
  relay: [
    ['Relay parcels', '/api/relay/parcels', 'Existing operational route'],
    ['Admin relay summary', '/api/admin/web/relay', 'Read model'],
  ],
  settings: [
    ['Delivery pricing', '/api/admin/web/delivery-pricing', 'Read model'],
    ['Business parameters', '/api/admin/web/business-parameters', 'Read model'],
  ],
}

function selectSection(section: SectionId) {
  activeSection.value = section
}

onMounted(() => {
  accessToken.value = sessionStorage.getItem('sequo_admin_access_token') ?? ''
  refreshToken.value = sessionStorage.getItem('sequo_admin_refresh_token') ?? ''
  if (accessToken.value) {
    void verifySession()
  }
})

async function verifySession() {
  if (!accessToken.value.trim()) {
    authError.value = 'Add an access token before continuing.'
    return
  }
  authLoading.value = true
  authError.value = ''
  try {
    const user = await apiRequest<CurrentUser>('/api/auth/me')
    if (!user.active || !user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')) {
      currentUser.value = null
      authError.value = 'This account is not allowed to use SEQUO Admin.'
      return
    }
    currentUser.value = user
    persistTokens()
  } catch {
    currentUser.value = null
    authError.value = 'We could not verify this admin session.'
  } finally {
    authLoading.value = false
  }
}

async function apiRequest<T>(path: string, retryAfterRefresh = true): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken.value}`,
    },
  })
  if (response.status === 401 && retryAfterRefresh && refreshToken.value) {
    const refreshed = await refreshSession()
    if (refreshed) return apiRequest<T>(path, false)
  }
  if (!response.ok) throw new Error('request_failed')
  return response.json() as Promise<T>
}

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: refreshToken.value, deviceId }),
    })
    if (!response.ok) return false
    const tokens = (await response.json()) as AuthTokens
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    persistTokens()
    return true
  } catch {
    return false
  }
}

async function signOut() {
  const tokenToRevoke = refreshToken.value
  clearSession()
  if (tokenToRevoke) {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: tokenToRevoke }),
    }).catch(() => undefined)
  }
}

function useMockLogin() {
  email.value = email.value || 'admin@sequo.internal'
  accessToken.value = 'local-admin-token'
  refreshToken.value = ''
  currentUser.value = {
    id: 'local-admin',
    email: email.value,
    displayName: 'Local SEQUO Admin',
    provider: 'LOCAL_DEV',
    status: 'ACTIVE',
    active: true,
    roles: ['SUPER_ADMIN'],
  }
  authError.value = ''
}

function persistTokens() {
  sessionStorage.setItem('sequo_admin_access_token', accessToken.value)
  if (refreshToken.value) {
    sessionStorage.setItem('sequo_admin_refresh_token', refreshToken.value)
  } else {
    sessionStorage.removeItem('sequo_admin_refresh_token')
  }
}

function clearSession() {
  accessToken.value = ''
  refreshToken.value = ''
  currentUser.value = null
  authError.value = ''
  sessionStorage.removeItem('sequo_admin_access_token')
  sessionStorage.removeItem('sequo_admin_refresh_token')
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem('sequo_admin_device_id')
  if (existing) return existing
  const generated = `sequo-admin-web-${crypto.randomUUID()}`
  localStorage.setItem('sequo_admin_device_id', generated)
  return generated
}
</script>

<template>
  <main class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">S</span>
        <div>
          <strong>SEQUO Admin</strong>
          <small>Internal operations</small>
        </div>
      </div>

      <nav class="nav-list" aria-label="Admin sections">
        <button
          v-for="section in sections"
          :key="section.id"
          class="nav-button"
          :class="{ active: activeSection === section.id }"
          type="button"
          @click="selectSection(section.id)"
        >
          <span>{{ section.label }}</span>
          <small>{{ section.readiness }}</small>
        </button>
      </nav>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow">Contract MVP admin</p>
          <h1>{{ active.label }}</h1>
        </div>
        <div v-if="isAuthenticated" class="account-chip">
          <span>{{ currentUser?.displayName || currentUser?.email || 'SEQUO Admin' }}</span>
          <button class="secondary" type="button" @click="signOut">Sign out</button>
        </div>
      </header>

      <section v-if="!isAuthenticated" class="login-panel" aria-label="Admin login">
        <div>
          <p class="eyebrow">Secure entry</p>
          <h2>Sign in with a SEQUO admin account</h2>
          <p>
            Paste a backend access token to verify `/api/auth/me`. Add a refresh token only for local development when you want
            one refresh-and-retry attempt. Tokens stay in session storage and are cleared on sign out.
          </p>
        </div>
        <label>
          Work email
          <input v-model="email" type="email" autocomplete="email" placeholder="admin@sequo.internal" />
        </label>
        <label>
          Access token
          <input v-model="accessToken" type="password" autocomplete="off" placeholder="Paste a local bearer token" />
        </label>
        <label>
          Refresh token
          <input v-model="refreshToken" type="password" autocomplete="off" placeholder="Optional local refresh token" />
        </label>
        <p v-if="authError" class="error-text">{{ authError }}</p>
        <div class="login-actions">
          <button type="button" :disabled="authLoading" @click="verifySession">
            {{ authLoading ? 'Verifying...' : 'Verify admin session' }}
          </button>
          <button class="secondary" type="button" @click="useMockLogin">Use local mock login</button>
        </div>
      </section>

      <template v-else>
        <section class="metrics" aria-label="Current section context">
          <article v-for="metric in metrics" :key="metric.label" class="metric-card">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </article>
        </section>

        <section class="content-grid">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">{{ active.readiness }}</p>
                <h2>{{ active.label }}</h2>
              </div>
              <code>{{ active.endpoint }}</code>
            </div>
            <p>{{ active.description }}</p>

            <div class="table" role="table" aria-label="Section rows">
              <div class="table-row table-head" role="row">
                <span role="columnheader">Item</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">State</span>
              </div>
              <div v-for="row in mockRows[active.id]" :key="row.join('-')" class="table-row" role="row">
                <span role="cell">{{ row[0] }}</span>
                <span role="cell">{{ row[1] }}</span>
                <span role="cell">{{ row[2] }}</span>
              </div>
            </div>
          </article>

          <aside class="panel compact">
            <p class="eyebrow">Safety rules</p>
            <ul>
              <li>Use backend routes under <code>/api</code> only.</li>
              <li>Do not store secrets in browser code.</li>
              <li>Keep unsupported actions disabled until endpoints exist.</li>
              <li>Show safe user-facing errors only.</li>
            </ul>
          </aside>
        </section>
      </template>
    </section>
  </main>
</template>
