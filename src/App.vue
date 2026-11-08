<script setup lang="ts">
import { referenceText, clearAdminReferenceCache, referenceSearchQuery } from "./adminReferences";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from "vue";
import {
  readAdminSection,
  type AdminReadGroup,
  type AdminReadSection,
} from "./adminReads";
import ConsolidationPanel from "./ConsolidationPanel.vue";
import ReturnOperationsPanel from "./ReturnOperationsPanel.vue";
import FinanceLedgerPanel from "./FinanceLedgerPanel.vue";
import PaymentInvestigationPanel from "./PaymentInvestigationPanel.vue";
import CommissionOverridePanel from "./CommissionOverridePanel.vue";
import AdminReferenceInput from "./AdminReferenceInput.vue";
import AdminIcon from "./AdminIcon.vue";
import OperationsControlPanel from "./OperationsControlPanel.vue";
import LocalFixtureGuide from "./LocalFixtureGuide.vue";
import AdminProductMediaPanel from "./AdminProductMediaPanel.vue";
import AdminEnrollmentPanel from "./AdminEnrollmentPanel.vue";
import RelayAdministrationPanel from "./RelayAdministrationPanel.vue";

type SectionId =
  | "dashboard"
  | "users"
  | "merchants"
  | "orders"
  | "deliveries"
  | "payments"
  | "commissions"
  | "returns"
  | "relay"
  | "settings"
  | "catalog"
  | "riders"
  | "negotiations"
  | "cooperatives"
  | "benefits"
  | "notifications"
  | "audit";

type Section = {
  id: SectionId;
  label: string;
  statusLabel: "Ready" | "View only" | "Setup needed";
  description: string;
  icon: string;
};

type RoleCode =
  | "CUSTOMER"
  | "MERCHANT_OWNER"
  | "MERCHANT_STAFF"
  | "COURIER"
  | "RELAY_PARTNER"
  | "SUPPORT_AGENT"
  | "ADMIN"
  | "SUPER_ADMIN";

