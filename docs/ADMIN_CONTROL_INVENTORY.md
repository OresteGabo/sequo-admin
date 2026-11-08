# Admin service inventory

Reviewed 8 November 2026 against the complete signed PDF and the implemented controls. See the [153-point review](ADMIN_SIGNED_PDF_REVIEW.md) for source coverage, checks and decisions.

The client contains **55 workspaces**, **53 supported reads/workflows**, **38 generic actions**, plus the structured registration, media and relay workflows. Two capability entries remain conditional: provider fund execution (excluded by request) and unapproved benefit activation. Counts describe shipped controls, not a remote/device acceptance claim.

## Structured workflows

| Area | Working panel | Server contract |
| --- | --- | --- |
| Merchants / Riders | Register an existing authorized account as a merchant or rider; review/cancel, exact revision, actor history and safe retry | `GET /api/admin/web/enrollment/users/{userId}`; `POST /api/admin/web/enrollment/merchants` or `/couriers` |
| Catalog | Actual camera capture, explicitly approved standard JPEG, preview, publication/deactivation, frozen retry and canonical readback | `GET /api/admin/web/catalog/products/{productId}/media`; `/photos`, `/photos/camera`, `/photos/generic`, `/publication` |
| Relay | Site location/setup, logical slots/availability, verified mission physical deposit and history | `GET/POST /api/admin/web/relay-sites`; `GET /{id}/setup`; reviewed detail/slot/deposit mutations |
| Settings | Approved delivery tariff editor using the existing generic review/retry shell | `GET/PUT /api/admin/web/delivery-pricing/manage` |

Existing structured food options, store hours, commission overrides, return collection/receipt/inspection/instruction, consolidation/final dispatch, checkout investigation and source-ledger panels remain available. Pickup uses the scoped code/QR/identity relay web module; it is a supported workflow rather than an unchecked release toggle.

## Workspace routes and actions

