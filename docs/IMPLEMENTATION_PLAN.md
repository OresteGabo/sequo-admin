# Implementation Plan

## Task 1: Confirm Admin Scope

- Read `AI_CONTEXT.md`, `docs/OPERATIONS_BRIEF.md`, and `docs/UX_AND_SECURITY.md`.
- Decide which employee roles are supported in the first version.
- Decide the first operational areas: dashboard, delivery missions, hubs, returns, settlements.

## Task 2: Prepare The App Foundation

- Add Vue Router.
- Add Pinia.
- Add Tailwind CSS.
- Create app layouts for login and protected admin pages.
- Create a typed API client.

## Task 3: Build Authentication

- Add login page using `/api/auth/login`.
- Add auth session state.
- Add token refresh strategy using `/api/auth/refresh`.
- Add logout using `/api/auth/logout`.
- Add protected route guards.

## Task 4: Build The Admin Shell

- Build sidebar navigation.
- Build top bar with user/account controls.
- Add permission-aware navigation.
- Add loading, empty, error, unauthorized, and forbidden states.

## Task 5: Build Overview Dashboard

- Integrate `GET /api/admin/monitoring/operations`.
- Show delivery capacity, mission alerts, merchant fulfillment status, relay alerts, notification failures, payout queue, and return bottlenecks.
- Add refresh behavior.

## Task 6: Build Operational Tables

- Delivery missions.
- Merchant sub-orders.
- Hubs and relay parcels.
- Returns.
- Settlements and commission overrides.
- Notifications.

## Task 7: Build Safe Actions

- Create shared confirmation modal.
- Require reason fields for high-risk actions.
- Add role checks and disabled states.
- Add success/failure feedback.
- Implement actions gradually: pause rider, reassign mission, cancel mission, update hub control, confirm return receipt, trigger refund, set commission override.

## Task 8: Add Detail Pages

- Mission detail with timeline.
- Hub/relay detail.
- Return detail.
- Settlement/payout detail.
- Merchant detail.

## Task 9: Production Hardening

- Mask sensitive data.
- Add request ID display for failures.
- Add audit-context messaging.
- Add robust `401`, `403`, and `429` handling.
- Run `npm run build`.

## Final Task: Launch Review

- Verify every dangerous action requires confirmation.
- Verify permissions are enforced visually and by backend response handling.
- Verify no token, PIN, wallet secret, or webhook signature is exposed.
- Deploy and connect `admin.sequoservices.com`.
