# Sequo Admin Website AI Context

This file is for AI assistants and developers building `admin.sequoservices.com`, the internal operations website for Sequo employees.

## Project Purpose

`admin.sequoservices.com` is a private employee-only dashboard. It is not a marketing site.

Its job is to let authorized Sequo staff monitor and manage operations: users, merchants, riders, relay hubs, orders, delivery missions, returns, settlements, commissions, notifications, support issues, and operational risk.

The design should be dense, calm, fast, and work-focused. Prioritize scanning, filtering, clear statuses, safe actions, and auditability.

## Product And Domain Context

Sequo is a local commerce, logistics, wallet, commission, and settlement platform. The backend owns trusted state for:

- Authentication and role authorization.
- Customer orders.
- Merchant sub-orders and fulfillment.
- Delivery missions.
- Relay parcels and hubs.
- Consolidated cooperative-market packages.
- Returns and refunds.
- Wallet payment webhooks.
- Merchant commissions.
- Settlement ledgers and payouts.
- Notifications, device tokens, and realtime events.
- Admin monitoring and operational alerts.

## Internal User Types

The admin site should support role-aware experiences. Do not assume every employee can do every action.

Relevant backend roles and access ideas:

- Admin: broad operational management.
- Super admin: highest-risk configuration and role control.
- Support: customer, order, delivery, relay, and return investigation.
- Finance admin: refunds, payouts, settlements, reconciliation.
- Operations staff: delivery missions, hubs, courier availability, escalations.
- Merchant operations: merchant approval, commission setup, product or fulfillment review.

Always design destructive or financial actions with confirmation, reason fields, and audit context.

## Core Dashboard Areas

Recommended top-level navigation:

- Overview
- Orders
- Deliveries
- Riders
- Merchants
- Hubs and Relay
- Returns
- Settlements
- Commissions
- Payments
- Notifications
- Support
- Users and Roles
- Audit Logs
- Settings

## Overview Dashboard

The overview should highlight current operational health:

- Orders by state.
- Paid orders waiting for merchant action.
- Merchant sub-orders near or past SLA.
- Ready packages waiting for dispatch.
- Active delivery missions.
- Stale delivery missions.
- Paused riders.
- Relay parcels delayed or close to storage-fee assessment.
- Returns waiting for relay drop-off, physical receipt, or refund.
- Payout queue status.
- Notification outbox failures.
- Payment webhook anomalies.
- Delivery shortfalls above threshold.

Backend implemented monitoring route:

- `GET /api/admin/monitoring/operations`

This returns operational snapshots for delivery capacity, merchant fulfillment, relay operations, notification outbox, payout queue, and returns bottlenecks.

## Implemented Backend Routes Useful For Admin

The backend currently uses `/api`, not `/api/v1`.

Authentication:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/me`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/{sessionId}`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Admin monitoring:

- `GET /api/admin/monitoring/operations`

Delivery missions:

- `GET /api/delivery/missions`
- `GET /api/delivery/missions/{missionId}`
- `POST /api/delivery/missions`
- `POST /api/delivery/missions/dispatch-ready`
- `POST /api/delivery/missions/expire-stale`
- `POST /api/delivery/missions/couriers/pause`
- `POST /api/delivery/missions/couriers/unpause`
- `GET /api/delivery/missions/couriers/{courierId}/availability`
- `POST /api/delivery/missions/{missionId}/assign`
- `POST /api/delivery/missions/{missionId}/reassign`
- `POST /api/delivery/missions/{missionId}/offer`
- `POST /api/delivery/missions/{missionId}/delivery-pin`
- `POST /api/delivery/missions/{missionId}/cancel`
- `POST /api/delivery/missions/{missionId}/force-problem`
- `POST /api/delivery/missions/{missionId}/resolve-problem`
- `GET /api/delivery/missions/{missionId}/problem-resolutions`

Merchant fulfillment:

- `GET /api/merchant/sub-orders`
- `GET /api/merchant/sub-orders/{subOrderId}`
- `GET /api/merchant/sub-orders/{subOrderId}/sla`
- `GET /api/merchant/sub-orders/{subOrderId}/escalations`
- `POST /api/merchant/sub-orders/{subOrderId}/escalations`
- `POST /api/merchant/sub-orders/sla/publish-overdue`

Relay and hub operations:

- `POST /api/hub/scan/resolve`
- `GET /api/hub/summary`
- `POST /api/hub/lockers/{lockerId}/availability`
- `GET /api/hub/opening-hours`
- `PUT /api/hub/opening-hours`
- `GET /api/hub/control-state`
- `POST /api/hub/control-state`
- `GET /api/hub/control-state/history`
- `GET /api/relay/parcels`
- `GET /api/relay/parcels/{parcelId}`
- `POST /api/relay/parcels/{parcelId}/problem`
- `POST /api/relay/parcels/{parcelId}/return-to-seller`
- `POST /api/relay/parcels/storage-fees/assess`
- `GET /api/relay/parcels/storage-fees`

