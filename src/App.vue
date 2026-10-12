<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

type SectionId =
  | 'dashboard'
  | 'users'
  | 'merchants'
  | 'orders'
  | 'deliveries'
  | 'payments'
  | 'commissions'
  | 'returns'
  | 'relay'
  | 'settings'

type Section = {
  id: SectionId
  label: string
  statusLabel: 'Ready' | 'View only' | 'Setup needed'
  description: string
  icon: string
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

type SocialProvider = 'GOOGLE' | 'APPLE'

type GoogleCredentialResponse = {
  credential?: string
}

type GoogleIdentityServices = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
      }) => void
      prompt: () => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

type AdminLoginRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED'

type AdminLoginStartResponse = {
  requestId: string
  code: string
  expiresAt: string
  pollingIntervalSeconds: number
}

type AdminLoginStatusResponse = {
  status: AdminLoginRequestStatus
  expiresAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
}

type AdminLoginExchangeResponse = AuthTokens & {
  user: CurrentUser
}

type AdminEmailCodeRequestResponse = {
  status: string
  expiresInSeconds: number
  retryAfterSeconds: number
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
  source: 'Live data' | 'Demo data'
}

type BusinessParameter = {
  label: string
  value: string
  owner: string
  actionLabel: 'View only' | 'Setup needed'
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

type ReturnRow = {
  id: string
  orderId: string
  stage: string
  refundStatus: string
  requestedRefundCfa: number
  action: string
  nextStep: string
}

const apiBaseUrl = import.meta.env.VITE_SEQUO_API_BASE_URL ?? 'http://localhost:8080'
const googleWebClientId = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '').trim()
const activeSection = ref<SectionId>('dashboard')
const email = ref('')
const accessToken = ref('')
const refreshToken = ref('')
const currentUser = ref<CurrentUser | null>(null)
const authError = ref('')
const authNotice = ref('')
const authLoading = ref(false)
const loginRequestId = ref('')
const loginCode = ref('')
const loginStatus = ref<AdminLoginRequestStatus | ''>('')
const loginExpiresAt = ref('')
const loginPollingIntervalSeconds = ref(2)
const loginPollTimer = ref<ReturnType<typeof window.setInterval> | null>(null)
const loginCountdownTimer = ref<ReturnType<typeof window.setInterval> | null>(null)
const currentTimeMs = ref(Date.now())
const exchangeInProgress = ref(false)
const emailFallbackOpen = ref(false)
const emailCode = ref('')
const emailCodeRequested = ref(false)
const emailCodeLoading = ref(false)
const emailCodeRequestedAtMs = ref(0)
const emailCodeExpiresInSeconds = ref(0)
const emailCodeRetryAfterSeconds = ref(0)
const emailCodeTimer = ref<ReturnType<typeof window.setInterval> | null>(null)
const socialLoginLoading = ref<SocialProvider | ''>('')
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
const returnSearch = ref('')
const deviceId = getOrCreateDeviceId()
let googleScriptPromise: Promise<void> | null = null
const isAdmin = computed(() => Boolean(currentUser.value?.active && currentUser.value.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')))
const isAuthenticated = computed(() => Boolean(accessToken.value.trim() && isAdmin.value))
const hasPendingPhoneLogin = computed(() => Boolean(loginRequestId.value && loginCode.value && loginStatus.value === 'PENDING'))
const canRequestPhoneLogin = computed(() => Boolean(email.value.trim()) && !authLoading.value && !exchangeInProgress.value)
const emailCodeExpiresAtMs = computed(() => emailCodeRequestedAtMs.value + emailCodeExpiresInSeconds.value * 1000)
const emailCodeRetryAtMs = computed(() => emailCodeRequestedAtMs.value + emailCodeRetryAfterSeconds.value * 1000)
const emailCodeCountdownLabel = computed(() => formatRemainingTime(emailCodeExpiresAtMs.value - currentTimeMs.value))
const emailCodeRetryLabel = computed(() => formatRemainingTime(emailCodeRetryAtMs.value - currentTimeMs.value))
const canRequestEmailCode = computed(() =>
  Boolean(email.value.trim())
  && emailFallbackOpen.value
  && !authLoading.value
  && !emailCodeLoading.value
  && (!emailCodeRequested.value || currentTimeMs.value >= emailCodeRetryAtMs.value),
)
const canVerifyEmailCode = computed(() =>
  Boolean(email.value.trim())
  && Boolean(emailCode.value.trim())
  && emailCodeRequested.value
  && !authLoading.value
  && !emailCodeLoading.value,
)
const googleLoginReady = computed(() => Boolean(googleWebClientId))
const loginStatusLabel = computed(() => {
  if (!loginStatus.value) return 'Ready'
  return humanize(loginStatus.value)
})
const loginCountdownLabel = computed(() => {
  if (!loginExpiresAt.value) return ''
  const remainingMs = new Date(loginExpiresAt.value).getTime() - currentTimeMs.value
  if (remainingMs <= 0) return 'Expired'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})

const sections: Section[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    statusLabel: 'Ready',
    description: 'Daily operational totals and work that needs attention.',
    icon: 'dashboard',
  },
  {
    id: 'users',
    label: 'Users',
    statusLabel: 'View only',
    description: 'Customer, merchant, rider, relay and staff accounts.',
    icon: 'groups',
  },
  {
    id: 'merchants',
    label: 'Merchants',
    statusLabel: 'View only',
    description: 'Merchant status, commission context and payment setup.',
    icon: 'storefront',
  },
  {
    id: 'orders',
    label: 'Orders',
    statusLabel: 'View only',
    description: 'Customer orders, payment state and fulfillment priority.',
    icon: 'receipt_long',
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    statusLabel: 'Ready',
    description: 'Courier activity, pickup pressure and delivery problems.',
    icon: 'local_shipping',
  },
  {
    id: 'payments',
    label: 'Payments',
    statusLabel: 'View only',
    description: 'Merchant payouts and payment events that need finance attention.',
    icon: 'payments',
  },
  {
    id: 'commissions',
    label: 'Commissions',
    statusLabel: 'Ready',
    description: 'Default commission and merchant-specific commercial terms.',
    icon: 'percent',
  },
  {
    id: 'returns',
    label: 'Returns',
    statusLabel: 'View only',
    description: 'Return requests, inspections and refund readiness.',
    icon: 'assignment_return',
  },
  {
    id: 'relay',
    label: 'Relay points',
    statusLabel: 'View only',
    description: 'Relay parcels, overdue packages and local counter issues.',
    icon: 'inventory_2',
  },
  {
    id: 'settings',
    label: 'Settings',
    statusLabel: 'Ready',
    description: 'Business rules used by the SEQUO operation.',
    icon: 'tune',
  },
]

const defaultSection = sections[0] as Section
const active = computed<Section>(() => sections.find((section) => section.id === activeSection.value) ?? defaultSection)
const metrics = computed(() => [
  { label: 'Workspace', value: 'SEQUO operations' },
  { label: 'Access', value: isAuthenticated.value ? 'Staff verified' : 'Login required' },
  { label: 'Section', value: active.value.label },
])

const priorityActions = computed(() => [
  { label: 'Orders waiting', value: dashboardCards.value[0]?.value ?? '0', detail: 'Open the order list first', target: 'orders' as SectionId, icon: 'pending_actions' },
  { label: 'Packages to collect', value: dashboardCards.value[1]?.value ?? '0', detail: 'Coordinate merchant pickup', target: 'deliveries' as SectionId, icon: 'package_2' },
  { label: 'Returns to review', value: dashboardCards.value[4]?.value ?? '0', detail: 'Check inspection queue', target: 'returns' as SectionId, icon: 'assignment_return' },
  { label: 'Payment follow-up', value: dashboardCards.value[5]?.value ?? '0', detail: 'Review finance queue', target: 'payments' as SectionId, icon: 'account_balance_wallet' },
])

const mockRows: Record<SectionId, string[][]> = {
  dashboard: [
    ['Today overview', 'Orders, deliveries, returns and payouts', 'Ready'],
    ['Attention queue', 'Problems and delayed work', 'Ready'],
    ['Service health', 'General platform availability', 'Ready'],
  ],
  users: [
    ['Admin user', 'Can manage internal workspace', 'View only'],
    ['Support user', 'Can help customers and merchants', 'Needs role review'],
  ],
  merchants: [
    ['Merchant profile', 'Status, commission and payment setup', 'View only'],
    ['Storefront review', 'Products and shop readiness', 'Setup needed'],
  ],
  orders: [
    ['Order ledger', 'Totals, delivery choice and payment status', 'View only'],
    ['Return/refund actions', 'Handled from the returns workspace', 'Confirmation needed'],
  ],
  deliveries: [
    ['Mission control', 'Courier assignment and status', 'Ready'],
    ['Rider app activity', 'Courier mobile workflow', 'Ready'],
  ],
  payments: [
    ['Merchant payouts', 'Amounts waiting for review', 'View only'],
    ['Payment events', 'Safe finance history', 'View only'],
  ],
  commissions: [
    ['Merchant commercial terms', 'Commission override per merchant', 'View only'],
    ['Default policy', 'Standard SEQUO commission', 'Ready'],
  ],
  returns: [
    ['Return request list', 'Customer and support follow-up', 'Ready'],
    ['Physical receipt', 'Confirm product arrived at SEQUO', 'Ready'],
    ['Refund instruction', 'Finance action after inspection', 'Ready'],
  ],
  relay: [
    ['Relay parcels', 'Packages at partner counters', 'View only'],
    ['Relay summary', 'Overdue and problem parcels', 'View only'],
  ],
  settings: [
    ['Delivery pricing', 'Minimum price and extra kilometers', 'View only'],
    ['Business rules', 'Returns, relay fees and commission policy', 'View only'],
  ],
}

const dashboardCards = computed<DashboardCard[]>(() => {
  const snapshot = dashboardSnapshot.value
  const overview = dashboardOverview.value
  const source: DashboardCard['source'] = snapshot || overview ? 'Live data' : 'Demo data'
  return [
    {
      label: 'Pending orders',
      value: formatCount(overview?.totals?.orders ?? 0),
      detail: overview ? 'Total orders visible to the admin team' : 'Demo value until live data is available',
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
  { label: 'Minimum delivery price', value: '400 CFA', owner: 'Delivery team', actionLabel: 'View only' },
  { label: 'Price per extra kilometer', value: '100 CFA', owner: 'Delivery team', actionLabel: 'View only' },
  { label: 'Default commission', value: '15%', owner: 'Commercial team', actionLabel: 'View only' },
  { label: 'Merchant commission exceptions', value: 'Set per merchant', owner: 'Commercial team', actionLabel: 'View only' },
  { label: 'Subscriber discount rates', value: 'Prepared', owner: 'Growth team', actionLabel: 'Setup needed' },
  { label: 'Referral delivery credits', value: 'Delivery credit only', owner: 'Growth team', actionLabel: 'Setup needed' },
  { label: 'Bargaining attempt count', value: '3 attempts default', owner: 'Commercial team', actionLabel: 'Setup needed' },
  { label: 'Negotiated price lock duration', value: '24 hours', owner: 'Commercial team', actionLabel: 'Setup needed' },
  { label: 'Return request delay', value: '72 hours after delivery', owner: 'Support team', actionLabel: 'Setup needed' },
  { label: 'Relay storage delay and fee', value: 'After two weeks', owner: 'Relay team', actionLabel: 'Setup needed' },
  { label: 'Excluded product categories', value: 'Food and perishables protected', owner: 'Operations team', actionLabel: 'Setup needed' },
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
const returnRows: ReturnRow[] = [
  { id: 'RET-2041', orderId: 'ORD-80354', stage: 'Dropped at relay', refundStatus: 'Waiting for SEQUO receipt', requestedRefundCfa: 12500, action: 'Receive physical item', nextStep: 'Confirm product arrived at SEQUO' },
  { id: 'RET-2038', orderId: 'ORD-80291', stage: 'Under inspection', refundStatus: 'Pending condition check', requestedRefundCfa: 38000, action: 'Review condition', nextStep: 'Record inspection decision' },
  { id: 'RET-2031', orderId: 'ORD-80188', stage: 'Receipt verified', refundStatus: 'Refund instruction ready', requestedRefundCfa: 7900, action: 'Prepare refund instruction', nextStep: 'Send to finance team' },
  { id: 'RET-2029', orderId: 'ORD-80120', stage: 'Problem', refundStatus: 'Blocked', requestedRefundCfa: 15400, action: 'Investigate', nextStep: 'Assign support follow-up' },
]
const displayedReturns = computed(() => {
  const query = returnSearch.value.trim().toLowerCase()
  if (!query) return returnRows
  return returnRows.filter((item) => [item.id, item.orderId, item.stage, item.refundStatus, item.action, item.nextStep].some((value) => value.toLowerCase().includes(query)))
})

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

onUnmounted(() => {
  stopLoginPolling()
  stopCountdown()
  stopEmailCodeTimer()
})

async function verifySession() {
  if (!accessToken.value.trim()) {
    authError.value = 'Request a phone login before continuing.'
    return
  }
  authLoading.value = true
  authError.value = ''
  try {
    const user = await apiRequest<CurrentUser>('/api/auth/me')
    if (!user.active || !user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')) {
      clearSession()
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
    clearSession()
    authError.value = 'We could not verify this admin session.'
  } finally {
    authLoading.value = false
  }
}

async function requestPhoneLogin() {
  if (!canRequestPhoneLogin.value) return
  stopLoginPolling()
  stopCountdown()
  resetEmailFallback()
  authLoading.value = true
  authError.value = ''
  authNotice.value = ''
  loginRequestId.value = ''
  loginCode.value = ''
  loginStatus.value = ''
  loginExpiresAt.value = ''
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-auth/login-requests`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.value.trim(),
        deviceLabel: browserDeviceLabel(),
        browserInfo: navigator.userAgent.slice(0, 180),
      }),
    })
    if (!response.ok) throw new Error('request_failed')
    const body = (await response.json()) as AdminLoginStartResponse
    loginRequestId.value = body.requestId
    loginCode.value = body.code
    loginExpiresAt.value = body.expiresAt
    loginPollingIntervalSeconds.value = Math.max(2, body.pollingIntervalSeconds || 2)
    loginStatus.value = 'PENDING'
    authNotice.value = 'Open SEQUO on your phone and approve this code.'
    startCountdown()
    startLoginPolling()
  } catch {
    authError.value = 'We could not create a phone login request. Try again in a moment.'
  } finally {
    authLoading.value = false
  }
}

function openEmailFallback() {
  resetPhoneLogin()
  emailFallbackOpen.value = true
  authError.value = ''
  authNotice.value = 'Use this only when you cannot approve from your SEQUO app.'
}

function resetEmailFallback() {
  stopEmailCodeTimer()
  emailFallbackOpen.value = false
  emailCode.value = ''
  emailCodeRequested.value = false
  emailCodeLoading.value = false
  emailCodeRequestedAtMs.value = 0
  emailCodeExpiresInSeconds.value = 0
  emailCodeRetryAfterSeconds.value = 0
}

async function requestEmailCode() {
  if (!canRequestEmailCode.value) return
  stopLoginPolling()
  stopCountdown()
  emailCodeLoading.value = true
  authError.value = ''
  authNotice.value = ''
  emailCode.value = ''
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-auth/email-codes`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.value.trim() }),
    })
    if (!response.ok) throw new Error('request_failed')
    const body = (await response.json()) as AdminEmailCodeRequestResponse
    emailCodeRequested.value = true
    emailCodeRequestedAtMs.value = Date.now()
    emailCodeExpiresInSeconds.value = Math.max(60, body.expiresInSeconds || 300)
    emailCodeRetryAfterSeconds.value = Math.max(30, body.retryAfterSeconds || 60)
    currentTimeMs.value = Date.now()
    authNotice.value = 'If this account can use SEQUO Admin, a login code will arrive by email.'
    startEmailCodeTimer()
  } catch {
    authError.value = 'We could not send an email code. Try again in a moment.'
  } finally {
    emailCodeLoading.value = false
  }
}

async function verifyEmailCode() {
  if (!canVerifyEmailCode.value) return
  emailCodeLoading.value = true
  authError.value = ''
  authNotice.value = ''
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-auth/email-codes/verify`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.value.trim(),
        code: emailCode.value.trim(),
        deviceId,
      }),
    })
    if (!response.ok) throw new Error('request_failed')
    const body = (await response.json()) as AdminLoginExchangeResponse
    accessToken.value = body.accessToken
    refreshToken.value = body.refreshToken
    currentUser.value = body.user
    persistTokens()
    resetEmailFallback()
    await verifySession()
  } catch {
    authError.value = 'We could not verify this email code. Check the code or request a new one.'
  } finally {
    emailCodeLoading.value = false
  }
}

async function startGoogleLogin() {
  if (!googleLoginReady.value || socialLoginLoading.value) return
  socialLoginLoading.value = 'GOOGLE'
  authError.value = ''
  authNotice.value = 'Use social login only on a trusted computer.'
  try {
    await loadGoogleIdentityServices()
    const googleId = window.google?.accounts.id
    if (!googleId) throw new Error('google_unavailable')
    googleId.initialize({
      client_id: googleWebClientId,
      callback: (response) => {
        void completeSocialLogin('GOOGLE', response.credential)
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    })
    googleId.prompt()
    authNotice.value = 'Choose the Google account allowed for SEQUO Admin.'
  } catch {
    authError.value = 'Google login is not available right now. Use phone approval instead.'
  } finally {
    socialLoginLoading.value = ''
  }
}

async function completeSocialLogin(provider: SocialProvider, providerToken?: string) {
  if (!providerToken) {
    authError.value = 'Social login could not be completed. Use phone approval instead.'
    return
  }
  socialLoginLoading.value = provider
  authError.value = ''
  authNotice.value = ''
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/social/${provider}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: providerToken,
        device: {
          deviceId,
          appSource: 'SEQUO_ADMIN',
        },
      }),
    })
    if (!response.ok) throw new Error('social_login_failed')
    const tokens = (await response.json()) as AuthTokens
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    persistTokens()
    await verifySession()
  } catch {
    clearSession()
    authError.value = 'Social login could not open SEQUO Admin. Use phone approval instead.'
  } finally {
    socialLoginLoading.value = ''
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise
  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('google_script_failed'))
    document.head.appendChild(script)
  })
  return googleScriptPromise
}

function sanitizeEmailCodeInput() {
  emailCode.value = emailCode.value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 16)
}

function startEmailCodeTimer() {
  stopEmailCodeTimer()
  currentTimeMs.value = Date.now()
  emailCodeTimer.value = window.setInterval(() => {
    currentTimeMs.value = Date.now()
    if (emailCodeRequested.value && emailCodeExpiresAtMs.value <= currentTimeMs.value) {
      authNotice.value = ''
      authError.value = 'This email code expired. Request a new one.'
      stopEmailCodeTimer()
    }
  }, 1000)
}

function stopEmailCodeTimer() {
  if (emailCodeTimer.value) {
    window.clearInterval(emailCodeTimer.value)
    emailCodeTimer.value = null
  }
}

function startLoginPolling() {
  stopLoginPolling()
  void pollPhoneLoginStatus()
  loginPollTimer.value = window.setInterval(() => {
    void pollPhoneLoginStatus()
  }, loginPollingIntervalSeconds.value * 1000)
}

function stopLoginPolling() {
  if (loginPollTimer.value) {
    window.clearInterval(loginPollTimer.value)
    loginPollTimer.value = null
  }
}

async function pollPhoneLoginStatus() {
  if (!loginRequestId.value || exchangeInProgress.value) return
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-auth/login-requests/${loginRequestId.value}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('request_failed')
    const body = (await response.json()) as AdminLoginStatusResponse
    loginStatus.value = body.status
    loginExpiresAt.value = body.expiresAt
    if (body.status === 'APPROVED') {
      stopLoginPolling()
      stopCountdown()
      await exchangeApprovedPhoneLogin()
    }
    if (body.status === 'REJECTED' || body.status === 'EXPIRED' || body.status === 'CONSUMED') {
      stopLoginPolling()
      stopCountdown()
      authNotice.value = ''
      authError.value = body.status === 'REJECTED'
        ? 'This login request was rejected on the phone.'
        : 'This login request is no longer active. Request a new code.'
    }
  } catch {
    authError.value = 'We could not check the phone approval yet.'
  }
}

function startCountdown() {
  stopCountdown()
  currentTimeMs.value = Date.now()
  loginCountdownTimer.value = window.setInterval(() => {
    currentTimeMs.value = Date.now()
    if (loginExpiresAt.value && new Date(loginExpiresAt.value).getTime() <= currentTimeMs.value) {
      loginStatus.value = loginStatus.value === 'PENDING' ? 'EXPIRED' : loginStatus.value
      authNotice.value = ''
      authError.value = 'This login request is no longer active. Request a new code.'
      stopLoginPolling()
      stopCountdown()
    }
  }, 1000)
}

function stopCountdown() {
  if (loginCountdownTimer.value) {
    window.clearInterval(loginCountdownTimer.value)
    loginCountdownTimer.value = null
  }
}

function resetPhoneLogin() {
  stopLoginPolling()
  stopCountdown()
  authError.value = ''
  authNotice.value = ''
  loginRequestId.value = ''
  loginCode.value = ''
  loginStatus.value = ''
  loginExpiresAt.value = ''
}

async function exchangeApprovedPhoneLogin() {
  if (!loginRequestId.value || !loginCode.value || exchangeInProgress.value) return
  exchangeInProgress.value = true
  authError.value = ''
  authNotice.value = 'Approval received. Opening the workspace.'
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-auth/login-requests/${loginRequestId.value}/exchange`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: loginCode.value, deviceId }),
    })
    if (!response.ok) throw new Error('request_failed')
    const body = (await response.json()) as AdminLoginExchangeResponse
    accessToken.value = body.accessToken
    refreshToken.value = body.refreshToken
    currentUser.value = body.user
    persistTokens()
    loginStatus.value = 'CONSUMED'
    authNotice.value = ''
    await verifySession()
  } catch {
    authError.value = 'Approval was received, but the workspace could not open. Request a new code.'
  } finally {
    exchangeInProgress.value = false
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

function humanize(value?: string | null): string {
  if (!value) return 'Not available'
  const specialLabels: Record<string, string> = {
    ADMIN: 'Admin',
    SUPER_ADMIN: 'Super admin',
    SUPPORT_AGENT: 'Support',
    CUSTOMER: 'Customer',
    COURIER: 'Courier',
    MERCHANT_OWNER: 'Merchant owner',
    MERCHANT_STAFF: 'Merchant staff',
    RELAY_PARTNER: 'Relay partner',
    GOOGLE: 'Google',
    EMAIL: 'Email',
    LOCAL_DEV: 'Demo',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    PAUSED: 'Paused',
    PENDING_REVIEW: 'Pending review',
    EXPRESS: 'Express',
    CLASSIC: 'Classic',
    HOME_DELIVERY: 'Home delivery',
    RELAY_POINT: 'Relay point',
    FASTEST_AVAILABLE: 'Fastest available',
    LOWEST_COST: 'Lowest cost',
    STANDARD: 'Standard',
    VALIDATED: 'Paid',
    PENDING: 'Pending',
    ACCEPTED_FOR_FULFILLMENT: 'Accepted for fulfillment',
    DELIVERED: 'Delivered',
    YAS_TOGO: 'Yas Togo',
    MOOV_AFRICA: 'Moov Africa',
  }
  return specialLabels[value] ?? value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function humanizeRoles(roles: RoleCode[]): string {
  return roles.map(humanize).join(', ')
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
  stopLoginPolling()
  stopCountdown()
  resetEmailFallback()
  accessToken.value = ''
  refreshToken.value = ''
  currentUser.value = null
  authError.value = ''
  authNotice.value = ''
  loginRequestId.value = ''
  loginCode.value = ''
  loginStatus.value = ''
  loginExpiresAt.value = ''
  sessionStorage.removeItem('sequo_admin_access_token')
  sessionStorage.removeItem('sequo_admin_refresh_token')
}

function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return ''
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem('sequo_admin_device_id')
  if (existing) return existing
  const generated = `sequo-admin-web-${crypto.randomUUID()}`
  localStorage.setItem('sequo_admin_device_id', generated)
  return generated
}

function browserDeviceLabel(): string {
  const platform = navigator.platform || 'computer'
  return `Admin web on ${platform}`.slice(0, 80)
}
</script>

<template>
  <main class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-logo" src="/brand/sequo-primary-light.png" alt="SEQUO" />
        <small>Management workspace</small>
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
          <span class="material-symbols-rounded" aria-hidden="true">{{ section.icon }}</span>
          <span class="nav-copy">
            <strong>{{ section.label }}</strong>
            <small>{{ section.statusLabel }}</small>
          </span>
        </button>
      </nav>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="topbar-title">
          <img class="topbar-logo" src="/brand/sequo-icon-green.png" alt="" />
          <div>
            <p class="eyebrow">SEQUO management</p>
            <h1>{{ active.label }}</h1>
          </div>
        </div>
        <div v-if="isAuthenticated" class="account-chip">
          <span class="material-symbols-rounded" aria-hidden="true">admin_panel_settings</span>
          <span>{{ currentUser?.displayName || currentUser?.email || 'SEQUO Admin' }}</span>
          <button class="secondary" type="button" @click="signOut">Sign out</button>
        </div>
      </header>

      <section v-if="!isAuthenticated" class="login-panel" aria-label="Admin login">
        <div class="login-hero">
          <div class="login-hero-copy">
            <img src="/brand/sequo-primary-light.png" alt="SEQUO" />
            <p class="eyebrow">Staff workspace</p>
            <h2>Manage daily SEQUO operations with clarity.</h2>
            <p>
              A calm control room for orders, merchants, riders, returns, relay points and finance follow-up.
              Demo mode lets the team explore the workflow before live access is connected.
            </p>
            <div class="hero-pills" aria-label="Main admin work areas">
              <span><span class="material-symbols-rounded" aria-hidden="true">receipt_long</span> Orders</span>
              <span><span class="material-symbols-rounded" aria-hidden="true">storefront</span> Merchants</span>
              <span><span class="material-symbols-rounded" aria-hidden="true">local_shipping</span> Deliveries</span>
            </div>
          </div>
          <div class="login-card">
            <label>
              Work email
              <input v-model="email" type="email" autocomplete="email" placeholder="admin@sequo.internal" />
            </label>
            <div v-if="loginCode" class="approval-code-card" aria-live="polite">
              <span class="material-symbols-rounded" aria-hidden="true">phonelink_lock</span>
              <div>
                <small>Approval code</small>
                <strong>{{ loginCode }}</strong>
                <p>Compare this code on your phone before approving.</p>
              </div>
            </div>
            <div v-if="loginRequestId" class="approval-status">
              <span class="status-pill">{{ loginStatusLabel }}</span>
              <span v-if="loginCountdownLabel">Time left {{ loginCountdownLabel }}</span>
              <span v-if="loginExpiresAt">Valid until {{ new Date(loginExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <p v-if="authNotice" class="notice-text">{{ authNotice }}</p>
            <p v-if="authError" class="error-text">{{ authError }}</p>
            <div class="login-actions">
              <button type="button" :disabled="!canRequestPhoneLogin" @click="requestPhoneLogin">
                <span class="material-symbols-rounded" aria-hidden="true">password</span>
                {{ authLoading ? 'Requesting...' : hasPendingPhoneLogin ? 'Request new code' : 'Request phone code' }}
              </button>
              <button v-if="!emailFallbackOpen" class="secondary" type="button" @click="openEmailFallback">
                <span class="material-symbols-rounded" aria-hidden="true">mail_lock</span>
                I cannot access my phone
              </button>
              <button class="secondary" type="button" @click="useMockLogin">
                <span class="material-symbols-rounded" aria-hidden="true">visibility</span>
                Open demo workspace
              </button>
              <button v-if="loginRequestId" class="secondary" type="button" @click="resetPhoneLogin">
                <span class="material-symbols-rounded" aria-hidden="true">alternate_email</span>
                Use another email
              </button>
            </div>
            <div v-if="emailFallbackOpen" class="email-fallback-card">
              <div>
                <strong>Email login code</strong>
                <p>Use this only when you cannot approve from your SEQUO app.</p>
              </div>
              <div class="email-code-row">
                <button type="button" :disabled="!canRequestEmailCode" @click="requestEmailCode">
                  <span class="material-symbols-rounded" aria-hidden="true">outgoing_mail</span>
                  {{ emailCodeLoading && !emailCodeRequested ? 'Sending...' : emailCodeRequested ? 'Send new code' : 'Send email code' }}
                </button>
                <span v-if="emailCodeRequested && !canRequestEmailCode && emailCodeRetryLabel">
                  Resend in {{ emailCodeRetryLabel }}
                </span>
              </div>
              <label v-if="emailCodeRequested">
                Email code
                <input
                  v-model="emailCode"
                  type="text"
                  inputmode="text"
                  autocomplete="one-time-code"
                  placeholder="ABC-DEF"
                  maxlength="16"
                  @input="sanitizeEmailCodeInput"
                />
              </label>
              <div v-if="emailCodeRequested" class="approval-status">
                <span class="status-pill">Email code sent</span>
                <span v-if="emailCodeCountdownLabel">Time left {{ emailCodeCountdownLabel }}</span>
              </div>
              <div class="login-actions">
                <button v-if="emailCodeRequested" type="button" :disabled="!canVerifyEmailCode" @click="verifyEmailCode">
                  <span class="material-symbols-rounded" aria-hidden="true">login</span>
                  {{ emailCodeLoading ? 'Checking...' : 'Verify and open workspace' }}
                </button>
                <button class="secondary" type="button" @click="resetEmailFallback">
                  <span class="material-symbols-rounded" aria-hidden="true">phonelink_lock</span>
                  Back to phone approval
                </button>
              </div>
            </div>
            <div class="social-login-card">
              <p>Use only on a trusted computer.</p>
              <div class="social-login-actions">
                <button
                  class="secondary"
                  type="button"
                  :disabled="!googleLoginReady || Boolean(socialLoginLoading)"
                  @click="startGoogleLogin"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">account_circle</span>
                  {{ socialLoginLoading === 'GOOGLE' ? 'Opening Google...' : 'Continue with Google' }}
                </button>
                <button class="secondary" type="button" disabled>
                  <span class="material-symbols-rounded" aria-hidden="true">lock</span>
                  Continue with Apple
                </button>
              </div>
              <small v-if="!googleLoginReady">Google login is not configured for this workspace yet.</small>
              <small>Apple login will be available after staff verification is ready.</small>
            </div>
            <p class="login-help">
              Approve from an already signed-in SEQUO mobile app. Use demo mode only for training.
            </p>
          </div>
        </div>
      </section>

      <template v-else>
        <section class="hero-band" aria-label="Operational overview">
          <div>
            <p class="eyebrow">Today in Lome</p>
            <h2>Start with what needs attention.</h2>
            <p>{{ active.description }}</p>
          </div>
          <div class="hero-actions">
            <button type="button" @click="selectSection('orders')">
              <span class="material-symbols-rounded" aria-hidden="true">receipt_long</span>
              View orders
            </button>
            <button class="secondary inverse" type="button" @click="selectSection('returns')">
              <span class="material-symbols-rounded" aria-hidden="true">assignment_return</span>
              Check returns
            </button>
          </div>
        </section>

        <section class="quick-grid" aria-label="Priority work">
          <button
            v-for="item in priorityActions"
            :key="item.label"
            class="quick-card"
            type="button"
            @click="selectSection(item.target)"
          >
            <span class="quick-icon material-symbols-rounded" aria-hidden="true">{{ item.icon }}</span>
            <span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.label }}</small>
            </span>
            <em>{{ item.detail }}</em>
          </button>
        </section>

        <section class="content-grid">
          <article v-if="active.id === 'dashboard'" class="panel dashboard-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Live operations</p>
                <h2>Dashboard</h2>
              </div>
              <button class="secondary" type="button" :disabled="dashboardLoading" @click="loadDashboard">
                <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
                {{ dashboardLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="dashboardError" class="error-text">{{ dashboardError }}</p>
            <div class="dashboard-grid" aria-label="Admin dashboard cards">
              <article v-for="card in dashboardCards" :key="card.label" class="dashboard-card">
                <div class="dashboard-card-top">
                  <span>{{ card.label }}</span>
                  <small :class="{ demo: card.source === 'Demo data' }">{{ card.source }}</small>
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
                <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
                {{ usersLoading ? 'Refreshing...' : 'Refresh' }}
              </button>
            </div>
            <p v-if="usersError" class="error-text">{{ usersError }}</p>
            <div class="filters">
              <input v-model="userSearch" type="search" placeholder="Search users, email, provider, role" />
              <select v-model="userRoleFilter" aria-label="Filter users by role">
                <option v-for="role in roleOptions" :key="role" :value="role">{{ role === 'ALL' ? 'All roles' : humanize(role) }}</option>
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
                <span role="cell"><span class="status-pill">{{ humanize(user.provider) }}</span></span>
                <span role="cell">{{ humanizeRoles(user.roles) }}</span>
                <span role="cell">{{ user.active ? humanize(user.status) : 'Inactive' }}</span>
              </div>
            </div>
          </article>

          <article v-else-if="active.id === 'merchants'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Commerce operations</p>
                <h2>Merchants</h2>
              </div>
              <button class="secondary" type="button" :disabled="merchantsLoading" @click="loadMerchants">
                <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
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
                  <span>{{ humanize(merchant.status) }}</span>
                </button>
              </div>
              <aside v-if="selectedMerchant" class="detail-card">
                <p class="eyebrow">Merchant detail</p>
                <h3>{{ selectedMerchant.name }}</h3>
                <dl>
                  <div><dt>Owner</dt><dd>{{ selectedMerchant.ownerUserId || 'Not available' }}</dd></div>
                  <div><dt>Wallet</dt><dd>{{ selectedMerchant.walletProvider || 'Not configured' }}</dd></div>
                  <div><dt>Catalog status</dt><dd>Product review tools are being prepared</dd></div>
                  <div><dt>Product count</dt><dd>Not available yet</dd></div>
                </dl>
                <button type="button" disabled>Product activation is not ready yet</button>
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
                <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
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
                    <small>{{ order.customerId }} · {{ humanize(order.route) }}</small>
                  </span>
                  <span>{{ humanize(order.paymentStatus) }}</span>
                  <span>{{ order.totalCfa.toLocaleString('en-US') }} CFA</span>
                  <span>{{ humanize(order.orderStatus) }}</span>
                </button>
              </div>
              <aside v-if="selectedOrder" class="detail-card">
                <p class="eyebrow">Order detail</p>
                <h3>{{ selectedOrder.customerFacingStatus }}</h3>
                <dl>
                  <div><dt>Service</dt><dd>{{ humanize(selectedOrder.serviceLevel) }} · {{ humanize(selectedOrder.fulfillmentPriority) }}</dd></div>
                  <div><dt>Items</dt><dd>{{ selectedOrder.itemSubtotalCfa.toLocaleString('en-US') }} CFA</dd></div>
                  <div><dt>Delivery</dt><dd>{{ selectedOrder.deliveryFeeCfa.toLocaleString('en-US') }} CFA</dd></div>
                  <div><dt>Provider</dt><dd>{{ humanize(selectedOrder.paymentProvider) }}</dd></div>
                </dl>
                <ol class="timeline">
                  <li>Order accepted for fulfillment</li>
                  <li>Merchant package preparation tracked</li>
                  <li>Courier delivery tracked</li>
                  <li>Relay fallback tracked when applicable</li>
                </ol>
                <button type="button" disabled>Operational changes are not ready yet</button>
              </aside>
            </div>
          </article>

          <article v-else-if="active.id === 'returns'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Reverse logistics</p>
                <h2>Returns and refunds</h2>
              </div>
            </div>
            <p>Refund actions stay behind physical receipt and condition check. Cash refunds are not supported in this admin flow.</p>
            <input v-model="returnSearch" type="search" placeholder="Search return, order, stage, refund status" />
            <div class="table" role="table" aria-label="Returns and refunds">
              <div class="table-row return-row table-head" role="row">
                <span role="columnheader">Return</span>
                <span role="columnheader">Stage</span>
                <span role="columnheader">Refund</span>
                <span role="columnheader">Action</span>
              </div>
              <div v-for="item in displayedReturns" :key="item.id" class="table-row return-row" role="row">
                <span role="cell">
                  <strong>{{ item.id }}</strong>
                  <small>{{ item.orderId }} · {{ item.requestedRefundCfa.toLocaleString('en-US') }} CFA</small>
                </span>
                <span role="cell">{{ item.stage }}</span>
                <span role="cell">{{ item.refundStatus }}</span>
                <span role="cell">
                  <strong>{{ item.action }}</strong>
                  <small>{{ item.nextStep }}</small>
                </span>
              </div>
            </div>
          </article>

          <article v-else-if="active.id === 'settings'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Business rules</p>
                <h2>Business parameters</h2>
              </div>
            </div>
            <p>These values control delivery prices, commissions, referrals, returns and relay fees. Some settings are view-only while SEQUO finishes the approval process for changes.</p>
            <div class="settings-grid" aria-label="Business parameters">
              <article v-for="parameter in businessParameters" :key="parameter.label" class="setting-row">
                <div>
                  <strong>{{ parameter.label }}</strong>
                  <small>{{ parameter.owner }}</small>
                </div>
                <span>{{ parameter.value }}</span>
                <button type="button" disabled>{{ parameter.actionLabel }}</button>
              </article>
            </div>
          </article>

          <article v-else class="panel section-overview">
            <div class="section-hero-icon material-symbols-rounded" aria-hidden="true">{{ active.icon }}</div>
            <div>
              <p class="eyebrow">{{ active.statusLabel }}</p>
              <h2>{{ active.label }}</h2>
              <p>{{ active.description }}</p>
            </div>
            <div class="table" role="table" aria-label="Section rows">
              <div class="table-row table-head" role="row">
                <span role="columnheader">Item</span>
                <span role="columnheader">Meaning</span>
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
            <p class="eyebrow">Staff reminders</p>
            <ul>
              <li>Check the customer, merchant and order before taking action.</li>
              <li>Do not share private customer or payment information outside SEQUO.</li>
              <li>Leave unavailable actions disabled until a supervisor enables them.</li>
              <li>Use clear notes when a case needs follow-up.</li>
            </ul>
          </aside>
        </section>
      </template>
    </section>
  </main>
</template>
