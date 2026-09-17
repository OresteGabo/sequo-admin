# Development Guide

## Local Commands

```sh
npm install
npm run dev
npm run build
```

## Recommended Structure

```text
src/
  api/
  assets/
  components/
    layout/
    tables/
    ui/
  features/
    auth/
    dashboard/
    deliveries/
    hubs/
    merchants/
    orders/
    returns/
    settlements/
  router/
  stores/
  styles/
  types/
```

## Environment

```text
VITE_SEQUO_API_BASE_URL=http://localhost:8080
```

Production:

```text
VITE_SEQUO_API_BASE_URL=https://api.sequoservices.com
```

Vite environment values are public in the browser. Do not put secrets in them.

## API Client Requirements

- Attach `Authorization: Bearer <accessToken>` to protected calls.
- Send `Content-Type: application/json`.
- Use idempotency keys for retryable mutating workflows where required.
- Keep refresh tokens in a secure storage strategy appropriate to the final app environment.
- Centralize `401`, `403`, and `429` handling.

## Suggested First Implementation

1. Login page.
2. Auth store.
3. Protected app layout.
4. Overview dashboard from `/api/admin/monitoring/operations`.
5. Delivery missions table.
6. Hub/relay table.
7. Returns table.
8. Safe action modal component.
