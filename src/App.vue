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

type AdminOverview = {
  totals?: {
    orders?: number
  }
}

type AdminOperationsSnapshot = {
  deliveryCapacity?: {
    activeMissions?: number
    pausedCouriers?: number
    problemMissions?: unknown[]
  }
  merchantFulfillment?: {
    sellerBacklog?: number
    readyForPickup?: number
  }
  relayOperations?: {
    delayedParcels?: number
    problemParcels?: number
  }
  payoutQueue?: {
    merchantPayoutCandidates?: number
  }
  returnBottlenecks?: {
    returnsWaitingRelayAction?: number
    returnsWaitingSequoCollection?: number
    returnsInProblem?: number
  }
}

type DashboardCard = {
  label: string
  value: string
  detail: string
  source: 'API' | 'Local demo'
}

type BusinessParameter = {
  label: string
  value: string
  source: string
  writeState: 'read-only' | 'backend endpoint needed'
}

type AdminUserRow = {
  id: string
  email?: string | null
  phoneNumber?: string | null
  displayName?: string | null
  provider: string
  status: string
  active: boolean
  roles: RoleCode[]
}

type AdminMerchantRow = {
  id: string
  ownerUserId?: string | null
  name: string
  status: string
  commissionRateBps: number
  walletProvider?: string | null
  createdAt?: string
  updatedAt?: string
}

type AdminOrderRow = {
  id: string
  customerId: string
  serviceLevel: string
  route: string
  fulfillmentPriority: string
  customerFacingStatus: string
  itemSubtotalCfa: number
  deliveryFeeCfa: number
  totalCfa: number
  paymentProvider: string
  paymentStatus: string
  orderStatus: string
  createdAt?: string
  updatedAt?: string
}

const apiBaseUrl = import.meta.env.VITE_SEQUO_API_BASE_URL ?? 'http://localhost:8080'
const activeSection = ref<SectionId>('dashboard')
const email = ref('')
const accessToken = ref('')
const refreshToken = ref('')
const currentUser = ref<CurrentUser | null>(null)
const authError = ref('')
const authLoading = ref(false)
const dashboardLoading = ref(false)
const dashboardError = ref('')
const dashboardOverview = ref<AdminOverview | null>(null)
const dashboardSnapshot = ref<AdminOperationsSnapshot | null>(null)
const usersLoading = ref(false)
const usersError = ref('')
const userSearch = ref('')
const userRoleFilter = ref<'ALL' | RoleCode>('ALL')
const adminUsers = ref<AdminUserRow[]>([])
const merchantsLoading = ref(false)
const merchantsError = ref('')
const merchantSearch = ref('')
const selectedMerchantId = ref('')
const adminMerchants = ref<AdminMerchantRow[]>([])
const ordersLoading = ref(false)
const ordersError = ref('')
const orderSearch = ref('')
const selectedOrderId = ref('')
const adminOrders = ref<AdminOrderRow[]>([])
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

const dashboardCards = computed<DashboardCard[]>(() => {
  const snapshot = dashboardSnapshot.value
  const overview = dashboardOverview.value
  const source: DashboardCard['source'] = snapshot || overview ? 'API' : 'Local demo'
  return [
    {
      label: 'Pending orders',
      value: formatCount(overview?.totals?.orders ?? 0),
      detail: overview ? 'Total order records in admin overview' : 'Waiting for admin overview endpoint',
      source,
    },
    {
      label: 'Merchant packages waiting',
      value: formatCount(snapshot?.merchantFulfillment?.sellerBacklog ?? 7),
      detail: `${formatCount(snapshot?.merchantFulfillment?.readyForPickup ?? 3)} ready for pickup`,
      source,
    },
    {
      label: 'Active deliveries',
      value: formatCount(snapshot?.deliveryCapacity?.activeMissions ?? 12),
      detail: 'Created, offered, accepted, pickup, relay, or problem states',
      source,
    },
    {
      label: 'Relay overdue packages',
      value: formatCount(snapshot?.relayOperations?.delayedParcels ?? 4),
      detail: `${formatCount(snapshot?.relayOperations?.problemParcels ?? 1)} relay problems`,
      source,
    },
    {
      label: 'Returns awaiting inspection',
      value: formatCount((snapshot?.returnBottlenecks?.returnsWaitingRelayAction ?? 2) + (snapshot?.returnBottlenecks?.returnsWaitingSequoCollection ?? 1)),
      detail: `${formatCount(snapshot?.returnBottlenecks?.returnsInProblem ?? 0)} return problems`,
      source,
    },
    {
      label: 'Payment / settlement issues',
      value: formatCount(snapshot?.payoutQueue?.merchantPayoutCandidates ?? 5),
      detail: 'Merchant payouts needing finance attention',
      source,
    },
    {
      label: 'Courier availability issues',
      value: formatCount((snapshot?.deliveryCapacity?.pausedCouriers ?? 2) + (snapshot?.deliveryCapacity?.problemMissions?.length ?? 1)),
      detail: 'Paused couriers plus problem missions',
      source,
    },
  ]
})

