# Application operations review

Reviewed 8 November 2026 against the normal runtime paths in Sequo, SequoVendor, SequoRider, the selected relay web module, optional SequoHub and sequo-api. This is a source/contract review followed by local tests. It is not production or device acceptance. The existing frozen release candidate was not regenerated.

## What is now controlled from admin

The [shipped inventory](ADMIN_CONTROL_INVENTORY.md) gives every workspace, route and supported action. The redesigned site combines these with the existing guarded return, commission, consolidation, finance and payment panels. Records are re-read from the authenticated API; errors do not become sample data.

| Application capability | Admin treatment and source evidence |
| --- | --- |
| Accounts, role access and sessions | User list plus existing-account access/roles and merchant membership controls. SUPER_ADMIN alone changes access/roles; self edits and removing the last active super administrator are refused. A managed access/scope change invalidates existing sessions. API: `domain/admin/AdminUserAccess.kt`; normal auth/session routes remain the identity authority. |
| Customer contacts and destination | Order detail reads the recorded lines and destination for operational support. No arbitrary customer cart editing, token display or bulk address export. API: `domain/admin/AdminOrderDetail.kt`; customer: `SequoShell.kt`, order/history repositories. |
| Merchant catalog, prices and bargaining eligibility | Admin product create/edit/archive uses the existing catalog model and publication rules. Food groups have a structured editor preserving IDs, inactive options and price supplements. Merchant camera proof is not fabricated. Vendor: `VendorCatalogRepository.kt`, `CatalogApiClient.kt`; API: `CommerceApi.kt`, `FoodCustomization.kt`, `ProductMediaPolicy.kt`. |
| Merchant opening hours and ordering pause | Persisted store availability, weekly hours, dated exceptions and explicit temporary closure; shared by Vendor and admin, enforced on new server quotes and checkout. Unconfigured older stores keep legacy behavior; no opening hours are invented. API: `MerchantStore.kt`; Vendor: `VendorStoreRepository.kt`. |
| Merchant order preparation | Queue/detail, accept, preparation, ready/package count, handoff, reject and escalation use existing paid-order transitions. Each merchant remains scoped to its part. API: `MerchantFulfillmentController.kt`; Vendor fulfillment repository. |
| Customer orders and payment follow-up | Recorded status, product quantities/options/destination/history and pending checkout investigation. A normalized callback receipt is distinct from reconciled payment and fulfillment. API: `AdminWebSurface.kt`, `PendingPaymentCheckout.kt`. |
| Delivery modes, price, subscription priority | Effective policy/ETA/quote and persisted mission choices remain visible. Unapproved modes and commercial benefits are not activated by web controls. API: delivery pricing, dispatch and business-parameter services. |
| Dispatch and delivery problems | Ready-order dispatch, assignment/reassignment, offer, cancel, problem/resolution and courier pause/resume reuse server workflows. Pickup/customer handoff remains the assigned rider's physical proof, not an admin status shortcut. API: `DeliveryMissionController.kt`, persisted assignment and fulfillment services; Rider: mission/detail/action/history clients. |
| Rider workforce and earnings | Existing rider directory/detail, availability, workforce classification and recorded pay summary/history. Workforce changes affect future assignments; historical financial snapshots remain intact. API: `AdminPartyControls.kt`, settlement services. |
| Relay site, operator and storage | Real site/operator directory, audited binding/unbinding of existing authorized operators, logical storage reads, parcel/history/overdue review and explicit seller return. Pickup uses the existing scoped `/relay-operator.html` code/QR/identity workflow. API: `RelayParcelController.kt`, `HubMobileController.kt`, `AdminPartyControls.kt`. |
| Returns, custody and refund instruction | Existing collection, physical receipt, accepted/rejected inspection and canonical refund instruction with actor history and readback. Instructions and actual funds transferred remain distinct. API: `ReturnController.kt`; customer return status client. |
| Cooperative grouping and final dispatch | Cooperative create/membership/approval and existing manifest/package/receipt/seal/final-dispatch controls. Both merchant packages and prerequisites remain server-owned. API: `ConsolidationController.kt`, `CooperativeMarket.kt`. |
| Merchant commissions and settlements | Existing exact-revision commission editor, merchant payout states, source ledger and SEQUO shortfall. Rates come from server policy; no transfer is inferred from a raw legacy Paid status. API: commission and settlement controllers. |
| Negotiations | Party offers/counters remain customer/merchant-only. Any staff oversight is read only; it does not accept a price on a customer's or merchant's behalf. API: persisted bargaining service; customer/Vendor network negotiation repositories. |
| Subscription/referral configuration | Approved public plans and authenticated effective-parameter inventory are visible. Production benefits remain inactive because no values were approved. Activation requires the actual paid/approved evidence, not an arbitrary ACTIVE switch. |
| Notifications and operational alerts | Operator inbox plus redacted outbox diagnostic queue and operations snapshot. No arbitrary message broadcast, raw device token or pretend provider delivery. API: `AdminDiagnosticReads.kt`, notification controllers and `AdminMonitoring.kt`. |
| Account deletion requests | Redacted request queue for investigation; no automatic deletion or guessed retention policy. API: `AdminDiagnosticReads.kt`. |

