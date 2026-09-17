# Tech Stack

## Recommended Stack

- Vue 3
- Vite
- TypeScript
- Vue Router
- Pinia
- Tailwind CSS
- TanStack Table or AG Grid
- ECharts, Recharts-equivalent Vue wrapper, ApexCharts, or Chart.js
- Zod or another runtime validation library
- A typed API client around `fetch`
- Vercel, Render, Fly.io, Cloudflare, or the same infrastructure used by Sequo API

## Why This Stack Fits

Vue 3 is a good fit because the admin app is component-heavy: dashboards, tables, filters, detail pages, timelines, status chips, modals, and action panels. Vue keeps those pieces readable and maintainable.

Vite is a good fit because the current project is already a Vite app and the admin dashboard can be a client-side app talking to the Sequo API. It keeps development fast and avoids unnecessary framework complexity at this stage.

TypeScript is important for the admin app because mistakes can affect real operations: refunds, rider pauses, hub deactivation, delivery reassignment, settlements, and commission changes. Typed request and response models reduce accidental misuse.

Vue Router is required because the admin site should have protected routes, layouts, detail pages, and role-aware navigation.

Pinia is recommended because admin apps need shared state: authenticated user, access token/session state, roles, environment, sidebar state, filters, and possibly cached preferences.

Tailwind CSS is recommended because internal tools need dense, consistent layouts. It helps build tables, sidebars, dashboards, and forms without a slow custom CSS process.

TanStack Table or AG Grid is recommended because admin workflows depend on serious tables: sorting, filtering, pagination, column control, and row actions. Basic hand-built tables will become painful quickly.

A chart library is useful for operational dashboards: mission capacity, payout queue, delayed parcels, notification failures, return bottlenecks, and order status distribution.

Runtime validation is recommended because the admin UI will call many endpoints and should fail safely when an API response changes or when a form payload is invalid.

## Security Stack Considerations

The frontend should not be trusted as the source of authorization. The Sequo API must enforce roles and ownership. The admin frontend should still hide or disable actions based on roles to reduce mistakes.

Never store production secrets in the frontend. Vite environment variables are public after build.

## What Not To Add Too Early

- A generic admin template that fights Sequo's domain workflows.
- Complex global state before routes and API boundaries are clear.
- Financial actions without confirmation and reason capture.
- Direct calls to webhook endpoints from employee UI.

