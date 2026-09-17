# UX And Security Rules

## UX Direction

The admin app should be calm, dense, and operational.

Use:

- Sidebar navigation.
- Top search.
- Status chips.
- Filterable tables.
- Detail drawers or detail pages.
- Timelines for orders, missions, returns, and settlements.
- Action panels with clear permission states.

Avoid:

- Marketing-style hero sections.
- Oversized decorative cards.
- Hidden destructive actions.
- Ambiguous status language.

## Permission Model

The backend enforces authorization, but the frontend should still make permissions visible.

Examples:

- Support can investigate but may not trigger payouts.
- Finance can work on refunds and settlements.
- Operations can manage delivery and hub workflows.
- Super admin actions should be rare and clearly marked.

## Sensitive Data

Never display or log:

- Access tokens.
- Refresh tokens.
- Passwords.
- Plaintext PINs.
- FCM tokens.
- Wallet secrets.
- Webhook signatures.
- Raw provider payloads containing secrets.

Mask personal information unless an employee needs it for the active workflow.

## Dangerous Action Pattern

Every dangerous action should include:

- Record summary.
- Consequence text.
- Required reason.
- Confirmation button with explicit label.
- Success and failure result.

Examples:

- "Pause rider"
- "Cancel mission"
- "Trigger refund"
- "Change commission"
- "Deactivate hub"

## API Error Handling

- `401`: redirect to login or refresh session.
- `403`: show permission denied and hide action.
- `404`: show not found without leaking whether another user's resource exists.
- `429`: respect `Retry-After`.
- `5xx`: show safe retry messaging and request ID if available.