type CurrentUser = {
  id: string;
  email?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  provider: string;
  status: string;
  active: boolean;
  roles: RoleCode[];
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type SocialProvider = "GOOGLE" | "APPLE";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityServices = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      prompt: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

type AdminLoginRequestStatus =
  "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONSUMED";

type AdminLoginStartResponse = {
  requestId: string;
  code: string;
  expiresAt: string;
  pollingIntervalSeconds: number;
};

type AdminLoginStatusResponse = {
  status: AdminLoginRequestStatus;
  expiresAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
};

type AdminLoginExchangeResponse = AuthTokens & {
  user: CurrentUser;
};

type AdminEmailCodeRequestResponse = {
  status: string;
  expiresInSeconds: number;
  retryAfterSeconds: number;
};

type AdminOverview = {
  totals?: {
    orders?: number;
  };
};

type AdminOperationsSnapshot = {
  deliveryCapacity?: {
    activeMissions?: number;
    pausedCouriers?: number;
    problemMissions?: unknown[];
  };
  merchantFulfillment?: {
    sellerBacklog?: number;
    readyForPickup?: number;
  };
  relayOperations?: {
    delayedParcels?: number;
    problemParcels?: number;
  };
  payoutQueue?: {
    merchantPayoutCandidates?: number;
  };
  returnBottlenecks?: {
    returnsWaitingRelayAction?: number;
    returnsWaitingSequoCollection?: number;
    returnsInProblem?: number;
    returnsAwaitingHandoff?: number;
    returnsAwaitingInspection?: number;
  };
};

type DashboardCard = {
  label: string;
  value: string;
  detail: string;
};

type AdminUserRow = {
  id: string;
  email?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  provider: string;
  status: string;
  active: boolean;
  roles: RoleCode[];
};

type AdminMerchantRow = {
  id: string;
  ownerUserId?: string | null;
  name: string;
  status: string;
  commissionRateBps: number;
  walletProvider?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type AdminOrderRow = {
  id: string;
  customerId: string;
  serviceLevel: string;
  route: string;
  fulfillmentPriority: string;
  customerFacingStatus: string;
  itemSubtotalCfa: number;
  deliveryFeeCfa: number;
  totalCfa: number;
  paymentProvider: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt?: string;
  updatedAt?: string;
};

const apiBaseUrl =
  import.meta.env.VITE_SEQUO_API_BASE_URL ?? "http://localhost:8080";
const releaseId = (import.meta.env.VITE_SEQUO_RELEASE_ID ?? "").trim();
const releaseEnvironment = (
  import.meta.env.VITE_SEQUO_RELEASE_ENVIRONMENT ?? ""
).trim();
const releaseEnvironmentLabel =
  releaseEnvironment === "LOCAL_FIXTURE"
    ? "Local fixture"
    : releaseEnvironment === "STAGING"
      ? "Staging"
      : releaseEnvironment;
const relayOperationsUrl = computed(() =>
  localDevelopmentPage && developmentAccess.value
    ? "/relay-operator.html?session=local-admin"
    : `${apiBaseUrl.replace(/\/$/, "")}/relay-operator.html`,
);
const googleWebClientId = (
  import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? ""
).trim();
const activeSection = ref<SectionId>("dashboard");
const email = ref("");
const accessToken = ref("");
const refreshToken = ref("");
const currentUser = ref<CurrentUser | null>(null);
watch(() => currentUser.value?.id, () => clearAdminReferenceCache(), { flush: "sync" });
const authError = ref("");
const authNotice = ref("");
const authLoading = ref(false);
const loginRequestId = ref("");
const loginCode = ref("");
const loginStatus = ref<AdminLoginRequestStatus | "">("");
const loginExpiresAt = ref("");
const loginPollingIntervalSeconds = ref(2);
const loginPollTimer = ref<ReturnType<typeof window.setInterval> | null>(null);
const loginCountdownTimer = ref<ReturnType<typeof window.setInterval> | null>(
  null,
);
const currentTimeMs = ref(Date.now());
const exchangeInProgress = ref(false);
const emailFallbackOpen = ref(false);
const emailCode = ref("");
const emailCodeRequested = ref(false);
const emailCodeLoading = ref(false);
const emailCodeRequestedAtMs = ref(0);
const emailCodeExpiresInSeconds = ref(0);
const emailCodeRetryAfterSeconds = ref(0);
const emailCodeTimer = ref<ReturnType<typeof window.setInterval> | null>(null);
const socialLoginLoading = ref<SocialProvider | "">("");
const dashboardLoading = ref(false);
const dashboardError = ref("");
const dashboardOverview = ref<AdminOverview | null>(null);
const dashboardSnapshot = ref<AdminOperationsSnapshot | null>(null);
const usersLoading = ref(false);
const usersError = ref("");
const userSearch = ref("");
const userRoleFilter = ref<"ALL" | RoleCode>("ALL");
const adminUsers = ref<AdminUserRow[]>([]);
const merchantsLoading = ref(false);
const merchantsError = ref("");
const merchantSearch = ref("");
const selectedMerchantId = ref("");
const adminMerchants = ref<AdminMerchantRow[]>([]);
const ordersLoading = ref(false);
const ordersError = ref("");
const orderSearch = ref("");
const selectedOrderId = ref("");
const adminOrders = ref<AdminOrderRow[]>([]);
const sectionLoading = ref(false);
const sectionError = ref("");
const sectionGroups = ref<AdminReadGroup[]>([]);
const assignmentMissionId = ref("");
const localFixtureTarget = ref<{
  category: SectionId;
  ids: Record<string, string>;
} | null>(null);
let sectionRequest = 0;
let sessionVersion = 0;
let refreshInFlight: Promise<boolean> | null = null;
const deviceId = getOrCreateDeviceId();
let googleScriptPromise: Promise<void> | null = null;
const isAdmin = computed(() =>
  Boolean(
    currentUser.value?.active &&
    currentUser.value.roles.some(
      (role) => role === "ADMIN" || role === "SUPER_ADMIN",
    ),
  ),
);
const isAuthenticated = computed(() =>
  Boolean(accessToken.value.trim() && isAdmin.value),
);
const hasPendingPhoneLogin = computed(() =>
  Boolean(
    loginRequestId.value && loginCode.value && loginStatus.value === "PENDING",
  ),
);
const canRequestPhoneLogin = computed(
  () =>
    Boolean(email.value.trim()) &&
    !authLoading.value &&
    !exchangeInProgress.value,
);
const emailCodeExpiresAtMs = computed(
  () => emailCodeRequestedAtMs.value + emailCodeExpiresInSeconds.value * 1000,
);
const emailCodeRetryAtMs = computed(
  () => emailCodeRequestedAtMs.value + emailCodeRetryAfterSeconds.value * 1000,
);
const emailCodeCountdownLabel = computed(() =>
  formatRemainingTime(emailCodeExpiresAtMs.value - currentTimeMs.value),
);
const emailCodeRetryLabel = computed(() =>
  formatRemainingTime(emailCodeRetryAtMs.value - currentTimeMs.value),
);
const canRequestEmailCode = computed(
  () =>
    Boolean(email.value.trim()) &&
    emailFallbackOpen.value &&
    !authLoading.value &&
    !emailCodeLoading.value &&
    (!emailCodeRequested.value ||
      currentTimeMs.value >= emailCodeRetryAtMs.value),
);
const canVerifyEmailCode = computed(
  () =>
    Boolean(email.value.trim()) &&
    Boolean(emailCode.value.trim()) &&
    emailCodeRequested.value &&
    !authLoading.value &&
    !emailCodeLoading.value,
);
const googleLoginReady = computed(() => Boolean(googleWebClientId));
const loginStatusLabel = computed(() => {
  if (!loginStatus.value) return "Ready";
  return humanize(loginStatus.value);
});
const loginCountdownLabel = computed(() => {
  if (!loginExpiresAt.value) return "";
  const remainingMs =
    new Date(loginExpiresAt.value).getTime() - currentTimeMs.value;
  if (remainingMs <= 0) return "Expired";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
});

const sections: Section[] = [
  {
    id: "dashboard",
    label: "Overview",
    description:
      "Your operation at a glance. The right next action, in one place.",
    icon: "dashboard",
    statusLabel: "Ready",
  },
  {
    id: "orders",
    label: "Orders",
    description: "Follow every order, payment state and customer handoff.",
    icon: "receipt_long",
    statusLabel: "Ready",
  },
  {
    id: "deliveries",
    label: "Deliveries",
    description:
      "Dispatch, coordinate pickups and resolve delivery exceptions.",
    icon: "local_shipping",
    statusLabel: "Ready",
  },
  {
    id: "relay",
    label: "Relay points",
    description: "Manage relay sites, parcel custody and overdue operations.",
    icon: "inventory_2",
    statusLabel: "Ready",
  },
  {
    id: "returns",
    label: "Returns",
    description:
      "Follow returns from customer request to inspection and refund instruction.",
    icon: "assignment_return",
    statusLabel: "Ready",
  },
  {
    id: "merchants",
    label: "Merchants",
    description: "Manage your merchant network and its operating access.",
    icon: "storefront",
    statusLabel: "Ready",
  },
  {
    id: "catalog",
    label: "Catalog",
    description: "Products, availability, food options and publishing policy.",
    icon: "catalog",
    statusLabel: "Ready",
  },
  {
    id: "riders",
    label: "Riders",
    description:
      "Your delivery workforce, assignments and recorded remuneration.",
    icon: "riders",
    statusLabel: "Ready",
  },
  {
    id: "users",
    label: "Users",
    description: "People, roles and authorized access across SEQUO.",
    icon: "groups",
    statusLabel: "Ready",
  },
  {
    id: "cooperatives",
    label: "Cooperatives",
    description: "Review merchant groupings and shared collection workflows.",
    icon: "cooperatives",
    statusLabel: "Ready",
  },
  {
    id: "payments",
    label: "Payments",
    description:
      "Investigate payments, settlement records and provider readiness.",
    icon: "payments",
    statusLabel: "Ready",
  },
  {
    id: "commissions",
    label: "Commissions",
    description: "Review effective rates and manage merchant overrides.",
    icon: "percent",
    statusLabel: "Ready",
  },
  {
    id: "negotiations",
    label: "Negotiations",
    description:
      "Review the available bargaining controls and participant boundaries.",
    icon: "negotiations",
    statusLabel: "Ready",
  },
  {
    id: "benefits",
    label: "Benefits",
    description: "Subscription, loyalty and referral policy visibility.",
    icon: "benefits",
    statusLabel: "Ready",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Staff inbox and available communication controls.",
    icon: "notifications",
    statusLabel: "Ready",
  },
  {
    id: "audit",
    label: "Activity",
    description: "Recorded operational events, exceptions and actor history.",
    icon: "audit",
    statusLabel: "Ready",
  },
  {
    id: "settings",
    label: "Settings",
    description:
      "Effective business parameters and available configuration workflows.",
    icon: "tune",
    statusLabel: "Ready",
  },
];

const defaultSection = sections[0] as Section;
const active = computed<Section>(
  () =>
    sections.find((section) => section.id === activeSection.value) ??
    defaultSection,
);
const metrics = computed(() => [
  { label: "Workspace", value: "SEQUO operations" },
  {
    label: "Access",
    value: isAuthenticated.value ? "Staff verified" : "Login required",
  },
  { label: "Section", value: active.value.label },
]);

const priorityActions = computed(() => [
  {
    label: "Total orders",
    value: dashboardCards.value[0]?.value ?? "—",
    detail: "Open the order list first",
    target: "orders" as SectionId,
    icon: "pending_actions",
  },
  {
    label: "Packages to collect",
    value: dashboardCards.value[1]?.value ?? "—",
    detail: "Coordinate merchant pickup",
    target: "deliveries" as SectionId,
    icon: "package_2",
  },
  {
    label: "Returns to review",
    value: formatKnownCount(dashboardSnapshot.value?.returnBottlenecks?.returnsAwaitingInspection),
    detail: "Received packages awaiting an inspection decision",
    target: "returns" as SectionId,
    icon: "assignment_return",
  },
  {
    label: "Merchant payouts",
    value: dashboardCards.value[5]?.value ?? "—",
    detail: "Accrued, eligible, or failed merchant payout records",
    target: "payments" as SectionId,
    icon: "account_balance_wallet",
  },
]);

function formatKnownCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? formatCount(value)
    : "—";
}
function formatKnownSum(...values: (number | undefined)[]): string {
  return values.every(
    (value) => typeof value === "number" && Number.isFinite(value),
  )
    ? formatCount(values.reduce<number>((sum, value) => sum + value!, 0))
    : "—";
}

const dashboardCards = computed<DashboardCard[]>(() => {
  const snapshot = dashboardSnapshot.value;
  const overview = dashboardOverview.value;
  if (!overview || !snapshot) return [];
  return [
    {
      label: "Total orders",
      value: formatKnownCount(overview?.totals?.orders),
      detail: "Total orders visible to the admin team",
    },
    {
      label: "Merchant packages waiting",
      value: formatKnownCount(snapshot?.merchantFulfillment?.sellerBacklog),
      detail: `${formatKnownCount(snapshot?.merchantFulfillment?.readyForPickup)} ready for pickup`,
    },
    {
      label: "Active deliveries",
      value: formatKnownCount(snapshot?.deliveryCapacity?.activeMissions),
      detail: "Created, offered, accepted, pickup, relay, or problem states",
    },
    {
      label: "Relay overdue packages",
      value: formatKnownCount(snapshot?.relayOperations?.delayedParcels),
      detail: `${formatKnownCount(snapshot?.relayOperations?.problemParcels)} relay problems`,
    },
    {
      label: "Returns awaiting handoff",
      value: formatKnownCount(snapshot?.returnBottlenecks?.returnsAwaitingHandoff),
      detail: "Awaiting customer drop-off, SEQUO collection, or physical receipt",
    },
    {
      label: "Merchant payouts",
      value: formatKnownCount(snapshot?.payoutQueue?.merchantPayoutCandidates),
      detail: "Accrued, eligible, or failed merchant payout records",
    },
    {
      label: "Courier availability issues",
      value: formatKnownSum(
        snapshot?.deliveryCapacity?.pausedCouriers,
        snapshot?.deliveryCapacity?.problemMissions?.length,
      ),
      detail: "Paused couriers plus problem missions",
    },
  ];
});

const roleOptions: Array<"ALL" | RoleCode> = [
  "ALL",
  "CUSTOMER",
  "COURIER",
  "MERCHANT_OWNER",
  "MERCHANT_STAFF",
  "RELAY_PARTNER",
  "SUPPORT_AGENT",
  "ADMIN",
  "SUPER_ADMIN",
];
const displayedUsers = computed(() => {
  const source = adminUsers.value;
  const query = referenceSearchQuery(userSearch.value);
  return source
    .filter(
      (user) =>
        userRoleFilter.value === "ALL" ||
        user.roles.includes(userRoleFilter.value),
    )
    .filter((user) => {
      if (!query) return true;
      return [
        user.email,
        user.phoneNumber,
        user.displayName,
        user.id,
        referenceText(user),
        user.provider,
        user.status,
        user.roles.join(" "),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
});
const displayedMerchants = computed(() => {
  const source = adminMerchants.value;
  const query = referenceSearchQuery(merchantSearch.value);
  return source.filter((merchant) => {
    if (!query) return true;
    return [
      merchant.id,
      referenceText(merchant),
      referenceText(merchant, "ownerUserId"),
      merchant.name,
      merchant.status,
      merchant.walletProvider,
      merchant.ownerUserId,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
});
const selectedMerchant = computed(
  () =>
    displayedMerchants.value.find(
      (merchant) => merchant.id === selectedMerchantId.value,
    ) ??
    displayedMerchants.value[0] ??
    null,
);
const displayedOrders = computed(() => {
  const source = adminOrders.value;
  const query = referenceSearchQuery(orderSearch.value);
  return source.filter((order) => {
    if (!query) return true;
    return [
      order.id,
      referenceText(order),
      referenceText(order, "customerId"),
      order.customerId,
      order.serviceLevel,
      order.route,
      order.paymentStatus,
      order.orderStatus,
      order.customerFacingStatus,
    ].some((value) => String(value).toLowerCase().includes(query));
  });
});
const selectedOrder = computed(
  () =>
    displayedOrders.value.find((order) => order.id === selectedOrderId.value) ??
    displayedOrders.value[0] ??
    null,
);
function selectSection(section: SectionId, updateLocation = true) {
  if (localFixtureTarget.value?.category !== section)
    localFixtureTarget.value = null;
  activeSection.value = section;
  mobileNavOpen.value = false;
  if (updateLocation && window.location.hash !== `#${section}`)
    window.history.pushState({}, "", `#${section}`);
  if (!isAuthenticated.value) return;
  sectionRequest++;
  sectionGroups.value = [];
  sectionError.value = "";
  sectionLoading.value = false;
  switch (section) {
    case "dashboard":
      void loadDashboard();
      break;
    case "users":
      void loadUsers();
      break;
    case "merchants":
      void loadMerchants();
      break;
    case "orders":
      void loadOrders();
      break;
    case "deliveries":
    case "payments":
    case "commissions":
    case "relay":
    case "settings":
      void loadSection(section);
      break;
  }
}

onMounted(() => {
  void loadDevelopmentAccess();
  onWorkspaceLocation();
  window.addEventListener("keydown", onWorkspaceKeydown);
  window.addEventListener("popstate", onWorkspaceLocation);
  window.addEventListener("pageshow", onWorkspacePageShow);
  workspacePollTimer = window.setInterval(() => {
    if (
      autoRefresh.value &&
      isAuthenticated.value &&
      !activeLoading.value &&
      document.visibilityState === "visible"
    )
      refreshWorkspace();
  }, 30_000);
  accessToken.value = sessionStorage.getItem("sequo_admin_access_token") ?? "";
  refreshToken.value =
    sessionStorage.getItem("sequo_admin_refresh_token") ?? "";
  if (accessToken.value.trim()) {
    void verifySession();
  } else if (refreshToken.value) {
    clearSession();
  }
});

onUnmounted(() => {
  if (workspacePollTimer) window.clearInterval(workspacePollTimer);
  window.removeEventListener("keydown", onWorkspaceKeydown);
  window.removeEventListener("popstate", onWorkspaceLocation);
  window.removeEventListener("pageshow", onWorkspacePageShow);
  stopLoginPolling();
  stopCountdown();
  stopEmailCodeTimer();
});

async function verifySession() {
  if (!accessToken.value.trim()) {
    authError.value = "Request a phone login before continuing.";
    return;
  }
  const version = sessionVersion;
  currentUser.value = null;
  authLoading.value = true;
  authError.value = "";
  try {
    const user = await apiRequest<CurrentUser>("/api/auth/me");
    if (
      !user.active ||
      !Array.isArray(user.roles) ||
      !user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN")
    ) {
      clearSession();
      authError.value = "This account is not allowed to use SEQUO Admin.";
      return;
    }
    currentUser.value = user;
    persistTokens();
    selectSection(activeSection.value);
  } catch {
    if (version === sessionVersion) {
      clearSession();
      authError.value = "We could not verify this admin session.";
    }
  } finally {
    authLoading.value = false;
  }
}

async function requestPhoneLogin() {
  if (!canRequestPhoneLogin.value) return;
  stopLoginPolling();
  stopCountdown();
  resetEmailFallback();
  authLoading.value = true;
  authError.value = "";
  authNotice.value = "";
  loginRequestId.value = "";
  loginCode.value = "";
  loginStatus.value = "";
  loginExpiresAt.value = "";
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin-auth/login-requests`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.value.trim(),
          deviceLabel: browserDeviceLabel(),
          browserInfo: navigator.userAgent.slice(0, 180),
        }),
      },
    );
    if (!response.ok) throw new Error("request_failed");
    const body = (await response.json()) as AdminLoginStartResponse;
    loginRequestId.value = body.requestId;
    loginCode.value = body.code;
    loginExpiresAt.value = body.expiresAt;
    loginPollingIntervalSeconds.value = Math.max(
      2,
      body.pollingIntervalSeconds || 2,
    );
    loginStatus.value = "PENDING";
    authNotice.value = "Open SEQUO on your phone and approve this code.";
    startCountdown();
    startLoginPolling();
  } catch {
    authError.value =
      "We could not create a phone login request. Try again in a moment.";
  } finally {
    authLoading.value = false;
  }
}

function openEmailFallback() {
  resetPhoneLogin();
  emailFallbackOpen.value = true;
  authError.value = "";
  authNotice.value =
    "Use this only when you cannot approve from your SEQUO app.";
}

function resetEmailFallback() {
  stopEmailCodeTimer();
  emailFallbackOpen.value = false;
  emailCode.value = "";
  emailCodeRequested.value = false;
  emailCodeLoading.value = false;
  emailCodeRequestedAtMs.value = 0;
  emailCodeExpiresInSeconds.value = 0;
  emailCodeRetryAfterSeconds.value = 0;
}

async function requestEmailCode() {
  if (!canRequestEmailCode.value) return;
  stopLoginPolling();
  stopCountdown();
  emailCodeLoading.value = true;
  authError.value = "";
  authNotice.value = "";
  emailCode.value = "";
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin-auth/email-codes`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.value.trim() }),
    });
    if (!response.ok) throw new Error("request_failed");
    const body = (await response.json()) as AdminEmailCodeRequestResponse;
    emailCodeRequested.value = true;
    emailCodeRequestedAtMs.value = Date.now();
    emailCodeExpiresInSeconds.value = Math.max(
      60,
      body.expiresInSeconds || 300,
    );
    emailCodeRetryAfterSeconds.value = Math.max(
      30,
      body.retryAfterSeconds || 60,
    );
    currentTimeMs.value = Date.now();
    authNotice.value =
      "If this account can use SEQUO Admin, a login code will arrive by email.";
    startEmailCodeTimer();
  } catch {
    authError.value = "We could not send an email code. Try again in a moment.";
  } finally {
    emailCodeLoading.value = false;
  }
}

async function verifyEmailCode() {
  if (!canVerifyEmailCode.value) return;
  emailCodeLoading.value = true;
  authError.value = "";
  authNotice.value = "";
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin-auth/email-codes/verify`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.value.trim(),
          code: emailCode.value.trim(),
          deviceId,
          ...adminDeviceMetadata(),
        }),
      },
    );
    if (!response.ok) throw new Error("request_failed");
    const body = (await response.json()) as AdminLoginExchangeResponse;
    accessToken.value = body.accessToken;
    refreshToken.value = body.refreshToken;
    persistTokens();
    resetEmailFallback();
    await verifySession();
  } catch {
    authError.value =
      "We could not verify this email code. Check the code or request a new one.";
  } finally {
    emailCodeLoading.value = false;
  }
}

async function startGoogleLogin() {
  if (!googleLoginReady.value || socialLoginLoading.value) return;
  socialLoginLoading.value = "GOOGLE";
  authError.value = "";
  authNotice.value = "Use social login only on a trusted computer.";
  try {
    await loadGoogleIdentityServices();
    const googleId = window.google?.accounts.id;
    if (!googleId) throw new Error("google_unavailable");
    googleId.initialize({
      client_id: googleWebClientId,
      callback: (response) => {
        void completeSocialLogin("GOOGLE", response.credential);
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    googleId.prompt();
    authNotice.value = "Choose the Google account allowed for SEQUO Admin.";
  } catch {
    authError.value =
      "Google login is not available right now. Use phone approval instead.";
  } finally {
    socialLoginLoading.value = "";
  }
}

async function completeSocialLogin(
  provider: SocialProvider,
  providerToken?: string,
) {
  if (!providerToken) {
    authError.value =
      "Social login could not be completed. Use phone approval instead.";
    return;
  }
  socialLoginLoading.value = provider;
  authError.value = "";
  authNotice.value = "";
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/social/${provider}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: providerToken,
        device: {
          deviceId,
          appSource: "SEQUO_ADMIN",
          ...adminDeviceMetadata(),
        },
      }),
    });
    if (!response.ok) throw new Error("social_login_failed");
    const tokens = (await response.json()) as AuthTokens;
    accessToken.value = tokens.accessToken;
    refreshToken.value = tokens.refreshToken;
    persistTokens();
    await verifySession();
  } catch {
    clearSession();
    authError.value =
      "Social login could not open SEQUO Admin. Use phone approval instead.";
  } finally {
    socialLoginLoading.value = "";
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("google_script_failed"));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

function sanitizeEmailCodeInput() {
  emailCode.value = emailCode.value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 16);
}

function startEmailCodeTimer() {
  stopEmailCodeTimer();
  currentTimeMs.value = Date.now();
  emailCodeTimer.value = window.setInterval(() => {
    currentTimeMs.value = Date.now();
    if (
      emailCodeRequested.value &&
      emailCodeExpiresAtMs.value <= currentTimeMs.value
    ) {
      authNotice.value = "";
      authError.value = "This email code expired. Request a new one.";
      stopEmailCodeTimer();
    }
  }, 1000);
}

function stopEmailCodeTimer() {
  if (emailCodeTimer.value) {
    window.clearInterval(emailCodeTimer.value);
    emailCodeTimer.value = null;
  }
}

function startLoginPolling() {
  stopLoginPolling();
  void pollPhoneLoginStatus();
  loginPollTimer.value = window.setInterval(() => {
    void pollPhoneLoginStatus();
  }, loginPollingIntervalSeconds.value * 1000);
}

function stopLoginPolling() {
  if (loginPollTimer.value) {
    window.clearInterval(loginPollTimer.value);
    loginPollTimer.value = null;
  }
}

async function pollPhoneLoginStatus() {
  if (!loginRequestId.value || exchangeInProgress.value) return;
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin-auth/login-requests/${loginRequestId.value}`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error("request_failed");
    const body = (await response.json()) as AdminLoginStatusResponse;
    loginStatus.value = body.status;
    loginExpiresAt.value = body.expiresAt;
    if (body.status === "APPROVED") {
      stopLoginPolling();
      stopCountdown();
      await exchangeApprovedPhoneLogin();
    }
    if (
      body.status === "REJECTED" ||
      body.status === "EXPIRED" ||
      body.status === "CONSUMED"
    ) {
      stopLoginPolling();
      stopCountdown();
      authNotice.value = "";
      authError.value =
        body.status === "REJECTED"
          ? "This login request was rejected on the phone."
          : "This login request is no longer active. Request a new code.";
    }
  } catch {
    authError.value = "We could not check the phone approval yet.";
  }
}

function startCountdown() {
  stopCountdown();
  currentTimeMs.value = Date.now();
  loginCountdownTimer.value = window.setInterval(() => {
    currentTimeMs.value = Date.now();
    if (
      loginExpiresAt.value &&
      new Date(loginExpiresAt.value).getTime() <= currentTimeMs.value
    ) {
      loginStatus.value =
        loginStatus.value === "PENDING" ? "EXPIRED" : loginStatus.value;
      authNotice.value = "";
      authError.value =
        "This login request is no longer active. Request a new code.";
      stopLoginPolling();
      stopCountdown();
    }
  }, 1000);
}

function stopCountdown() {
  if (loginCountdownTimer.value) {
    window.clearInterval(loginCountdownTimer.value);
    loginCountdownTimer.value = null;
  }
}

function resetPhoneLogin() {
  stopLoginPolling();
  stopCountdown();
  authError.value = "";
  authNotice.value = "";
  loginRequestId.value = "";
  loginCode.value = "";
  loginStatus.value = "";
  loginExpiresAt.value = "";
}

async function exchangeApprovedPhoneLogin() {
  if (!loginRequestId.value || !loginCode.value || exchangeInProgress.value)
    return;
  exchangeInProgress.value = true;
  authError.value = "";
  authNotice.value = "Approval received. Opening the workspace.";
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin-auth/login-requests/${loginRequestId.value}/exchange`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: loginCode.value,
          deviceId,
          ...adminDeviceMetadata(),
        }),
      },
    );
    if (!response.ok) throw new Error("request_failed");
    const body = (await response.json()) as AdminLoginExchangeResponse;
    accessToken.value = body.accessToken;
    refreshToken.value = body.refreshToken;
    persistTokens();
    loginStatus.value = "CONSUMED";
    authNotice.value = "";
    await verifySession();
  } catch {
    authError.value =
      "Approval was received, but the workspace could not open. Request a new code.";
  } finally {
    exchangeInProgress.value = false;
  }
}

async function loadRead<T>(
  loading: Ref<boolean>,
  error: Ref<string>,
  read: () => Promise<T>,
  apply: (data: T) => void,
  reset: () => void,
  failure: string,
) {
  if (!isAuthenticated.value || loading.value) return;
  const version = sessionVersion;
  loading.value = true;
  error.value = "";
  try {
    const data = await read();
    if (version === sessionVersion) {
      apply(data);
      lastUpdatedAt.value = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    if (version === sessionVersion) {
      reset();
      error.value = failure;
    }
  } finally {
    if (version === sessionVersion) loading.value = false;
  }
}

function loadOrders() {
  return loadRead(
    ordersLoading,
    ordersError,
    () => apiRequest<AdminOrderRow[]>("/api/admin/web/orders"),
    (rows) => {
      if (!Array.isArray(rows)) throw new Error("invalid_orders_response");
      adminOrders.value = rows;
    },
    () => {
      adminOrders.value = [];
    },
    "Could not load orders. Refresh to try again.",
  );
}

function loadMerchants() {
  return loadRead(
    merchantsLoading,
    merchantsError,
    () => apiRequest<AdminMerchantRow[]>("/api/admin/web/merchants"),
    (rows) => {
      if (!Array.isArray(rows)) throw new Error("invalid_merchants_response");
      adminMerchants.value = rows;
    },
    () => {
      adminMerchants.value = [];
    },
    "Could not load merchants. Refresh to try again.",
  );
}

function loadUsers() {
  return loadRead(
    usersLoading,
    usersError,
    () => apiRequest<AdminUserRow[]>("/api/admin/web/users"),
    (rows) => {
      if (!Array.isArray(rows)) throw new Error("invalid_users_response");
      adminUsers.value = rows;
    },
    () => {
      adminUsers.value = [];
    },
    "Could not load users. Refresh to try again.",
  );
}

function loadDashboard() {
  void loadOrders();
  return loadRead(
    dashboardLoading,
    dashboardError,
    () =>
      Promise.all([
        apiRequest<AdminOverview>("/api/admin/web/overview"),
        apiRequest<AdminOperationsSnapshot>("/api/admin/monitoring/operations"),
      ]),
    ([overview, snapshot]) => {
      dashboardOverview.value = overview;
      dashboardSnapshot.value = snapshot;
    },
    () => {
      dashboardOverview.value = null;
      dashboardSnapshot.value = null;
    },
    "Could not load dashboard data. Refresh to try again.",
  );
}

async function loadSection(section: AdminReadSection) {
  const request = ++sectionRequest;
  sectionGroups.value = [];
  sectionError.value = "";
  sectionLoading.value = true;
  try {
    const groups = await readAdminSection(section, apiRequest);
    if (request === sectionRequest) sectionGroups.value = groups;
  } catch {
    if (request === sectionRequest)
      sectionError.value = "Could not load this section. Refresh to try again.";
  } finally {
    if (request === sectionRequest) sectionLoading.value = false;
  }
}

async function preparePolicyAssignment() {
  const missionId = assignmentMissionId.value.trim();
  if (!isAuthenticated.value || !missionId || missionId.length > 128) return;
  await serviceControls.value?.openAction(
    "delivery-missions",
    "assign-policy",
    { missionId },
  );
  serviceControls.value?.$el?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function apiRequest<T>(
  path: string,
  retryAfterRefresh = true,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const version = sessionVersion;
  const token = accessToken.value;
  const multipart = body instanceof FormData;
  if (!token.trim()) throw new Error("missing_session");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body === undefined || multipart ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: multipart ? body as FormData : JSON.stringify(body) }),
  });
  if (version !== sessionVersion) throw new Error("session_changed");
  if (response.status === 401 && retryAfterRefresh && refreshToken.value) {
    const refreshed = token !== accessToken.value || (await refreshSession());
    if (version !== sessionVersion) throw new Error("session_changed");
    if (refreshed) return apiRequest<T>(path, false, method, body);
    clearSession();
    authError.value = "Your session ended. Please sign in again.";
    throw new Error("session_ended");
  }
  if (response.status === 401) {
    clearSession();
    authError.value = "Your session ended. Please sign in again.";
  } else if (response.status === 403) {
    // A forbidden action is not necessarily an ended admin session. Recheck actual role access.
    let stillAdmin = false;
    try {
      const check = await fetch(`${apiBaseUrl}/api/auth/me`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken.value}`,
        },
      });
      const user = check.ok ? ((await check.json()) as CurrentUser) : null;
      stillAdmin = Boolean(
        user?.active &&
        Array.isArray(user.roles) &&
        user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN"),
      );
    } catch {
      stillAdmin = false;
    }
    if (version !== sessionVersion) throw new Error("session_changed");
    if (!stillAdmin) {
      clearSession();
      authError.value = "This account is not allowed to use SEQUO Admin.";
    }
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
      reason?: string;
    } | null;
    throw new Error(error?.message || error?.reason || "request_failed");
  }
  const data =
    response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  if (version !== sessionVersion) throw new Error("session_changed");
  return data;
}

