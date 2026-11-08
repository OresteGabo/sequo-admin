# Admin service inventory

Reviewed 8 November 2026. This inventory is generated from the controls shipped in the admin client. It distinguishes supported actions from capabilities still waiting on a real service or an approved policy.

The client contains **55 workspaces**, grouped into **16 areas**, and **37 generic actions**. Structured store/menu editors and the existing return, commission, consolidation, payment-investigation and ledger panels add their own guarded workflows. Counts describe available controls, not completed real-world journeys.

| Area | Workspace | Read | Action / remaining dependency |
| --- | --- | --- | --- |
| catalog | Products | `/api/catalog/products` | Create product (POST); Save product changes (PATCH); Archive product (POST) |
| orders | Order lines, destination and history | `/api/admin/web/orders/{orderId}` | Read only; dedicated workflow where described in the app. |
| riders | Riders and workforce | `/api/admin/web/couriers` | Change recorded workforce (PUT) |
| riders | Rider detail and workforce history | `/api/admin/web/couriers/{courierId}` | Read only; dedicated workflow where described in the app. |
| relay | Relay sites and assigned operators | `/api/admin/web/relay-sites` | Assign relay operator (PUT); Remove relay operator assignment (DELETE) |
| relay | Logical storage slots | `/api/admin/web/relay-sites/{relayPointId}/slots` | Read only; dedicated workflow where described in the app. |
| relay | Relay assignment history | `/api/admin/web/relay-sites/{relayPointId}` | Read only; dedicated workflow where described in the app. |
| users | Accounts | `/api/admin/web/users` | Read only; dedicated workflow where described in the app. |
| users | Account access and roles | `/api/admin/web/users/{userId}/access` | Change account access (PUT); Grant account role (PUT); Revoke account role (DELETE) |
| users | Merchant membership and scope | `/api/admin/web/merchant-memberships` | Set merchant membership (PUT) |
| merchants | Merchants | `/api/admin/web/merchants` | Read only; dedicated workflow where described in the app. |
| merchants | Store availability and hours | `/api/admin/web/merchants/{merchantId}/store` | Structured store editor: reviewed save, exact revision, history and stable retry. |
| catalog | Food options and supplements | `/api/catalog/products/{productId}/customizations` | Structured food menu editor: preserve identities and review replacements. |
| catalog | Camera photos and approved images | Unavailable | Camera upload and generic-image selection currently require an authorized merchant membership on merchant-scoped endpoints. Administrators cannot fabricate camera verification or upload on behalf of a merchant through the current API. |
| orders | Customer orders | `/api/admin/web/orders` | Read only; dedicated workflow where described in the app. |
| orders | Merchant preparation | `/api/merchant/sub-orders` | Accept order (POST); Start preparation (POST); Hand over to courier (POST); Mark ready for pickup (POST); Reject merchant order (POST) |
| orders | Merchant order detail | `/api/merchant/sub-orders/{subOrderId}` | Read only; dedicated workflow where described in the app. |
| orders | Preparation escalations | `/api/merchant/sub-orders/{subOrderId}/escalations` | Record escalation (POST) |
| deliveries | Delivery overview | `/api/admin/web/deliveries` | Read only; dedicated workflow where described in the app. |
| deliveries | Dispatch missions | `/api/delivery/missions` | Dispatch ready merchant orders (POST); Assign courier (POST); Reassign courier (POST); Assign using dispatch policy (POST); Offer assigned mission (POST); Cancel mission (POST); Report operational problem (POST); Resolve reported problem (POST) |
| deliveries | Mission detail | `/api/delivery/missions/{missionId}` | Read only; dedicated workflow where described in the app. |
| audit | Dispatch decision history | `/api/delivery/missions/{missionId}/admin-actions` | Read only; dedicated workflow where described in the app. |
| audit | Courier dispatch decision history | `/api/delivery/missions/couriers/{courierId}/admin-actions` | Read only; dedicated workflow where described in the app. |
| audit | Delivery resolution history | `/api/delivery/missions/{missionId}/problem-resolutions` | Read only; dedicated workflow where described in the app. |
| riders | Courier availability | `/api/delivery/missions/couriers/{courierId}/availability` | Pause courier dispatch (POST); Resume courier dispatch (POST) |
| riders | Rider enrollment | Unavailable | There is no admin rider-account creation endpoint. Workforce edits apply only to existing rider records and must not rewrite historical mission or earnings snapshots. |
| relay | Relay sites | `/api/relay/parcels/sites` | Read only; dedicated workflow where described in the app. |
| relay | Relay parcel custody | `/api/relay/parcels` | Record overdue review (POST); Report parcel problem (POST); Record return to seller (POST) |
| relay | Parcel history and deadlines | `/api/relay/parcels/{parcelId}` | Read only; dedicated workflow where described in the app. |
| relay | Overdue queue | `/api/relay/parcels/overdue` | Evaluate site deadlines (POST) |
| relay | Recorded storage fee history | `/api/relay/parcels/storage-fees` | Read only; dedicated workflow where described in the app. |
| relay | Pickup code / QR validation | Unavailable | The scoped operator pickup flow requires the actual one-time code or QR and identity-match confirmation. Use the existing dedicated relay pickup surface; code issuance or release is not replaced with an unchecked admin toggle. |
| returns | Return requests | `/api/returns` | Read only; dedicated workflow where described in the app. |
| returns | Return custody detail | `/api/returns/{returnId}` | Read only; dedicated workflow where described in the app. |
| payments | Pending and completed checkouts | `/api/admin/web/payments` | Read only; dedicated workflow where described in the app. |
| payments | Verified callback investigation | `/api/admin/web/payments` | Read only; dedicated workflow where described in the app. |
| payments | Merchant payout queue | `/api/admin/web/payments` | Read only; dedicated workflow where described in the app. |
| payments | Merchant settlement history | `/api/settlements/merchant-payouts` | Read only; dedicated workflow where described in the app. |
| payments | Payout eligibility evaluation | `/api/admin/web/payments` | Evaluate payout eligibility (POST) |
| payments | Provider connection readiness | `/api/payments/providers` | Read only; dedicated workflow where described in the app. |
| payments | Refund execution and money transfers | Unavailable | Provider refund and payout adapters are not integrated. A persisted refund instruction or payable is not proof of funds sent. Approved provider specifications, account binding, credentials and sandbox verification are required. |
| commissions | Commission policy and overrides | `/api/admin/web/commissions` | Read only; dedicated workflow where described in the app. |
| negotiations | Customer and seller negotiations | `/api/admin/web/bargaining-threads` | Read only; dedicated workflow where described in the app. |
| negotiations | Negotiation status and actor history | `/api/admin/web/bargaining-threads/{threadId}` | Read only; dedicated workflow where described in the app. |
| cooperatives | Cooperatives and approval | `/api/admin/cooperatives` | Create cooperative (POST); Add merchant member (POST); Record cooperative decision (POST) |
| cooperatives | Grouped order manifests | `/api/consolidations` | Read only; dedicated workflow where described in the app. |
| benefits | Approved subscription plans | `/api/subscriptions/plans` | Read only; dedicated workflow where described in the app. |
| benefits | Subscription, loyalty and referral activation | Unavailable | There is no admin activation or benefit-award API. SEQUO must approve the policy and payment/tenure evidence; authorized operations applies the documented server process. A customer cannot grant benefits or cash out referral credit. |
| notifications | Your operator inbox | `/api/notifications/inbox` | Mark message read (PATCH); Archive message (POST); Restore archived message (DELETE) |
| notifications | Broadcast and delivery-provider management | Unavailable | There is no arbitrary admin broadcast or SMS/push-provider configuration endpoint. Device registration and notification preferences remain account-owned; provider credentials belong in approved deployment configuration. |
| notifications | Notification processing queue | `/api/admin/web/notification-outbox` | Read only; dedicated workflow where described in the app. |
| users | Account deletion requests | `/api/admin/web/account-deletion-requests` | Read only; dedicated workflow where described in the app. |
| audit | Operational monitoring | `/api/admin/monitoring/operations` | Read only; dedicated workflow where described in the app. |
| settings | Effective delivery prices | `/api/admin/web/delivery-pricing` | Read only; dedicated workflow where described in the app. |
| settings | Business policy and pending decisions | `/api/admin/web/business-parameters` | Read only; dedicated workflow where described in the app. |

## Verification boundary

Every request still passes through the authenticated session. UI role labels do not grant server permissions. Missing, expired and non-admin sessions cannot mount the workspace. Confirmations preserve the reviewed body; idempotent retries retain the original key. Older endpoints without a durable retry contract require server investigation after uncertainty.

No provider transfers, new tariffs, subscription/referral approvals, customer proof impersonation, physical locker control, live GPS service, support ticket service or legal approval are implied by this inventory. See [the application review](APP_OPERATIONS_REVIEW.md) for source findings and remaining work, [the redesign verification](ADMIN_REDESIGN_VERIFICATION.md) for executed checks and [local workspace](LOCAL_WORKSPACE.md) to try it.