const businessParameters: BusinessParameter[] = [
  { label: 'Minimum delivery price', value: '400 CFA', source: '/api/admin/web/delivery-pricing', writeState: 'read-only' },
  { label: 'Price per extra kilometer', value: '100 CFA', source: '/api/admin/web/delivery-pricing', writeState: 'read-only' },
  { label: 'Default commission', value: '15%', source: '/api/admin/web/commissions', writeState: 'read-only' },
  { label: 'Merchant commission overrides', value: 'Existing per merchant', source: '/api/commissions/merchant-overrides/{merchantId}', writeState: 'read-only' },
  { label: 'Subscriber discount rates', value: 'Prepared in subscription domain', source: 'subscription domain', writeState: 'backend endpoint needed' },
  { label: 'Referral delivery credits', value: 'Delivery credit only', source: 'referral domain', writeState: 'backend endpoint needed' },
  { label: 'Bargaining attempt count', value: '3 attempts default', source: 'bargaining domain', writeState: 'backend endpoint needed' },
  { label: 'Negotiated price lock duration', value: '24 hours', source: 'bargaining domain', writeState: 'backend endpoint needed' },
  { label: 'Return request delay', value: '72 hours after delivery', source: 'returns domain', writeState: 'backend endpoint needed' },
  { label: 'Relay storage delay and fee', value: 'After two weeks', source: 'relay domain', writeState: 'backend endpoint needed' },
  { label: 'Categories excluded from relay/returns', value: 'Policy-backed category rules', source: 'relay / returns policy', writeState: 'backend endpoint needed' },
]