function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const version = sessionVersion;
  const token = refreshToken.value;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: token, deviceId }),
      });
      if (!response.ok) return false;
      const tokens = (await response.json()) as AuthTokens;
      if (version !== sessionVersion) return false;
      accessToken.value = tokens.accessToken;
      refreshToken.value = tokens.refreshToken;
      persistTokens();
      return true;
    } catch {
      return false;
    } finally {
      if (version === sessionVersion) refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function signOut() {
  const tokenToRevoke = refreshToken.value;
  clearSession();
  authNotice.value = "You have signed out.";
  if (tokenToRevoke) {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: tokenToRevoke }),
    }).catch(() => undefined);
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function humanize(value?: string | null): string {
  if (!value) return "Not available";
  const specialLabels: Record<string, string> = {
    ADMIN: "Admin",
    SUPER_ADMIN: "Super admin",
    SUPPORT_AGENT: "Support",
    CUSTOMER: "Customer",
    COURIER: "Courier",
    MERCHANT_OWNER: "Merchant owner",
    MERCHANT_STAFF: "Merchant staff",
    RELAY_PARTNER: "Relay partner",
    GOOGLE: "Google",
    EMAIL: "Email",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    PAUSED: "Paused",
    PENDING_REVIEW: "Pending review",
    EXPRESS: "Express",
    CLASSIC: "Classic",
    HOME_DELIVERY: "Home delivery",
    RELAY_POINT: "Relay point",
    FASTEST_AVAILABLE: "Fastest available",
    LOWEST_COST: "Lowest cost",
    STANDARD: "Standard",
    VALIDATED: "Paid",
    PENDING: "Pending",
    ACCEPTED_FOR_FULFILLMENT: "Accepted for fulfillment",
    DELIVERED: "Delivered",
    YAS_TOGO: "Yas Togo",
    MOOV_AFRICA: "Moov Africa",
  };
  return (
    specialLabels[value] ??
    value
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function humanizeRoles(roles: RoleCode[]): string {
  return roles.map(humanize).join(", ");
}

function persistTokens() {
  sessionStorage.setItem("sequo_admin_access_token", accessToken.value);
  if (refreshToken.value) {
    sessionStorage.setItem("sequo_admin_refresh_token", refreshToken.value);
  } else {
    sessionStorage.removeItem("sequo_admin_refresh_token");
  }
}

function clearSession() {
  sessionVersion++;
  localFixtureTarget.value = null;
  commandOpen.value = false;
  mobileNavOpen.value = false;
  lastUpdatedAt.value = "";
  sectionRequest++;
  refreshInFlight = null;
  dashboardOverview.value = null;
  dashboardSnapshot.value = null;
  adminUsers.value = [];
  adminMerchants.value = [];
  adminOrders.value = [];
  selectedMerchantId.value = "";
  selectedOrderId.value = "";
  sectionGroups.value = [];
  assignmentMissionId.value = "";
  for (const loading of [
    dashboardLoading,
    usersLoading,
    merchantsLoading,
    ordersLoading,
    sectionLoading,
  ]) {
    loading.value = false;
  }
  for (const error of [
    dashboardError,
    usersError,
    merchantsError,
    ordersError,
    sectionError,
  ]) {
    error.value = "";
  }
  stopLoginPolling();
  stopCountdown();
  resetEmailFallback();
  accessToken.value = "";
  refreshToken.value = "";
  currentUser.value = null;
  authError.value = "";
  authNotice.value = "";
  loginRequestId.value = "";
  loginCode.value = "";
  loginStatus.value = "";
  loginExpiresAt.value = "";
  sessionStorage.removeItem("sequo_admin_access_token");
  sessionStorage.removeItem("sequo_admin_refresh_token");
  Object.keys(sessionStorage)
    .filter(
      (key) =>
        key.startsWith("sequo_return_pending:") ||
        key.startsWith("sequo_commission_pending:") ||
        key.startsWith("sequo_admin_control_pending:") ||
        key.startsWith("sequo_catalog_options_pending:") ||
        key.startsWith("sequo_store_pending:") ||
        key.startsWith("sequo_admin_enrollment_pending:") ||
        key.startsWith("sequo_relay_admin_pending:"),
    )
    .forEach((key) => sessionStorage.removeItem(key));
}

function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return "";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem("sequo_admin_device_id");
  if (existing) return existing;
  const generated = `sequo-admin-web-${crypto.randomUUID()}`;
  localStorage.setItem("sequo_admin_device_id", generated);
  return generated;
}

function browserDeviceLabel(): string {
  const platform = navigator.platform || "computer";
  return `Admin web on ${platform}`.slice(0, 80);
}

function adminDeviceMetadata() {
  return {
    deviceLabel: browserDeviceLabel(),
    browserInfo: navigator.userAgent.slice(0, 180),
  };
}

// Workspace presentation state never grants API access.
const developmentAccess = ref(false);
const developmentLoading = ref(false);
const mobileNavOpen = ref(false);
const commandOpen = ref(false);
const commandQuery = ref("");
const commandSearchInput = ref<HTMLInputElement | null>(null);
const autoRefresh = ref(true);
const controlRefreshKey = ref(0);
const serviceControls = ref<InstanceType<typeof OperationsControlPanel> | null>(
  null,
);
const lastUpdatedAt = ref("");
let workspacePollTimer: ReturnType<typeof window.setInterval> | null = null;
const navigationGroups = computed(() =>
  [
    {
      label: "Operations",
      ids: ["dashboard", "orders", "deliveries", "relay", "returns"],
    },
    {
      label: "Network",
      ids: ["merchants", "catalog", "riders", "users", "cooperatives"],
    },
    {
      label: "Commerce",
      ids: ["payments", "commissions", "negotiations", "benefits"],
    },
    { label: "Administration", ids: ["notifications", "audit", "settings"] },
  ].map((group) => ({
    label: group.label,
    items: group.ids
      .map((id) => sections.find((section) => section.id === id)!)
      .filter(Boolean),
  })),
);
const commandResults = computed(() =>
  sections.filter((section) =>
    `${section.label} ${section.description}`
      .toLowerCase()
      .includes(commandQuery.value.trim().toLowerCase()),
  ),
);
const userInitials = computed(() =>
  (currentUser.value?.displayName || currentUser.value?.email || "SEQUO Admin")
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(""),
);
const todayLabel = computed(() =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date()),
);
const isLegacyDataSection = computed(() =>
  [
    "deliveries",
    "payments",
    "commissions",
    "returns",
    "relay",
    "settings",
  ].includes(activeSection.value),
);
const activeLoading = computed(() =>
  activeSection.value === "dashboard"
    ? dashboardLoading.value
    : activeSection.value === "orders"
      ? ordersLoading.value
      : activeSection.value === "merchants"
        ? merchantsLoading.value
        : activeSection.value === "users"
          ? usersLoading.value
          : sectionLoading.value,
);
const overviewKpis = computed(() =>
  [
    dashboardCards.value[0],
    dashboardCards.value[2],
    dashboardCards.value[1],
    dashboardCards.value[4],
  ].map(
    (card, index) =>
      card ?? {
        label: [
          "Total orders",
          "Active deliveries",
          "Merchant packages waiting",
          "Returns awaiting handoff",
        ][index]!,
        value: "—",
        detail: "Waiting for current server records",
      },
  ),
);
const recentOrders = computed(() =>
  [...adminOrders.value]
    .sort(
      (a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""),
    )
    .slice(0, 6),
);
const orderActivity = computed(() => {
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - 6 + index);
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return {
      key: day.toISOString(),
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      count: adminOrders.value.filter(
        (order) =>
          order.createdAt &&
          Date.parse(order.createdAt) >= day.getTime() &&
          Date.parse(order.createdAt) < end.getTime(),
      ).length,
      height: 0,
    };
  });
  const maximum = Math.max(1, ...days.map((day) => day.count));
  return days.map((day) => ({ ...day, height: (day.count / maximum) * 92 }));
});
const chartTotal = computed(() =>
  orderActivity.value.reduce((total, day) => total + day.count, 0),
);
const activityChartLabel = computed(() =>
  orderActivity.value
    .map((day) => `${day.label}: ${day.count} orders`)
    .join(", "),
);
const exportRows = computed<Record<string, unknown>[]>(() =>
  activeSection.value === "users"
    ? displayedUsers.value
    : activeSection.value === "merchants"
      ? displayedMerchants.value
      : ["orders", "dashboard"].includes(activeSection.value)
        ? displayedOrders.value
        : [],
);
const isLoopback = (hostname: string) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase());
const localDevelopmentPage =
  import.meta.env.DEV &&
  isLoopback(window.location.hostname) &&
  (() => {
    try {
      return isLoopback(new URL(apiBaseUrl, location.origin).hostname);
    } catch {
      return false;
    }
  })();

