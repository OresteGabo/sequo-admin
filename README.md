# Sequo Admin

Private internal dashboard for Sequo employees at `admin.sequoservices.com`.

This project is for operational management, monitoring, support, finance, and admin workflows. It should be secure, dense, fast, and built for repeated daily use.

## What This App Should Do

- Monitor live operational health.
- Manage orders, merchant sub-orders, delivery missions, hubs, relay parcels, returns, settlements, commissions, and notifications.
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
- Runtime validation for API payloads

## Important Docs

- [AI_CONTEXT.md](AI_CONTEXT.md): AI/developer context for this admin app.
- [docs/SEQUO_API_SUMMARY.md](docs/SEQUO_API_SUMMARY.md): copied summary of the implemented Sequo API.
- [docs/OPERATIONS_BRIEF.md](docs/OPERATIONS_BRIEF.md): internal workflows and dashboard scope.
- [docs/UX_AND_SECURITY.md](docs/UX_AND_SECURITY.md): admin UX, permissions, and safety rules.
- [docs/TECH_STACK.md](docs/TECH_STACK.md): recommended dashboard stack and why it fits internal operations.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): local development and API client guidance.
- [docs/ROADMAP.md](docs/ROADMAP.md): suggested build phases.
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): step-by-step tasks from first build to launch.

## Development

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

## API Usage

Use an environment variable:

```text
VITE_SEQUO_API_BASE_URL=https://api.sequoservices.com
```

The backend currently exposes implemented routes under `/api`, not `/api/v1`.

## Build Principle

This is not a landing page. Build it like serious internal software: searchable tables, useful dashboards, precise status labels, safe mutations, and strong permission boundaries.