const roleOptions: Array<'ALL' | RoleCode> = ['ALL', 'CUSTOMER', 'COURIER', 'MERCHANT_OWNER', 'MERCHANT_STAFF', 'RELAY_PARTNER', 'SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN']
const localDemoUsers: AdminUserRow[] = [
  { id: 'local-customer', email: 'customer@example.test', displayName: 'Customer account', provider: 'GOOGLE', status: 'ACTIVE', active: true, roles: ['CUSTOMER'] },
  { id: 'local-courier', email: 'courier@example.test', displayName: 'Courier account', provider: 'GOOGLE', status: 'ACTIVE', active: true, roles: ['COURIER'] },
  { id: 'local-merchant', email: 'merchant@example.test', displayName: 'Merchant owner', provider: 'GOOGLE', status: 'ACTIVE', active: true, roles: ['MERCHANT_OWNER'] },
  { id: 'local-admin-user', email: 'admin@example.test', displayName: 'SEQUO admin', provider: 'EMAIL', status: 'ACTIVE', active: true, roles: ['ADMIN'] },
  { id: 'local-relay', email: 'relay@example.test', displayName: 'Relay partner', provider: 'GOOGLE', status: 'ACTIVE', active: true, roles: ['RELAY_PARTNER'] },
]
const displayedUsers = computed(() => {
  const source = adminUsers.value.length > 0 ? adminUsers.value : localDemoUsers
  const query = userSearch.value.trim().toLowerCase()
  return source
    .filter((user) => userRoleFilter.value === 'ALL' || user.roles.includes(userRoleFilter.value))
    .filter((user) => {
      if (!query) return true
      return [user.email, user.phoneNumber, user.displayName, user.id, user.provider, user.status, user.roles.join(' ')]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
})
const localDemoMerchants: AdminMerchantRow[] = [
  { id: 'merchant-akouvi', ownerUserId: 'local-merchant', name: 'Akouvi Market', status: 'ACTIVE', commissionRateBps: 1500, walletProvider: 'YAS_TOGO' },
  { id: 'merchant-kara', ownerUserId: 'local-merchant-2', name: 'Kara Fresh', status: 'PAUSED', commissionRateBps: 1200, walletProvider: 'MOOV_AFRICA' },
  { id: 'merchant-pantry', ownerUserId: 'local-merchant-3', name: 'Togolese Pantry', status: 'PENDING_REVIEW', commissionRateBps: 1500, walletProvider: null },
]
const displayedMerchants = computed(() => {
  const source = adminMerchants.value.length > 0 ? adminMerchants.value : localDemoMerchants
  const query = merchantSearch.value.trim().toLowerCase()
  return source.filter((merchant) => {
    if (!query) return true
    return [merchant.id, merchant.name, merchant.status, merchant.walletProvider, merchant.ownerUserId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  })
})
const selectedMerchant = computed(() => displayedMerchants.value.find((merchant) => merchant.id === selectedMerchantId.value) ?? displayedMerchants.value[0] ?? null)
const localDemoOrders: AdminOrderRow[] = [
  { id: 'order-local-1', customerId: 'customer-a', serviceLevel: 'EXPRESS', route: 'HOME_DELIVERY', fulfillmentPriority: 'FASTEST_AVAILABLE', customerFacingStatus: 'In transit', itemSubtotalCfa: 18400, deliveryFeeCfa: 600, totalCfa: 19000, paymentProvider: 'YAS_TOGO', paymentStatus: 'VALIDATED', orderStatus: 'ACCEPTED_FOR_FULFILLMENT' },
  { id: 'order-local-2', customerId: 'customer-b', serviceLevel: 'CLASSIC', route: 'RELAY_POINT', fulfillmentPriority: 'LOWEST_COST', customerFacingStatus: 'Waiting for relay pickup', itemSubtotalCfa: 9800, deliveryFeeCfa: 400, totalCfa: 10200, paymentProvider: 'MOOV_AFRICA', paymentStatus: 'PENDING', orderStatus: 'ACCEPTED_FOR_FULFILLMENT' },
  { id: 'order-local-3', customerId: 'customer-c', serviceLevel: 'CLASSIC', route: 'HOME_DELIVERY', fulfillmentPriority: 'STANDARD', customerFacingStatus: 'Delivered', itemSubtotalCfa: 26500, deliveryFeeCfa: 700, totalCfa: 27200, paymentProvider: 'YAS_TOGO', paymentStatus: 'VALIDATED', orderStatus: 'DELIVERED' },
]
const displayedOrders = computed(() => {
  const source = adminOrders.value.length > 0 ? adminOrders.value : localDemoOrders
  const query = orderSearch.value.trim().toLowerCase()
  return source.filter((order) => {
    if (!query) return true
    return [order.id, order.customerId, order.serviceLevel, order.route, order.paymentStatus, order.orderStatus, order.customerFacingStatus]
      .some((value) => String(value).toLowerCase().includes(query))
  })
})
const selectedOrder = computed(() => displayedOrders.value.find((order) => order.id === selectedOrderId.value) ?? displayedOrders.value[0] ?? null)

function selectSection(section: SectionId) {
  activeSection.value = section
  if (section === 'dashboard' && isAuthenticated.value) {
    void loadDashboard()
  }
  if (section === 'users' && isAuthenticated.value) {
    void loadUsers()
  }
  if (section === 'merchants' && isAuthenticated.value) {
    void loadMerchants()
  }
  if (section === 'orders' && isAuthenticated.value) {
    void loadOrders()
  }
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
    await loadDashboard()
    await loadUsers()
    await loadMerchants()
    await loadOrders()
  } catch {
    currentUser.value = null
    authError.value = 'We could not verify this admin session.'
  } finally {
    authLoading.value = false
  }
}

async function loadOrders() {
  ordersLoading.value = true
  ordersError.value = ''
  try {
    adminOrders.value = await apiRequest<AdminOrderRow[]>('/api/admin/web/orders')
    selectedOrderId.value = adminOrders.value[0]?.id ?? ''
  } catch {
    adminOrders.value = []
    selectedOrderId.value = localDemoOrders[0]?.id ?? ''
    ordersError.value = 'Live orders are unavailable. Showing local demo tracking.'
  } finally {
    ordersLoading.value = false
  }
}

async function loadMerchants() {
  merchantsLoading.value = true
  merchantsError.value = ''
  try {
    adminMerchants.value = await apiRequest<AdminMerchantRow[]>('/api/admin/web/merchants')
    selectedMerchantId.value = adminMerchants.value[0]?.id ?? ''
  } catch {
    adminMerchants.value = []
    selectedMerchantId.value = localDemoMerchants[0]?.id ?? ''
    merchantsError.value = 'Live merchants are unavailable. Showing local demo merchants.'
  } finally {
    merchantsLoading.value = false
  }
}

async function loadUsers() {
  usersLoading.value = true
  usersError.value = ''
  try {
    adminUsers.value = await apiRequest<AdminUserRow[]>('/api/admin/web/users')
  } catch {
    adminUsers.value = []
    usersError.value = 'Live users are unavailable. Showing local demo accounts.'
  } finally {
    usersLoading.value = false
  }
}

async function loadDashboard() {
  dashboardLoading.value = true
  dashboardError.value = ''
  try {
    const [overview, snapshot] = await Promise.all([
      apiRequest<AdminOverview>('/api/admin/web/overview'),
      apiRequest<AdminOperationsSnapshot>('/api/admin/monitoring/operations'),
    ])
    dashboardOverview.value = overview
    dashboardSnapshot.value = snapshot
  } catch {
    dashboardOverview.value = null
    dashboardSnapshot.value = null
    dashboardError.value = 'Live dashboard data is unavailable. Showing local demo values.'
  } finally {
    dashboardLoading.value = false
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
  void loadDashboard()
  void loadUsers()
  void loadMerchants()
  void loadOrders()
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
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
          <article v-if="active.id === 'dashboard'" class="panel dashboard-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Live operations</p>
                <h2>Dashboard</h2>
              </div>
              <button class="secondary" type="button" :disabled="dashboardLoading" @click="loadDashboard">
                {{ dashboardLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="dashboardError" class="error-text">{{ dashboardError }}</p>
            <div class="dashboard-grid" aria-label="Admin dashboard cards">
              <article v-for="card in dashboardCards" :key="card.label" class="dashboard-card">
                <div class="dashboard-card-top">
                  <span>{{ card.label }}</span>
                  <small :class="{ demo: card.source === 'Local demo' }">{{ card.source }}</small>
                </div>
                <strong>{{ card.value }}</strong>
                <p>{{ card.detail }}</p>
              </article>
            </div>
          </article>

          <article v-else-if="active.id === 'users'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Accounts</p>
                <h2>Users and roles</h2>
              </div>
              <button class="secondary" type="button" :disabled="usersLoading" @click="loadUsers">
                {{ usersLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="usersError" class="error-text">{{ usersError }}</p>
            <div class="filters">
              <input v-model="userSearch" type="search" placeholder="Search users, email, provider, role" />
              <select v-model="userRoleFilter" aria-label="Filter users by role">
                <option v-for="role in roleOptions" :key="role" :value="role">{{ role }}</option>
              </select>
            </div>
            <div class="table" role="table" aria-label="Users and roles">
              <div class="table-row users-row table-head" role="row">
                <span role="columnheader">User</span>
                <span role="columnheader">Provider</span>
                <span role="columnheader">Roles</span>
                <span role="columnheader">State</span>
              </div>
              <div v-for="user in displayedUsers" :key="user.id" class="table-row users-row" role="row">
                <span role="cell">
                  <strong>{{ user.displayName || user.email || user.phoneNumber || user.id }}</strong>
                  <small>{{ user.email || user.phoneNumber || user.id }}</small>
                </span>
                <span role="cell">{{ user.provider }}</span>
                <span role="cell">{{ user.roles.join(', ') }}</span>
                <span role="cell">{{ user.active ? user.status : 'INACTIVE' }}</span>
              </div>
            </div>
            <p>
              Role mutation, suspension, password reset and session-revocation controls are disabled until dedicated admin endpoints exist.
            </p>
          </article>

          <article v-else-if="active.id === 'merchants'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Commerce operations</p>
                <h2>Merchants</h2>
              </div>
              <button class="secondary" type="button" :disabled="merchantsLoading" @click="loadMerchants">
                {{ merchantsLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="merchantsError" class="error-text">{{ merchantsError }}</p>
            <input v-model="merchantSearch" type="search" placeholder="Search merchant, owner, status, wallet" />
            <div class="split-panel">
              <div class="table" role="table" aria-label="Merchant list">
                <div class="table-row merchant-row table-head" role="row">
                  <span role="columnheader">Merchant</span>
                  <span role="columnheader">Commission</span>
                  <span role="columnheader">Status</span>
                </div>
                <button
                  v-for="merchant in displayedMerchants"
                  :key="merchant.id"
                  class="table-row merchant-row selectable-row"
                  type="button"
                  @click="selectedMerchantId = merchant.id"
                >
                  <span>
                    <strong>{{ merchant.name }}</strong>
                    <small>{{ merchant.id }}</small>
                  </span>
                  <span>{{ (merchant.commissionRateBps / 100).toFixed(2) }}%</span>
                  <span>{{ merchant.status }}</span>
                </button>
              </div>
              <aside v-if="selectedMerchant" class="detail-card">
                <p class="eyebrow">Merchant detail</p>
                <h3>{{ selectedMerchant.name }}</h3>
                <dl>
                  <div><dt>Owner</dt><dd>{{ selectedMerchant.ownerUserId || 'Not available' }}</dd></div>
                  <div><dt>Wallet</dt><dd>{{ selectedMerchant.walletProvider || 'Not configured' }}</dd></div>
                  <div><dt>Catalog status</dt><dd>Read endpoint available; product mutation endpoint required</dd></div>
                  <div><dt>Product count</dt><dd>Backend aggregate endpoint needed</dd></div>
                </dl>
                <button type="button" disabled>Activate/deactivate products: backend endpoint needed</button>
              </aside>
            </div>
          </article>

          <article v-else-if="active.id === 'orders'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Internal logistics</p>
                <h2>Orders and delivery tracking</h2>
              </div>
              <button class="secondary" type="button" :disabled="ordersLoading" @click="loadOrders">
                {{ ordersLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="ordersError" class="error-text">{{ ordersError }}</p>
            <input v-model="orderSearch" type="search" placeholder="Search order, customer, route, payment, status" />
            <div class="split-panel">
              <div class="table" role="table" aria-label="Order list">
                <div class="table-row order-row table-head" role="row">
                  <span role="columnheader">Order</span>
                  <span role="columnheader">Payment</span>
                  <span role="columnheader">Total</span>
                  <span role="columnheader">Status</span>
                </div>
                <button
                  v-for="order in displayedOrders"
                  :key="order.id"
                  class="table-row order-row selectable-row"
                  type="button"
                  @click="selectedOrderId = order.id"
                >
                  <span>
                    <strong>{{ order.id }}</strong>
                    <small>{{ order.customerId }} · {{ order.route }}</small>
                  </span>
                  <span>{{ order.paymentStatus }}</span>
                  <span>{{ order.totalCfa.toLocaleString('en-US') }} CFA</span>
                  <span>{{ order.orderStatus }}</span>
                </button>
              </div>
              <aside v-if="selectedOrder" class="detail-card">
                <p class="eyebrow">Order detail</p>
                <h3>{{ selectedOrder.customerFacingStatus }}</h3>
                <dl>
                  <div><dt>Service</dt><dd>{{ selectedOrder.serviceLevel }} · {{ selectedOrder.fulfillmentPriority }}</dd></div>
                  <div><dt>Items</dt><dd>{{ selectedOrder.itemSubtotalCfa.toLocaleString('en-US') }} CFA</dd></div>
                  <div><dt>Delivery</dt><dd>{{ selectedOrder.deliveryFeeCfa.toLocaleString('en-US') }} CFA</dd></div>
                  <div><dt>Provider</dt><dd>{{ selectedOrder.paymentProvider }}</dd></div>
                </dl>
                <ol class="timeline">
                  <li>Order accepted for fulfillment</li>
                  <li>Merchant sub-orders tracked from `/api/merchant/sub-orders`</li>
                  <li>Delivery missions tracked from `/api/delivery/missions`</li>
                  <li>Relay fallback tracked from `/api/relay/parcels` when applicable</li>
                </ol>
                <button type="button" disabled>Operational mutations require route-specific admin endpoints</button>
              </aside>
            </div>
          </article>

          <article v-else-if="active.id === 'settings'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Annex A.6</p>
                <h2>Business parameters</h2>
              </div>
              <code>/api/admin/web/business-parameters</code>
            </div>
            <p>
              These are contract MVP parameters. Values are displayed from implemented read endpoints or documented domain policy.
              Write controls stay disabled until dedicated backend mutation endpoints exist.
            </p>
            <div class="settings-grid" aria-label="Business parameters">
              <article v-for="parameter in businessParameters" :key="parameter.label" class="setting-row">
                <div>
                  <strong>{{ parameter.label }}</strong>
                  <small>{{ parameter.source }}</small>
                </div>
                <span>{{ parameter.value }}</span>
                <button type="button" disabled>{{ parameter.writeState }}</button>
              </article>
            </div>
          </article>

          <article v-else class="panel">
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