| Area | Workspace | Read | Actions or dependency |
| --- | --- | --- | --- |
| catalog | Products | `/api/catalog/products` | Create product (POST); Save product changes (PATCH); Archive product (POST) |
| orders | Order lines, destination and history | `/api/admin/web/orders/{orderId}` | Structured workflow or read only; see description in the app. |
| riders | Riders and workforce | `/api/admin/web/couriers` | Change recorded workforce (PUT) |
| riders | Rider detail and workforce history | `/api/admin/web/couriers/{courierId}` | Structured workflow or read only; see description in the app. |
| relay | Relay sites and assigned operators | `/api/admin/web/relay-sites` | Assign relay operator (PUT); Remove relay operator assignment (DELETE) |
| relay | Logical storage slots | `/api/admin/web/relay-sites/{relayPointId}/slots` | Structured workflow or read only; see description in the app. |
| relay | Relay assignment history | `/api/admin/web/relay-sites/{relayPointId}` | Structured workflow or read only; see description in the app. |
| users | Accounts | `/api/admin/web/users` | Structured workflow or read only; see description in the app. |
| users | Account access and roles | `/api/admin/web/users/{userId}/access` | Change account access (PUT); Grant account role (PUT); Revoke account role (DELETE) |
| users | Merchant membership and scope | `/api/admin/web/merchant-memberships` | Set merchant membership (PUT) |
| merchants | Merchants | `/api/admin/web/merchants` | Structured workflow or read only; see description in the app. |
| merchants | Store availability and hours | `/api/admin/web/merchants/{merchantId}/store` | Structured workflow or read only; see description in the app. |
| catalog | Food options and supplements | `/api/catalog/products/{productId}/customizations` | Structured workflow or read only; see description in the app. |
| catalog | Camera photos and approved images | `/api/admin/web/catalog/products/{productId}/media` | Structured workflow or read only; see description in the app. |
| orders | Customer orders | `/api/admin/web/orders` | Structured workflow or read only; see description in the app. |
| orders | Merchant preparation | `/api/merchant/sub-orders` | Accept order (POST); Start preparation (POST); Hand over to courier (POST); Mark ready for pickup (POST); Reject merchant order (POST) |
| orders | Merchant order detail | `/api/merchant/sub-orders/{subOrderId}` | Structured workflow or read only; see description in the app. |
| orders | Preparation escalations | `/api/merchant/sub-orders/{subOrderId}/escalations` | Record escalation (POST) |
| deliveries | Delivery overview | `/api/admin/web/deliveries` | Structured workflow or read only; see description in the app. |
| deliveries | Dispatch missions | `/api/delivery/missions` | Dispatch ready merchant orders (POST); Assign courier (POST); Reassign courier (POST); Assign using dispatch policy (POST); Offer assigned mission (POST); Cancel mission (POST); Report operational problem (POST); Resolve reported problem (POST) |
| deliveries | Mission detail | `/api/delivery/missions/{missionId}` | Structured workflow or read only; see description in the app. |
| audit | Dispatch decision history | `/api/delivery/missions/{missionId}/admin-actions` | Structured workflow or read only; see description in the app. |
| audit | Courier dispatch decision history | `/api/delivery/missions/couriers/{courierId}/admin-actions` | Structured workflow or read only; see description in the app. |
| audit | Delivery resolution history | `/api/delivery/missions/{missionId}/problem-resolutions` | Structured workflow or read only; see description in the app. |
| riders | Courier availability | `/api/delivery/missions/couriers/{courierId}/availability` | Pause courier dispatch (POST); Resume courier dispatch (POST) |
| riders | Rider registration | `/api/admin/web/enrollment/users/{userId}` | Structured workflow or read only; see description in the app. |
| relay | Relay sites | `/api/relay/parcels/sites` | Structured workflow or read only; see description in the app. |
| relay | Relay parcel custody | `/api/relay/parcels` | Record overdue review (POST); Report parcel problem (POST); Record return to seller (POST) |
| relay | Parcel history and deadlines | `/api/relay/parcels/{parcelId}` | Structured workflow or read only; see description in the app. |
| relay | Overdue queue | `/api/relay/parcels/overdue` | Evaluate site deadlines (POST) |
| relay | Recorded storage fee history | `/api/relay/parcels/storage-fees` | Structured workflow or read only; see description in the app. |
| relay | Pickup code / QR validation | `/api/relay/parcels/sites` | Structured workflow or read only; see description in the app. |
| returns | Return requests | `/api/returns` | Structured workflow or read only; see description in the app. |
| returns | Return custody detail | `/api/returns/{returnId}` | Structured workflow or read only; see description in the app. |
| payments | Pending and completed checkouts | `/api/admin/web/payments` | Structured workflow or read only; see description in the app. |
| payments | Verified callback investigation | `/api/admin/web/payments` | Structured workflow or read only; see description in the app. |
| payments | Merchant payout queue | `/api/admin/web/payments` | Structured workflow or read only; see description in the app. |
| payments | Merchant settlement history | `/api/settlements/merchant-payouts` | Structured workflow or read only; see description in the app. |
| payments | Payout eligibility evaluation | `/api/admin/web/payments` | Evaluate payout eligibility (POST) |
| payments | Provider connection readiness | `/api/payments/providers` | Structured workflow or read only; see description in the app. |
| payments | Refund execution and money transfers | Conditional | Provider refund and payout adapters are not integrated. A persisted refund instruction or payable is not proof of funds sent. Approved provider specifications, account binding, credentials and sandbox verification are required. |
| commissions | Commission policy and overrides | `/api/admin/web/commissions` | Structured workflow or read only; see description in the app. |
| negotiations | Customer and seller negotiations | `/api/admin/web/bargaining-threads` | Structured workflow or read only; see description in the app. |
| negotiations | Negotiation status and actor history | `/api/admin/web/bargaining-threads/{threadId}` | Structured workflow or read only; see description in the app. |
| cooperatives | Cooperatives and approval | `/api/admin/cooperatives` | Create cooperative (POST); Add merchant member (POST); Record cooperative decision (POST) |
| cooperatives | Grouped order manifests | `/api/consolidations` | Structured workflow or read only; see description in the app. |
| benefits | Approved subscription plans | `/api/subscriptions/plans` | Structured workflow or read only; see description in the app. |
| benefits | Subscription, loyalty and referral activation | Conditional | There is no admin activation or benefit-award API. SEQUO must approve the policy and payment/tenure evidence; authorized operations applies the documented server process. A customer cannot grant benefits or cash out referral credit. |
| notifications | Your operator inbox | `/api/notifications/inbox` | Mark message read (PATCH); Archive message (POST); Restore archived message (DELETE) |
| notifications | Notification processing queue | `/api/admin/web/notification-outbox` | Structured workflow or read only; see description in the app. |
| users | Account deletion requests | `/api/admin/web/account-deletion-requests` | Structured workflow or read only; see description in the app. |
| audit | Operational monitoring | `/api/admin/monitoring/operations` | Structured workflow or read only; see description in the app. |
| settings | Delivery price management | `/api/admin/web/delivery-pricing/manage` | Set approved delivery prices (PUT) |
| settings | Effective delivery prices | `/api/admin/web/delivery-pricing` | Structured workflow or read only; see description in the app. |
| settings | Business policy and pending decisions | `/api/admin/web/business-parameters` | Structured workflow or read only; see description in the app. |

## Operating boundaries

Every request uses the authenticated server session. Missing, expired and non-admin sessions fail closed. New enrollment, media, relay and pricing mutations check current database authority and preserve actor/reason/retry history. Review/cancel, stale records, duplicate keys, concurrent changes and unknown outcomes are tested. A successful write followed by failed readback remains unconfirmed.

Rider/customer proof stays actor-owned. Relay release requires an actual one-time code or QR and identity-match confirmation. The deprecated raw parcel-create route rejects client-supplied custody claims, and HTTP storage availability cannot clear an occupied/active-custody slot. Logical storage controls do not operate hardware.

No provider transfers, unapproved subscription/referral benefits, invented storage fees, automatic overdue disposition, KYC approval, GPS service, generic broadcast/CMS or commercial/legal confirmation is implied. Annex A.6 explicitly permits prepared controlled-deployment changes for the remaining business settings. See [the review](ADMIN_SIGNED_PDF_REVIEW.md), [local practice guide](LOCAL_PRACTICE_DATA.md), and [local startup](LOCAL_WORKSPACE.md).
