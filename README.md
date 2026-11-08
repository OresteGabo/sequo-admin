# Sequo Admin

Private internal dashboard for Sequo employees at `admin.sequoservices.com`.

This project is for operational management, monitoring, support, finance, and admin workflows. It should be clear enough for daily operations staff to use without knowing anything about code, servers, or backend routes.

## What This App Should Do

- Monitor live operational health.
- Manage orders, merchant packages, courier deliveries, hubs, relay parcels, returns, settlements, commissions, and notifications.
- Support employee roles such as admin, support, operations, and finance.
- Provide safe actions with confirmations, reason fields, and audit awareness.
- Hide or disable actions the current user cannot perform.

## Current Stack

- Vue 3
- Vite
- TypeScript
- `vue-tsc`

Recommended additions:

- Vue Router
- Pinia
- Tailwind CSS
- A table library
- A chart library
- Safe validation before important actions

## Current workspace

The [complete signed-PDF admin review](docs/ADMIN_SIGNED_PDF_REVIEW.md) covers all 13 pages and 153 numbered points, including the added registration, media, relay and delivery-pricing controls.

Open the isolated passwordless workspace with `npm run dev:local`. See [redesign and verification](docs/ADMIN_REDESIGN_VERIFICATION.md), [service controls](docs/ADMIN_CONTROL_INVENTORY.md), and [remaining services/decisions](docs/APP_OPERATIONS_REVIEW.md).

## Important Docs

- [AI_CONTEXT.md](AI_CONTEXT.md): AI/developer context for this admin app.
- [docs/SEQUO_API_SUMMARY.md](docs/SEQUO_API_SUMMARY.md): copied summary of the implemented Sequo API.
- [docs/OPERATIONS_BRIEF.md](docs/OPERATIONS_BRIEF.md): internal workflows and dashboard scope.
- [docs/UX_AND_SECURITY.md](docs/UX_AND_SECURITY.md): admin UX, permissions, and safety rules.
- [docs/TECH_STACK.md](docs/TECH_STACK.md): recommended dashboard stack and why it fits internal operations.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): local development and API client guidance.
- [docs/ROADMAP.md](docs/ROADMAP.md): suggested build phases.
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): step-by-step tasks from first build to launch.

## Release preparation

See [the admin release and local acceptance guide](docs/RELEASE_RECETTE.md) for identifiable archives, public API configuration, fixture-only evidence and outstanding staging/hosting checks.

## Development

For the real isolated API/database and passwordless local administrator, see [Local workspace](docs/LOCAL_WORKSPACE.md): `npm run dev:local`.

Install dependencies:

```sh
npm install
```

Run locally:

```sh
npm run dev
```

Type-check and build:

```sh
npm run build
```

## Staff Experience

The app should speak in operational terms:

- “Orders waiting for merchant action,” not technical order routes.
- “Refund instruction ready,” not endpoint names.
- “Setup needed,” not backend jargon.
- “View only,” when a screen is useful but actions are not ready yet.

Technical configuration belongs in developer docs, not in the visible management interface.

## Build Principle

This is not a landing page or developer console. Build it like serious internal software: searchable tables, useful dashboards, plain-language status labels, safe actions, and strong permission boundaries.

## Optional local scenarios

With the isolated workspace running, run `npm run dev:fixtures` from another terminal to install/reuse guarded practice scenarios in its retained database. Or explicitly opt in at startup with `npm run dev:local -- --with-fixtures`. Default startup does not seed them; no reset, account repair or real payment is performed. The development-only guide lists scenario accounts, IDs and test-only proof values. Start with [the practice guide and installed dataset](docs/LOCAL_PRACTICE_DATA.md), or see [Local workspace](docs/LOCAL_WORKSPACE.md#optional-operational-practice-data).