Returns:

- `GET /api/returns`
- `GET /api/returns/{returnId}`
- `GET /api/returns/orders/{orderId}`
- `POST /api/returns/{returnId}/physical-receipt`
- `POST /api/returns/{returnId}/refund`

Settlements and commissions:

- `GET /api/settlements/merchant-payouts`
- `GET /api/settlements/ledger`
- `POST /api/settlements/merchant-payouts/evaluate-eligible`
- `GET /api/commissions/merchant-overrides/{merchantId}`
- `PUT /api/commissions/merchant-overrides/{merchantId}`
- `DELETE /api/commissions/merchant-overrides/{merchantId}`

Notifications:

- `GET /api/notifications/inbox`
- `PATCH /api/notifications/inbox/{messageId}/read`
- `POST /api/notifications/inbox/{messageId}/archive`
- `DELETE /api/notifications/inbox/{messageId}/archive`
- `GET /api/notifications/preferences/{appFamily}/effective`
- `PUT /api/notifications/preferences/{appFamily}`
- `POST /api/notifications/devices/fcm`
- `DELETE /api/notifications/devices/{appFamily}/{deviceId}`

Payments:

- `POST /api/payments/webhooks/{provider}` exists for provider callbacks. Do not expose this as an employee UI action unless creating a safe read-only webhook-event viewer later.

## Admin UX Rules

Design for repeated use by operations staff.

Use:

- Left sidebar navigation.
- Persistent top bar with search, environment, user menu.
- Dense tables with filters, sorting, status chips, pagination.
- Detail pages with timeline, metadata, linked records, and action panel.
- Charts only where they improve operational decision-making.
- Clear empty, loading, error, and permission-denied states.

Avoid:

- Marketing hero layouts.
- Oversized decorative cards.
- Bright consumer-style visuals.
- Hiding dangerous actions in ambiguous menus.
- Making financial actions look casual.

## Safety And Permissions

The backend enforces role plus ownership, but the frontend should still hide or disable actions the current user cannot perform.

High-risk actions must require:

- A confirmation dialog.
- A reason field.
- A preview of the affected record.
- A clear success/failure result.

High-risk examples:

- Deactivate hub.
- Pause or unpause rider.
- Reassign or cancel delivery mission.
- Force delivery problem state.
- Resolve delivery problem.
- Confirm physical return receipt.
- Trigger refund.
- Change merchant commission.
- Evaluate payout eligibility.
- Change hub control state.
- Delete or revoke sessions.

Do not log or display raw access tokens, refresh tokens, plaintext PINs, FCM tokens, wallet secrets, webhook signatures, or private provider payloads.

## Current Frontend Stack

This project is currently a fresh Vue 3 + Vite + TypeScript app.

Current package hints:

- Vue `^3.5.42`
- Vite `^8.2.2`
- TypeScript `~6.0.0`
- `vue-tsc` for type checking

Recommended additions when building:

- Vue Router for authenticated layouts and detail routes.
- Pinia for auth/session state and global UI state.
- Tailwind CSS for layout and styling.
- A mature table library for operational tables.
- A chart library for dashboards.
- Zod or equivalent runtime validation for API payloads.
- A typed API client around `fetch`.

## API Client Guidance

Use an environment variable for the API origin:

- `VITE_SEQUO_API_BASE_URL=https://api.sequoservices.com`
- local development can point to the Spring Boot server, for example `http://localhost:8080`

Always send:

- `Authorization: Bearer <accessToken>` for protected routes.
- `Content-Type: application/json` for JSON bodies.
- Idempotency keys for retryable workflow and financial actions when required by the endpoint.

Important backend behavior:

- `401` means missing or invalid authentication.
- `403` means wrong role or ownership.
- `429` means rate-limited; respect `Retry-After`.
- Money is integer CFA, never floating point.
- Dates and times are ISO-8601 values.
- The current implemented backend does not use a universal `{ data, meta }` envelope.

## Source Backend Context

This context is derived from:

`/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api`

Most useful backend docs:

- `MOBILE_API_GUIDE.md`
- `SECURITY.md`
- `ARCHITECTURE.md`
- `SETTLEMENTS_AND_RETURNS.md`
- `COMMISSION_MODEL.md`
- `NOTIFICATION_SYSTEM.md`
- `WEBSOCKET_ARCHITECTURE.md`

## Build Priorities For AI Assistants

When asked to build this admin site:

1. Replace the default Vite starter UI completely.
2. Build an internal dashboard, not a public landing page.
3. Start with auth layout, dashboard shell, overview widgets, and a few high-value tables.
4. Add safe action patterns before exposing operational mutations.
5. Use real backend route names from this file.
6. Keep sensitive information masked.
7. Include loading, error, empty, unauthorized, and forbidden states.
8. Run `npm run build` and `npm run type-check` before finishing when dependencies are available.

