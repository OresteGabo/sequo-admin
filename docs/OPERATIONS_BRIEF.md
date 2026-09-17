# Operations Brief

## Purpose

The admin site is Sequo's internal control surface. It should help employees understand what is happening, find operational problems quickly, and take safe action.

## Core Operational Areas

- Orders.
- Merchant sub-orders.
- Delivery missions.
- Rider availability.
- Hubs and relay points.
- Relay parcels.
- Consolidation manifests.
- Returns and refunds.
- Merchant settlements.
- Merchant commission overrides.
- Notifications and outbox health.
- Users, sessions, and roles.
- Audit logs and support investigation.

## First Dashboard Widgets

Prioritize widgets based on the backend monitoring route:

- Delivery capacity.
- Paused couriers.
- Mission alerts.
- Merchant fulfillment status.
- Overdue sub-orders.
- Relay parcel alerts.
- Notification outbox failures.
- Payout queue.
- Return bottlenecks.

Implemented route:

```text
GET /api/admin/monitoring/operations
```

## Important Internal Actions

- Pause or unpause courier.
- Assign or reassign mission.
- Cancel mission.
- Force or resolve mission problem.
- Deactivate or control a hub.
- Update hub opening hours.
- Assess relay storage fees.
- Confirm return physical receipt.
- Trigger refund.
- Evaluate payout eligibility.
- Set or clear merchant commission override.

All high-risk actions need confirmation and reason capture.