watch(commandOpen, async (open) => {
  if (open) {
    commandQuery.value = "";
    await nextTick();
    commandSearchInput.value?.focus();
  }
});
function formatTimestamp(value?: string): string {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Time unavailable";
}
function statusTone(value: string): string {
  const status = value.toUpperCase();
  if (
    ["DELIVERED", "VALIDATED", "CONFIRMED", "SETTLED", "COMPLETED"].some(
      (item) => status.includes(item),
    )
  )
    return "positive";
  if (["REJECTED", "CANCELLED", "FAILED"].some((item) => status.includes(item)))
    return "negative";
  if (["PENDING", "PROBLEM", "AWAITING"].some((item) => status.includes(item)))
    return "warning";
  return "neutral";
}
async function openService(
  section: SectionId,
  controlId: string,
  values: Record<string, unknown>,
) {
  selectSection(section);
  await nextTick();
  await serviceControls.value?.openControl(controlId, values);
  serviceControls.value?.$el?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
async function openLocalFixtureScenario(
  category: SectionId,
  ids: Record<string, string>,
) {
  if (
    !localDevelopmentPage ||
    !developmentAccess.value ||
    !isAuthenticated.value
  )
    return;
  const section = ids.manifestId ? "deliveries" : category;
  localFixtureTarget.value = { category: section, ids };
  selectSection(section);
  await nextTick();
  if (
    (category === "returns" && ids.returnId) ||
    (category === "payments" && ids.checkoutId) ||
    ids.manifestId
  )
    return;
  const controls: Partial<Record<SectionId, string>> = {
    users: "user-access-management",
    merchants: "merchant-store-settings",
    catalog: "catalog-customizations",
    orders: "order-detail",
    riders: "courier-detail",
    relay: ids.parcelId ? "relay-parcel-detail" : "relay-site-detail",
    deliveries: "delivery-mission-detail",
  };
  const control = controls[section];
  if (control) await serviceControls.value?.openControl(control, ids);
}
function openOrder(order: AdminOrderRow) {
  selectedOrderId.value = order.id;
  void openService("orders", "order-detail", { orderId: order.id });
}
function refreshWorkspace() {
  if (!isAuthenticated.value) return;
  controlRefreshKey.value++;
  switch (activeSection.value) {
    case "dashboard":
      void loadDashboard();
      break;
    case "orders":
      void loadOrders();
      break;
    case "merchants":
      void loadMerchants();
      break;
    case "users":
      void loadUsers();
      break;
    case "deliveries":
    case "payments":
    case "commissions":
    case "relay":
    case "settings":
      void loadSection(activeSection.value);
      break;
  }
}
function onControlChanged() {
  refreshWorkspace();
}
function exportVisibleRows() {
  if (!isAuthenticated.value || !exportRows.value.length) return;
  const columns = Object.keys(exportRows.value[0]!);
  const csvValue = (value: unknown) => {
    let text =
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (/^[\s]*[=+\-@]|^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    columns.map(csvValue).join(","),
    ...exportRows.value.map((row) =>
      columns.map((key) => csvValue(row[key])).join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `sequo-${activeSection.value}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
async function loadDevelopmentAccess() {
  if (!localDevelopmentPage) return;
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin-auth/development-access`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    const data = response.ok
      ? ((await response.json()) as { enabled?: boolean; mode?: string })
      : null;
    developmentAccess.value =
      data?.enabled === true && data.mode === "LOCAL_DEVELOPMENT";
  } catch {
    developmentAccess.value = false;
  }
}
async function enterDevelopmentWorkspace() {
  if (
    !localDevelopmentPage ||
    !developmentAccess.value ||
    developmentLoading.value
  )
    return;
  const version = sessionVersion;
  developmentLoading.value = true;
  authError.value = "";
  authNotice.value = "";
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/admin-auth/development-session`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceId, ...adminDeviceMetadata() }),
      },
    );
    if (version !== sessionVersion) return;
    if (!response.ok)
      throw new Error(
        "The local development workspace is not ready. Start the local workspace and try again.",
      );
    const tokens = (await response.json()) as AdminLoginExchangeResponse;
    if (!tokens.accessToken || !tokens.refreshToken)
      throw new Error("The server did not confirm a development session.");
    accessToken.value = tokens.accessToken;
    refreshToken.value = tokens.refreshToken;
    await verifySession();
  } catch (failure) {
    if (version === sessionVersion)
      authError.value =
        failure instanceof Error
          ? failure.message
          : "Could not open the local workspace.";
  } finally {
    developmentLoading.value = false;
  }
}
function onWorkspaceKeydown(event: KeyboardEvent) {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k" &&
    isAuthenticated.value
  ) {
    event.preventDefault();
    commandOpen.value = !commandOpen.value;
  }
  if (event.key === "Escape") {
    commandOpen.value = false;
    mobileNavOpen.value = false;
  }
}
function onWorkspacePageShow(event: PageTransitionEvent) {
  if (event.persisted) window.location.reload();
}
function onWorkspaceLocation() {
  const id = window.location.hash.slice(1).split("/")[0] as SectionId;
  if (sections.some((section) => section.id === id)) selectSection(id, false);
}
</script>

<template>
  <main v-if="!isAuthenticated" class="auth-shell" aria-label="Admin login">
    <section class="auth-story">
      <div class="auth-brand">
        <img src="/brand/sequo-icon-green.png" alt="" /><span
          >SEQUO<span class="brand-caption">OPERATIONS</span></span
        >
      </div>
      <div class="auth-story-content">
        <span class="auth-kicker"
          ><span class="status-dot" /> One connected workspace</span
        >
        <h1>
          Everything in view.<br /><span>Every handoff<br />in control.</span>
        </h1>
        <p>
          Your merchants, deliveries and everyday decisions.<br
            class="desktop-only"
          />
          Together in one clear workspace.
        </p>
        <div class="network-art" aria-hidden="true">
          <div class="network-grid" />
          <svg viewBox="0 0 520 260" fill="none">
            <path
              d="M50 145H140Q165 145 165 120V90Q165 65 190 65H310Q340 65 340 95V155Q340 185 370 185H475"
              stroke="#76b99a"
              stroke-width="2"
              stroke-dasharray="5 6"
            />
            <path
              d="M180 220V190Q180 165 205 165H245Q270 165 270 140V85"
              stroke="#478c6f"
              stroke-width="1.5"
              stroke-dasharray="4 6"
            />
            <circle cx="50" cy="145" r="5" fill="#addec4" />
            <circle cx="475" cy="185" r="5" fill="#addec4" />
          </svg>
          <div class="network-node merchant-node">
            <AdminIcon name="storefront" :size="22" /><span
              >Merchants<small>Ready for collection</small></span
            ><span class="node-check"
              ><AdminIcon name="check" :size="13"
            /></span>
          </div>
          <div class="network-node delivery-node">
            <span class="node-icon"
              ><AdminIcon name="local_shipping" :size="24" /></span
            ><span
              >Connected logistics<small>Every step, accounted for</small></span
            >
          </div>
          <div class="network-node relay-node">
            <AdminIcon name="inventory_2" :size="21" /><span>Relay points</span>
          </div>
        </div>
      </div>
      <div class="auth-story-footer">
        <span>Built for the SEQUO team.</span>
      </div>
    </section>
    <section class="auth-form-panel">
      <div class="auth-topline">
        <span>Administrator access</span
        ><span v-if="developmentAccess" class="environment-badge"
          >Local development</span
        >
      </div>
      <div class="auth-form-wrap">
        <div class="auth-heading">
          <div class="auth-symbol"><AdminIcon name="shield" :size="25" /></div>
          <h2>Welcome back</h2>
          <p>Sign in to your SEQUO workspace.</p>
        </div>
        <div
          v-if="authLoading && accessToken && !currentUser"
          class="auth-restoring"
          role="status"
        >
          <span class="loader" />Restoring your secure session…
        </div>
        <div v-if="developmentAccess" class="development-entry">
          <div>
            <span class="development-icon"
              ><AdminIcon name="activity" :size="18"
            /></span>
            <div>
              <strong>Your development workspace</strong>
              <p>Explore the controls with isolated local data.</p>
            </div>
          </div>
          <button
            type="button"
            class="development-button"
            :disabled="developmentLoading || authLoading"
            @click="enterDevelopmentWorkspace"
          >
            <span v-if="developmentLoading" class="loader small" />{{
              developmentLoading
                ? "Opening workspace…"
                : "Enter development workspace"
            }}<AdminIcon name="arrow_forward" :size="17" /></button
          ><small>No password needed. Production access stays protected.</small>
        </div>
        <div v-if="developmentAccess" class="auth-divider">
          <span>or use your staff account</span>
        </div>
        <button
          v-if="googleLoginReady"
          class="google-login secondary"
          type="button"
          :disabled="Boolean(socialLoginLoading) || authLoading"
          @click="startGoogleLogin"
        >
          <span class="google-letter" aria-hidden="true">G</span
          >{{
            socialLoginLoading === "GOOGLE"
              ? "Opening Google…"
              : "Continue with Google"
          }}
        </button>
        <div v-if="googleLoginReady" class="auth-divider">
          <span>or continue with email</span>
        </div>
        <form class="staff-login-form" @submit.prevent="requestPhoneLogin">
          <label for="work-email"
            >Work email<input
              id="work-email"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@sequo.com"
              required
              :disabled="authLoading || developmentLoading"
          /></label>
          <div v-if="loginCode" class="approval-code-card" aria-live="polite">
            <AdminIcon name="phone" :size="24" />
            <div>
              <small>Approval code</small><strong>{{ loginCode }}</strong>
              <p>Match this code in your SEQUO mobile app.</p>
            </div>
          </div>
          <div v-if="loginRequestId" class="approval-status">
            <span class="status-pill">{{ loginStatusLabel }}</span
            ><span v-if="loginCountdownLabel"
              >Expires in {{ loginCountdownLabel }}</span
            >
          </div>
          <button
            type="submit"
            class="auth-submit"
            :disabled="!canRequestPhoneLogin || developmentLoading"
          >
            <span v-if="authLoading" class="loader small" />{{
              authLoading
                ? "Requesting…"
                : hasPendingPhoneLogin
                  ? "Request new code"
                  : "Continue with email"
            }}<AdminIcon name="arrow_forward" :size="17" />
          </button>
        </form>
        <p v-if="authNotice" class="notice-text" role="status">
          {{ authNotice }}
        </p>
        <p v-if="authError" class="error-text" role="alert">{{ authError }}</p>
        <div class="auth-alternatives">
          <button
            v-if="!emailFallbackOpen"
            class="text-button"
            type="button"
            @click="openEmailFallback"
          >
            I cannot access my phone</button
          ><button
            v-if="loginRequestId"
            class="text-button"
            type="button"
            @click="resetPhoneLogin"
          >
            Use another email
          </button>
        </div>
        <div v-if="emailFallbackOpen" class="email-fallback-card">
          <h3>Email verification</h3>
          <p>Receive a one-time code at your staff email.</p>
          <button
            type="button"
            class="secondary"
            :disabled="!canRequestEmailCode"
            @click="requestEmailCode"
          >
            {{
              emailCodeLoading && !emailCodeRequested
                ? "Sending…"
                : emailCodeRequested
                  ? "Send new code"
                  : "Send email code"
            }}</button
          ><small
            v-if="
              emailCodeRequested && !canRequestEmailCode && emailCodeRetryLabel
            "
            >Resend in {{ emailCodeRetryLabel }}</small
          ><label v-if="emailCodeRequested"
            >Email code<input
              v-model="emailCode"
              autocomplete="one-time-code"
              inputmode="text"
              placeholder="ABC-DEF"
              maxlength="16"
              @input="sanitizeEmailCodeInput" /></label
          ><span
            v-if="emailCodeRequested && emailCodeCountdownLabel"
            class="subtle"
            >Expires in {{ emailCodeCountdownLabel }}</span
          ><button
            v-if="emailCodeRequested"
            type="button"
            :disabled="!canVerifyEmailCode"
            @click="verifyEmailCode"
          >
            {{
              emailCodeLoading ? "Checking…" : "Verify and open workspace"
            }}</button
          ><button
            class="text-button"
            type="button"
            @click="resetEmailFallback"
          >
            Back to phone approval
          </button>
        </div>
        <p class="auth-help">
          <AdminIcon name="lock" :size="14" />Access is restricted to authorized
          SEQUO staff.
        </p>
      </div>
      <footer class="auth-bottom">
        <span>© {{ new Date().getFullYear() }} SEQUO</span
        ><span>Commerce. Connected.</span>
      </footer>
    </section>
  </main>

  <main
    v-else
    class="admin-shell"
    :class="{ 'mobile-navigation-open': mobileNavOpen }"
  >
    <button
      v-if="mobileNavOpen"
      class="nav-scrim"
      type="button"
      aria-label="Close navigation"
      @click="mobileNavOpen = false"
    />
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-icon" src="/brand/sequo-icon-green.png" alt="" /><span
          class="brand-wordmark"
          >SEQUO<small>ADMIN WORKSPACE</small></span
        ><button
          type="button"
          class="icon-button sidebar-close"
          aria-label="Close navigation"
          @click="mobileNavOpen = false"
        >
          <AdminIcon name="close" />
        </button>
      </div>
      <div class="workspace-switch">
        <span class="workspace-mark">S</span
        ><span
          ><strong>SEQUO Operations</strong
          ><small>{{
            developmentAccess ? "Development workspace" : "Management workspace"
          }}</small></span
        >
      </div>
      <nav class="nav-list" aria-label="Admin sections">
        <div
          v-for="group in navigationGroups"
          :key="group.label"
          class="nav-group"
        >
          <p class="nav-group-label">{{ group.label }}</p>
          <button
            v-for="section in group.items"
            :key="section.id"
            class="nav-button"
            :class="{ active: activeSection === section.id }"
            :aria-current="activeSection === section.id ? 'page' : undefined"
            type="button"
            @click="selectSection(section.id)"
          >
            <AdminIcon :name="section.icon" :size="19" /><span class="nav-copy"
              ><strong>{{ section.label }}</strong></span
            ><span
              v-if="
                section.id === 'returns' &&
                priorityActions[2]?.value !== '—' &&
                priorityActions[2]?.value !== '0'
              "
              class="nav-count"
              >{{ priorityActions[2]?.value }}</span
            >
          </button>
        </div>
      </nav>
      <div class="sidebar-bottom">
        <div v-if="releaseId && releaseEnvironment" class="release-identity">
          <span class="status-dot" />{{ releaseEnvironmentLabel
          }}<span class="build-id" :title="releaseId">{{ releaseId }}</span>
        </div>
        <div class="sidebar-account">
          <span class="user-avatar">{{ userInitials }}</span
          ><span
            ><strong>{{ currentUser?.displayName || "SEQUO Admin" }}</strong
            ><small>{{
              currentUser?.roles.includes("SUPER_ADMIN")
                ? "Super administrator"
                : "Administrator"
            }}</small></span
          ><button
            class="icon-button"
            type="button"
            aria-label="Sign out"
            title="Sign out"
            @click="signOut"
          >
            <AdminIcon name="logout" :size="18" />
          </button>
        </div>
      </div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div class="topbar-breadcrumb">
          <button
            class="icon-button mobile-menu"
            type="button"
            aria-label="Open navigation"
            :aria-expanded="mobileNavOpen"
            @click="mobileNavOpen = true"
          >
            <AdminIcon name="menu" /></button
          ><span>Workspace</span
          ><AdminIcon name="chevron_right" :size="14" /><strong>{{
            active.label
          }}</strong>
        </div>
        <div class="topbar-actions">
          <button
            class="workspace-search"
            type="button"
            @click="commandOpen = true"
          >
            <AdminIcon name="search" :size="17" /><span>Search workspace</span
            ><kbd>⌘ K</kbd></button
          ><span v-if="developmentAccess" class="environment-badge"
            >Development</span
          ><button
            class="icon-button"
            type="button"
            aria-label="Open notifications"
            @click="selectSection('notifications')"
          >
            <AdminIcon name="notifications" /></button
          ><span
            class="topbar-avatar"
            :title="currentUser?.displayName || 'Administrator'"
            >{{ userInitials }}</span
          >
        </div>
      </header>
      <div class="workspace-content">
        <div class="page-heading">
          <div>
            <h1>
              {{
                active.id === "dashboard" ? "Operations overview" : active.label
              }}
            </h1>
            <p>{{ active.description }}</p>
          </div>
          <div class="page-actions">
            <button
              class="live-badge"
              :class="{ paused: !autoRefresh }"
              :aria-pressed="autoRefresh"
              type="button"
              @click="autoRefresh = !autoRefresh"
            >
              <span class="status-dot" />{{
                autoRefresh ? "Auto-refresh on" : "Refresh paused"
              }}</button
            ><button
              v-if="exportRows.length"
              class="secondary"
              type="button"
              @click="exportVisibleRows"
            >
              <AdminIcon name="download" :size="16" />Export</button
            ><button
              type="button"
              class="secondary icon-button"
              aria-label="Refresh workspace"
              :disabled="activeLoading"
              @click="refreshWorkspace"
            >
              <AdminIcon
                name="refresh"
                :class="{ spinning: activeLoading }"
                :size="17"
              />
            </button>
          </div>
        </div>

        <template v-if="active.id === 'dashboard'"
          ><div class="overview-toolbar">
            <div class="date-label">
              <AdminIcon name="calendar" :size="16" />{{ todayLabel }}
            </div>
            <span class="subtle">{{
              lastUpdatedAt
                ? `Last synced ${lastUpdatedAt}`
                : "Waiting for server records"
            }}</span>
          </div>
          <p v-if="dashboardError" class="error-text" role="alert">
            {{ dashboardError }}
          </p>
          <section class="metrics-grid" aria-label="Admin dashboard cards">
            <article
              v-for="(card, index) in overviewKpis"
              :key="card.label"
              class="metric-card"
            >
              <div class="metric-label">
                <span>{{ card.label }}</span
                ><AdminIcon
                  :name="
                    [
                      'receipt_long',
                      'local_shipping',
                      'storefront',
                      'activity',
                    ][index] || 'activity'
                  "
                  :size="18"
                />
              </div>
              <strong
                :class="{ skeleton: dashboardLoading && !dashboardOverview }"
                >{{ card.value }}</strong
              >
              <p>{{ card.detail }}</p>
            </article>
          </section>
          <section class="dashboard-columns">
            <article class="panel activity-panel">
              <div class="panel-heading">
                <div>
                  <h2>Order activity</h2>
                  <p>The last seven days · loaded server records</p>
                </div>
                <span class="period-chip">Last 7 days</span>
              </div>
              <div
                v-if="ordersLoading && !adminOrders.length"
                class="empty-state chart-empty"
                role="status"
              >
                <span class="loader" />Loading order activity…
              </div>
              <div v-else-if="ordersError" class="empty-state chart-empty">
                <AdminIcon name="warning" :size="24" />
                <p>{{ ordersError }}</p>
                <button class="text-button" type="button" @click="loadOrders">
                  Try again
                </button>
              </div>
              <template v-else
                ><div class="chart-summary">
                  <strong>{{ chartTotal.toLocaleString() }}</strong
                  ><span>orders in this period</span>
                </div>
                <div
                  class="activity-chart"
                  role="img"
                  :aria-label="activityChartLabel"
                >
                  <div class="chart-grid-lines">
                    <span /><span /><span /><span />
                  </div>
                  <div
                    v-for="day in orderActivity"
                    :key="day.key"
                    class="chart-column"
                  >
                    <div class="chart-column-space">
                      <span
                        class="chart-bar"
                        :style="{ height: `${day.height}%` }"
                        :title="`${day.label}: ${day.count} orders`"
                        ><small v-if="day.count">{{ day.count }}</small></span
                      >
                    </div>
                    <span class="chart-day">{{ day.label }}</span>
                  </div>
                  <div v-if="chartTotal === 0" class="chart-no-data">
                    No orders recorded in this period
                  </div>
                </div></template
              >
            </article>
            <article class="panel attention-panel">
              <div class="panel-heading">
                <div>
                  <h2>Needs attention</h2>
                  <p>Keep the next handoff moving.</p>
                </div>
                <span class="attention-dot" />
              </div>
              <button
                v-for="item in priorityActions.slice(1)"
                :key="item.label"
                class="attention-item"
                type="button"
                @click="selectSection(item.target)"
              >
                <span class="attention-icon"
                  ><AdminIcon :name="item.icon" :size="18" /></span
                ><span
                  ><strong>{{ item.label }}</strong
                  ><small>{{ item.detail }}</small></span
                ><b>{{ item.value }}</b
                ><AdminIcon name="chevron_right" :size="15" />
              </button>
              <div class="attention-footer">
                <AdminIcon name="shield" :size="16" /><span
                  >Actions are verified by the server.</span
                >
              </div>
            </article>
          </section>
          <section class="panel recent-orders">
            <div class="panel-heading">
              <div>
                <h2>Recent orders</h2>
                <p>A live view of your latest customer orders.</p>
              </div>
              <button
                type="button"
                class="secondary compact-button"
                @click="selectSection('orders')"
              >
                View all orders<AdminIcon name="arrow_forward" :size="15" />
              </button>
            </div>
            <div
              v-if="ordersLoading && !adminOrders.length"
              class="empty-state compact-empty"
              role="status"
            >
              <span class="loader" />Loading orders…
            </div>
            <p v-else-if="ordersError" class="error-text">{{ ordersError }}</p>
            <div v-else-if="!recentOrders.length" class="empty-state">
              <span class="empty-icon"
                ><AdminIcon name="receipt_long" :size="27"
              /></span>
              <h3>No orders yet</h3>
              <p>New orders will appear here as your operation gets moving.</p>
            </div>
            <div v-else class="resource-table-wrap">
              <table class="resource-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Delivery</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th><span class="sr-only">Open order</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="order in recentOrders" :key="order.id">
                    <td>
                      <strong class="record-id">{{ referenceText(order) }}</strong
                      ><small>{{ formatTimestamp(order.createdAt) }}</small>
                    </td>
                    <td>
                      {{ humanize(order.route)
                      }}<small>{{ humanize(order.serviceLevel) }}</small>
                    </td>
                    <td class="money-cell">
                      {{ order.totalCfa.toLocaleString() }} CFA
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        :class="statusTone(order.paymentStatus)"
                        >{{ humanize(order.paymentStatus) }}</span
                      >
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        :class="statusTone(order.orderStatus)"
                        >{{ humanize(order.orderStatus) }}</span
                      >
                    </td>
                    <td>
                      <button
                        type="button"
                        class="icon-button"
                        aria-label="Open order details"
                        @click="openOrder(order)"
                      >
                        <AdminIcon name="arrow_forward" :size="16" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <LocalFixtureGuide
            v-if="localDevelopmentPage && developmentAccess && currentUser"
            :actor-id="currentUser.id"
            :request="apiRequest"
            @navigate="openLocalFixtureScenario"
          />
          <div class="overview-footer">
            <span
              ><span class="status-dot" />{{
                autoRefresh
                  ? "Overview refreshes every 30 seconds while visible"
                  : "Automatic refresh is paused"
              }}</span
            ><span>SEQUO Operations</span>
          </div>
        </template>
        <template v-else>
          <!-- Existing guarded domain workflows and live record tables. -->
          <article v-if="active.id === 'users'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Accounts</p>
                <h2>Users and roles</h2>
              </div>
              <button
                class="secondary"
                type="button"
                :disabled="usersLoading"
                @click="loadUsers"
              >
                <AdminIcon name="refresh" :size="16" />
                {{ usersLoading ? "Refreshing..." : "Refresh" }}
              </button>
            </div>
            <p v-if="usersError" class="error-text">{{ usersError }}</p>
            <p v-else-if="usersLoading" role="status">Loading users…</p>
            <p v-else-if="!displayedUsers.length" role="status">
              No users to display.
            </p>
            <div class="filters">
              <input
                v-model="userSearch"
                type="search"
                placeholder="Search users, email, provider, role"
              />
              <select
                v-model="userRoleFilter"
                aria-label="Filter users by role"
              >
                <option v-for="role in roleOptions" :key="role" :value="role">
                  {{ role === "ALL" ? "All roles" : humanize(role) }}
                </option>
              </select>
            </div>
            <div
              v-if="!usersLoading && !usersError && displayedUsers.length"
              class="table"
              role="table"
              aria-label="Users and roles"
            >
              <div class="table-row users-row table-head" role="row">
                <span role="columnheader">User</span>
                <span role="columnheader">Provider</span>
                <span role="columnheader">Roles</span>
                <span role="columnheader">State</span>
              </div>
              <div
                v-for="user in displayedUsers"
                :key="user.id"
                class="table-row users-row"
                role="row"
              >
                <span role="cell">
                  <strong>{{
                    user.displayName ||
                    user.email ||
                    user.phoneNumber ||
                    user.id
                  }}</strong>
                  <small>{{ user.email || user.phoneNumber || referenceText(user) }}</small>
                </span>
                <span role="cell"
                  ><span class="status-pill">{{
                    humanize(user.provider)
                  }}</span></span
                >
                <span role="cell">{{ humanizeRoles(user.roles) }}</span>
                <span role="cell"
                  >{{ user.active ? humanize(user.status) : "Inactive"
                  }}<button
                    class="text-button"
                    type="button"
                    @click="
                      openService('users', 'user-access-management', {
                        userId: user.id,
                      })
                    "
                  >
                    Manage access<AdminIcon
                      name="chevron_right"
                      :size="14"
                    /></button
                ></span>
              </div>
            </div>
          </article>

          <article v-else-if="active.id === 'merchants'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Commerce operations</p>
                <h2>Merchants</h2>
              </div>
              <button
                class="secondary"
                type="button"
                :disabled="merchantsLoading"
                @click="loadMerchants"
              >
                <AdminIcon name="refresh" :size="16" />
                {{ merchantsLoading ? "Refreshing..." : "Refresh" }}
              </button>
            </div>
            <p v-if="merchantsError" class="error-text">{{ merchantsError }}</p>
            <p v-else-if="merchantsLoading" role="status">Loading merchants…</p>
            <p v-else-if="!displayedMerchants.length" role="status">
              No merchants to display.
            </p>
            <input
              v-model="merchantSearch"
              type="search"
              placeholder="Search merchant, owner, status, wallet"
            />
            <div
              v-if="
                !merchantsLoading &&
                !merchantsError &&
                displayedMerchants.length
              "
              class="split-panel"
            >
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
                    <small>{{ referenceText(merchant) }}</small>
                  </span>
                  <span
                    >{{ (merchant.commissionRateBps / 100).toFixed(2) }}%</span
                  >
                  <span>{{ humanize(merchant.status) }}</span>
                </button>
              </div>
              <aside v-if="selectedMerchant" class="detail-card">
                <p class="eyebrow">Merchant detail</p>
                <h3>{{ selectedMerchant.name }}</h3>
                <button
                  class="text-button"
                  type="button"
                  @click="
                    openService('merchants', 'merchant-store-settings', {
                      merchantId: selectedMerchant.id,
                    })
                  "
                >
                  Manage store<AdminIcon
                    name="chevron_right"
                    :size="14"
                  /></button
                ><button
                  class="text-button"
                  type="button"
                  @click="
                    openService('users', 'merchant-memberships', {
                      merchantId: selectedMerchant.id,
                    })
                  "
                >
                  Manage team<AdminIcon name="chevron_right" :size="14" />
                </button>
                <dl>
                  <div>
                    <dt>Owner</dt>
                    <dd>
                      {{ referenceText(selectedMerchant, "ownerUserId") }}
                    </dd>
                  </div>
                  <div>
                    <dt>Wallet</dt>
                    <dd>
                      {{ selectedMerchant.walletProvider || "Not configured" }}
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>
          </article>

          <article v-else-if="active.id === 'orders'" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Internal logistics</p>
                <h2>Orders and delivery tracking</h2>
              </div>
              <button
                class="secondary"
                type="button"
                :disabled="ordersLoading"
                @click="loadOrders"
              >
                <AdminIcon name="refresh" :size="16" />
                {{ ordersLoading ? "Refreshing..." : "Refresh" }}
              </button>
            </div>
            <p v-if="ordersError" class="error-text">{{ ordersError }}</p>
            <p v-else-if="ordersLoading" role="status">Loading orders…</p>
            <p v-else-if="!displayedOrders.length" role="status">
              No orders to display.
            </p>
            <input
              v-model="orderSearch"
              type="search"
              placeholder="Search order, customer, route, payment, status"
            />
            <div
              v-if="!ordersLoading && !ordersError && displayedOrders.length"
              class="split-panel"
            >
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
                    <strong>{{ referenceText(order) }}</strong>
                    <small
                      >{{ referenceText(order, "customerId") }} ·
                      {{ humanize(order.route) }}</small
                    >
                  </span>
                  <span>{{ humanize(order.paymentStatus) }}</span>
                  <span>{{ order.totalCfa.toLocaleString("en-US") }} CFA</span>
                  <span>{{ humanize(order.orderStatus) }}</span>
                </button>
              </div>
              <aside v-if="selectedOrder" class="detail-card">
                <p class="eyebrow">Order detail</p>
                <h3>{{ selectedOrder.customerFacingStatus }}</h3>
                <button
                  class="text-button"
                  type="button"
                  @click="openOrder(selectedOrder)"
                >
                  Open recorded order<AdminIcon
                    name="chevron_right"
                    :size="14"
                  />
                </button>
                <dl>
                  <div>
                    <dt>Service</dt>
                    <dd>
                      {{ humanize(selectedOrder.serviceLevel) }} ·
                      {{ humanize(selectedOrder.fulfillmentPriority) }}
                    </dd>
                  </div>
                  <div>
                    <dt>Items</dt>
                    <dd>
                      {{
                        selectedOrder.itemSubtotalCfa.toLocaleString("en-US")
                      }}
                      CFA
                    </dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>
                      {{ selectedOrder.deliveryFeeCfa.toLocaleString("en-US") }}
                      CFA
                    </dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{{ humanize(selectedOrder.paymentProvider) }}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </article>

          <article v-else-if="isLegacyDataSection" class="panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">
                  {{
                    ["deliveries", "returns", "commissions", "relay"].includes(
                      active.id,
                    )
                      ? "Operations"
                      : "Read only"
                  }}
                </p>
                <h2>{{ active.label }}</h2>
              </div>
              <button
                v-if="active.id !== 'returns'"
                class="secondary"
                type="button"
                :disabled="sectionLoading"
                @click="selectSection(active.id)"
              >
                <AdminIcon name="refresh" :size="16" />
                {{ sectionLoading ? "Refreshing..." : "Refresh" }}
              </button>
            </div>
            <form
              v-if="active.id === 'deliveries'"
              class="filter-row"
              @submit.prevent="preparePolicyAssignment"
            >
              <label
                >Mission reference<AdminReferenceInput
                  v-model="assignmentMissionId" :field="{ name: 'missionId', label: 'Mission reference', type: 'string', location: 'body', required: true }" :request="apiRequest"
                  required
                  maxlength="128"
                  autocomplete="off"
              /></label>
              <button
                type="submit"
                :disabled="sectionLoading || !assignmentMissionId.trim()"
              >
                Assign available courier
              </button>
            </form>
            <ConsolidationPanel
              :initial-manifest-id="localFixtureTarget?.ids.manifestId"
              v-if="active.id === 'deliveries'"
              :key="currentUser?.id"
              :request="apiRequest"
            />
            <ReturnOperationsPanel
              :initial-return-id="localFixtureTarget?.ids.returnId"
              v-if="active.id === 'returns' && currentUser"
              :key="currentUser.id"
              :actor-id="currentUser.id"
              :request="apiRequest"
            />
            <PaymentInvestigationPanel
              :initial-checkout-id="localFixtureTarget?.ids.checkoutId"
              v-if="active.id === 'payments'"
              :key="currentUser?.id"
              :request="apiRequest"
            />
            <CommissionOverridePanel
              v-if="active.id === 'commissions' && currentUser"
              :key="currentUser.id"
              :actor-id="currentUser.id"
              :request="apiRequest"
              @changed="loadSection('commissions')"
            />
            <section v-if="active.id === 'relay'" class="detail-card">
              <h3>Relay operations</h3>
              <p v-if="localDevelopmentPage && developmentAccess">
                The local relay tool uses your verified development session.
                Pickup and return test values are in the practice guide.
              </p>
              <p v-else>
                Use the relay web module for pickup, overdue decisions and
                physical seller returns. Sign in there with an authorized relay
                or SEQUO account; the server checks access for each action.
              </p>
              <a
                :href="relayOperationsUrl"
                :target="
                  localDevelopmentPage && developmentAccess
                    ? undefined
                    : '_blank'
                "
                rel="noopener noreferrer"
                >Open relay operations</a
              >
            </section>
            <FinanceLedgerPanel
              v-if="['payments', 'commissions'].includes(active.id)"
              :key="currentUser?.id"
              :request="apiRequest"
            />
            <p v-if="sectionLoading" role="status">
              Loading {{ active.label.toLowerCase() }}…
            </p>
            <p v-else-if="sectionError" class="error-text" role="alert">
              {{ sectionError }}
            </p>
            <template v-else>
              <section
                v-for="group in sectionGroups"
                :key="group.title"
                class="settings-grid"
                :class="{ 'parameter-inventory': active.id === 'settings' }"
              >
                <h3>{{ group.title }}</h3>
                <p v-if="group.summary">{{ group.summary }}</p>
                <p v-if="!group.rows.length" role="status">
                  No records to display.
                </p>
                <div
                  v-else
                  class="table"
                  role="table"
                  :aria-label="group.title"
                >
                  <div class="table-row table-head" role="row">
                    <span
                      v-for="column in group.columns"
                      :key="column"
                      role="columnheader"
                      >{{ column }}</span
                    >
                  </div>
                  <div
                    v-for="row in group.rows"
                    :key="row.id"
                    class="table-row"
                    role="row"
                  >
                    <span role="cell">{{ row.cells[0] }}</span>
                    <span role="cell">{{ row.cells[1] }}</span>
                    <span role="cell">{{ row.cells[2] }}</span>
                  </div>
                </div>
              </section>
            </template>
          </article>

          <AdminEnrollmentPanel
            v-if="currentUser && (active.id === 'merchants' || active.id === 'riders')"
            :key="`${currentUser.id}:${active.id}`"
            :kind="active.id === 'merchants' ? 'merchant' : 'courier'"
            :request="apiRequest"
            :actor-id="currentUser.id"
            @changed="onControlChanged"
          />
          <AdminProductMediaPanel
            v-if="currentUser && active.id === 'catalog'"
            :key="currentUser.id"
            :request="apiRequest"
            :actor-id="currentUser.id"
            :initial-product-id="localFixtureTarget?.ids.productId"
            @changed="onControlChanged"
          />
          <RelayAdministrationPanel
            v-if="currentUser && active.id === 'relay'"
            :key="currentUser.id"
            :request="apiRequest"
            :actor-id="currentUser.id"
            @changed="onControlChanged"
          />
          <OperationsControlPanel
            ref="serviceControls"
            :key="`${currentUser?.id}:${activeSection}`"
            :category="activeSection"
            :request="apiRequest"
            :actor-id="currentUser?.id || ''"
            :roles="currentUser?.roles || []"
            :refresh-key="controlRefreshKey"
            @changed="onControlChanged"
          />
        </template>
      </div>
    </section>
    <div
      v-if="commandOpen"
      class="modal-backdrop command-backdrop"
      @click.self="commandOpen = false"
    >
      <section
        class="command-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-title"
      >
        <div class="command-search">
          <AdminIcon name="search" /><input
            ref="commandSearchInput"
            v-model="commandQuery"
            placeholder="Find a workspace…"
            aria-label="Find a workspace"
          /><button
            type="button"
            class="key-button"
            @click="commandOpen = false"
          >
            Esc
          </button>
        </div>
        <p id="command-title" class="nav-group-label">Navigate to</p>
        <div class="command-results">
          <button
            v-for="section in commandResults"
            :key="section.id"
            type="button"
            @click="
              selectSection(section.id);
              commandOpen = false;
            "
          >
            <AdminIcon :name="section.icon" :size="18" /><span
              ><strong>{{ section.label }}</strong
              ><small>{{ section.description }}</small></span
            ><AdminIcon name="arrow_forward" :size="15" />
          </button>
          <p v-if="!commandResults.length" class="empty-state compact-empty">
            No matching workspace.
          </p>
        </div>
        <footer>
          Search pages here. Use each workspace's filters to find records.
        </footer>
      </section>
    </div>
  </main>
</template>
