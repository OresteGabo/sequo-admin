# Sequo Admin MVP Status

Source contract: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api/docs/contracts/contrat_mvp_sequo.tex`

This file tracks only contract-listed MVP scope for the internal SEQUO web admin app.

| Contract item | Status | Progress | Evidence | Remaining MVP work |
| --- | --- | ---: | --- | --- |
| Internal SEQUO web admin interface | In progress | 65% | `src/App.vue`, route/admin shell | Replace mocked session fallback with production auth if required. |
| Admin dashboard/monitoring | In progress | 70% | Dashboard views and `/api/admin/web` read surface | Add live operational QA and empty/error states. |
| User and role visibility | In progress | 60% | Admin users/roles UI | Add safe mutations only where backend supports them. |
| Merchant management | In progress | 60% | Merchant management UI | Wire production approvals/status updates when endpoints are ready. |
| Orders/deliveries tracking | In progress | 60% | Orders tracking UI | Add more filters/actions as API supports them. |
| Returns/refunds visibility | In progress | 55% | Returns/refunds admin UI | Wire provider refund execution/status once payment adapters exist. |
| Business parameter configuration | In progress | 55% | Settings/business parameters UI | Persist delivery prices, commissions, referrals, relay/return windows through API. |
| Relay controls | In progress | 45% | Admin sections and hub/relay API domains | Add dedicated relay inventory/action controls. |

Recommended verification:

```bash
npm run build
```