Paths above are filenames within the relevant repository. The baseline repositories were API `90997ce`, admin `cfc65e7`, customer `f3ae00c`, Rider `2006e42`, optional Hub `9b144c1`. Vendor's existing Xcode project edit and optional Hub's existing six edits were preserved.

## Remaining services and decisions

These are recorded gaps, rather than working buttons. They need separate service implementation, external access or a business decision. A mobile placeholder is not evidence of an operating service.

| Gap | Dependency / next action |
| --- | --- |
| Yas/Flooz collection, refund and rider/merchant transfers | Neither official specifications nor authorized sandbox access is available. Keep provider execution and paid production off; complete onboarding, official adapter and sandbox reconciliation separately. |
| Subscription/referral/loyalty activation and editable commercial parameters | SEQUO has not approved prices, discounts or award rules. Leave production benefits inactive; approve values and paid-evidence/credit audit workflows before new mutations. Effective values and preparation guidance are visible. |
| Storage fee charges on active/legacy parcels | Approved tariff and applicability decision are still required. Keep history and 8/30-day deadlines; do not create retroactive charges or automated disposition. |
| Return refund deadline unit and Click-and-collect-specific rules | Written clarification is still required. Do not turn the PDF's incomplete “3” into an invented duration. Existing custody/instruction flow remains usable. |
| Rider onboarding/KYC, new relay-site creation and arbitrary identity creation | There are no complete existing administrative contracts. Existing-account roles, membership, workforce and site assignment are supported; a role grant does not fabricate an identity, a courier profile or a verified KYC decision. |
| Physical lockers, GPS and relay collection batches | No complete hardware/location/collection-batch service exists. Logical storage and individual return collection must not be labelled as connected locks, live GPS or a batch handoff. Optional Hub still contains demo/local repository paths. |
| Support tickets, legal content management and device-local settings | No persisted support-ticket or legal CMS service exists; native biometric/export/camera permissions remain device-local. Add each as a separately defined service when needed. |
| Order cancellation/refund overrides and customer carts | Mission cancellation does not cancel/refund the entire order. Existing customer-owned cart, quote and handoff proof cannot be impersonated through an admin userId field. Define a guarded support workflow before exposing such overrides. |
| Customer notification UI and external notification sending | The customer inbox still has an empty local placeholder; backend senders may report not configured. Existing Rider inbox and redacted monitoring do not prove customer push/SMS delivery. |
| Arbitrary relay hardware/service shutdown | Existing service controls affect their documented intake/availability paths, not every custody action. Pickup may intentionally remain possible while intake is paused. A universal shutdown needs an explicit operational policy. |
| Universal atomic stale-edit and retry support | New access/workforce/site/store and existing commission/refund workflows have durable guards. Some older catalog/cooperative endpoints do not. Food menu preflight detects observed conflicts, but the existing replacement endpoint has no atomic revision token. Investigate an uncertain create; do not blindly repeat it. |
| Remote/device acceptance and testable delivery | No testable delivery receipt is recorded. Local/browser fixtures do not start the 50-calendar-day acceptance window or prove iOS/Android/provider journeys. Use the existing release runbook and separate paid-launch gate. |

## Development access

`npm run dev:local` starts a private loopback workspace with a generated synthetic administrator and retained local database. Click **Enter development workspace**. This is a normal server-verified session; it does not disable production authentication. The development login cannot be enabled in production/staging profiles or against a remote database. See [local workspace](LOCAL_WORKSPACE.md).
