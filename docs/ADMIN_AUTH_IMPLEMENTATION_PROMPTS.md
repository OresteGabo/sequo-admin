# SEQUO Admin Authentication Implementation Prompts

Global project root:

`/Users/muhirwagabooreste/AndroidStudioProjects/SequoService`

Projects:

- Customer app: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/Sequo`
- Vendor app: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/SequoVendor`
- Rider app: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/SequoRider`
- Hub app: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/SequoHub`
- Admin web: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin`
- API/backend source of truth: `/Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api`

Goal:

Implement practical SEQUO Admin authentication for staff who use shared or work computers. The primary login should be phone-approved web login from an already-authenticated SEQUO mobile app. Email one-time code should be a fallback. Google/Apple social login can be optional, but should not be the only admin login path. Passkeys are future-facing and should be documented or hidden behind a safe feature flag.

Important rules for every prompt:

- Do not invent backend routes without first documenting the API contract.
- Read the API source before calling or adding any endpoint.
- Use `/api`, not `/api/v1`.
- Do not display endpoint names, tokens, debug messages, stack traces, or developer wording in the admin UI.
- Do not log access tokens, refresh tokens, OAuth tokens, one-time codes, device tokens, payment tokens, PII, or backend secrets.
- Phone approval must require an already-authenticated mobile session.
- Admin web access must require admin/staff roles where appropriate.
- All user-visible strings must be localized EN/FR in projects that already support localization.
- If a backend capability is missing, add repository/interfaces/local placeholders only where appropriate and document the missing contract.
- Verify with the smallest relevant command at the end of each prompt.
- Commit focused changes after each prompt.

---

## 1. Audit Current Auth System

```text
You are working inside /Users/muhirwagabooreste/AndroidStudioProjects/SequoService.

Task: audit the current authentication system before implementing admin phone-approved login.

Read:
- sequo-api/src/main/kotlin/**/auth/**
- sequo-api/src/main/kotlin/**/AuthController.kt
- sequo-api/MOBILE_API_GUIDE.md
- sequo-api/API_SPEC.md
- Sequo auth implementation
- SequoVendor auth implementation
- SequoRider auth implementation if present
- SequoHub auth implementation if present
- sequo-admin current login implementation

Output only a markdown plan:
- sequo-api/docs/ADMIN_AUTH_IMPLEMENTATION_PLAN.md

Include:
- existing login routes
- existing token model
- existing refresh/logout behavior
- existing user roles/scopes
- where ADMIN/SUPER_ADMIN is checked
- what needs to be added for phone-approved web login
- what can be reused
- what must not be changed

Rules:
- Do not implement code yet.
- Do not invent routes without documenting them first.
- Use /api, not /api/v1.
- Do not expose tokens in docs beyond general explanation.

Verification:
- Run relevant rg scans.
- Confirm no source code changes except the new markdown plan.
- Commit the documentation change.
```

## 2. Design Admin Phone Login Contract

```text
You are working inside /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: create the backend contract for admin phone-approved login.

Create or update:
- docs/ADMIN_PHONE_LOGIN_CONTRACT.md

Design these endpoints:

1. POST /api/admin-auth/login-requests
Purpose: web admin starts a login request.
Request body:
- email: string
- deviceLabel?: string
- browserInfo?: string

Response:
- requestId: UUID/string
- code: short human-readable code, example ZXH-NVB
- expiresAt: ISO timestamp
- pollingIntervalSeconds: int

2. GET /api/admin-auth/login-requests/{requestId}
Purpose: web polls request status.
Response:
- status: PENDING | APPROVED | REJECTED | EXPIRED | CONSUMED
- expiresAt
- approvedAt?
- rejectedAt?

3. GET /api/admin-auth/mobile/login-requests
Purpose: authenticated mobile user sees pending login requests for their email/account.
Requires Bearer token.
Response:
- pending requests safe for display.

4. POST /api/admin-auth/mobile/login-requests/{requestId}/approve
Purpose: authenticated mobile user approves login.
Requires Bearer token and ADMIN/SUPER_ADMIN/staff permission.

5. POST /api/admin-auth/mobile/login-requests/{requestId}/reject
Purpose: authenticated mobile user rejects login.

6. POST /api/admin-auth/login-requests/{requestId}/exchange
Purpose: web exchanges approved request for admin web tokens.
Request:
- code
Response:
- accessToken
- refreshToken
- expiresIn
- user

Security requirements:
- code expires quickly, 2-5 minutes
- one-time use
- rate limited
- approval only from already authenticated mobile session
- email must match approved account or allowed staff identity
- admin roles required for admin web token
- audit every request/approve/reject/exchange
- never log tokens or codes in plaintext after generation
- no raw exception messages in responses

Do not implement code yet.

Verification:
- rg new docs for /api/v1 and remove if present.
- Commit.
```

## 3. Implement Admin Login Request Domain Model

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement backend domain models for admin phone-approved login.

Read:
- docs/ADMIN_PHONE_LOGIN_CONTRACT.md
- existing auth token/session entities
- existing database configuration
- existing repository patterns

Add:
- AdminLoginRequest entity/model
- AdminLoginRequestStatus enum:
  - PENDING
  - APPROVED
  - REJECTED
  - EXPIRED
  - CONSUMED
- fields:
  - id
  - emailNormalized
  - codeHash
  - deviceLabel
  - browserInfo
  - requestedAt
  - expiresAt
  - approvedAt
  - rejectedAt
  - consumedAt
  - approvedByUserId
  - rejectionReason optional
  - createdIpHash optional if current project has request metadata pattern
- repository interface and persistence implementation following existing backend style

Rules:
- Store a hash of the code, not plaintext, if the rest of the backend has hashing helpers.
- If no hash helper exists, add a small internal helper using secure digest/HMAC.
- Do not log the code.
- Keep DB migration consistent with existing migration tool if used.
- Do not break existing auth tests.

Verification:
- Run backend tests or smallest relevant Gradle test command.
- Commit changes with a focused commit message.
```

## 4. Generate Human-Friendly Login Codes

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement secure short admin login code generation.

Requirements:
- Generate a 6-character code using uppercase letters and digits, excluding confusing characters:
  - exclude O, 0, I, 1, L if useful
- Display format should be friendly:
  - ABC-DEF
- Store only a hash/server-side verifier.
- Code must expire.
- Code must be one-time use.
- Add tests for:
  - format
  - length
  - no excluded characters
  - uniqueness over reasonable sample
  - verification success
  - verification failure
  - expiry handling

Rules:
- Do not use Math.random.
- Use cryptographically secure random.
- Do not log generated codes.
- Do not return stack traces.

Verification:
- Run the smallest backend test command that covers this.
- Commit.
```

## 5. Implement Web Login Request Start Endpoint

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement POST /api/admin-auth/login-requests.

Behavior:
- Accept email, optional deviceLabel, optional browserInfo.
- Normalize email.
- If email is invalid, return safe localized/generic error.
- Create a pending login request with short expiry.
- Return requestId, display code, expiresAt, pollingIntervalSeconds.
- Do not reveal whether the email exists if that conflicts with existing auth security policy.
- Apply rate limiting if the project has a rate limiting pattern. If not, add a simple service-level guard and TODO.

Rules:
- Use /api.
- Do not modify existing customer/vendor/rider login behavior.
- Do not log code/token/email unnecessarily.
- Response must be safe for admin web UI.

Tests:
- valid request creates pending login
- invalid email rejected safely
- repeated requests are controlled or expire old ones according to your design
- code not stored in plaintext

Verification:
- Run backend tests.
- Commit.
```

## 6. Implement Web Poll Endpoint

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement GET /api/admin-auth/login-requests/{requestId}.

Behavior:
- Return safe status only:
  - PENDING
  - APPROVED
  - REJECTED
  - EXPIRED
  - CONSUMED
- If expired, mark or report EXPIRED safely.
- Do not return user details, tokens, raw code hash, IP, internal metadata.
- Unknown request should return safe not found response.

Tests:
- pending request returns PENDING
- expired request returns EXPIRED
- approved request returns APPROVED
- consumed request returns CONSUMED
- unknown request safe 404

Verification:
- Run backend tests.
- Commit.
```

## 7. Implement Mobile Pending Login Requests Endpoint

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement GET /api/admin-auth/mobile/login-requests.

Behavior:
- Requires Authorization: Bearer <accessToken>.
- Finds pending login requests for the authenticated user’s email.
- Only returns requests the user can approve.
- User must have admin/staff role allowed to access admin web:
  - ADMIN
  - SUPER_ADMIN
  - or explicitly documented support role if the project already supports it
- Return safe fields:
  - requestId
  - code display
  - deviceLabel
  - browserInfo
  - requestedAt
  - expiresAt

Rules:
- Do not return tokens.
- Do not expose raw backend errors.
- Do not allow a normal customer/merchant/rider to approve admin login unless they also have admin role.

Tests:
- admin sees pending request
- normal user sees none or gets forbidden
- expired requests not shown
- wrong email not shown

Verification:
- Run backend tests.
- Commit.
```

## 8. Implement Mobile Approve/Reject Endpoints

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement:
- POST /api/admin-auth/mobile/login-requests/{requestId}/approve
- POST /api/admin-auth/mobile/login-requests/{requestId}/reject

Behavior:
- Requires Bearer auth.
- Requires ADMIN/SUPER_ADMIN or approved staff role.
- Approve:
  - request must be pending and not expired
  - authenticated user email/identity must match the login request target unless SUPER_ADMIN override is explicitly allowed
  - store approvedByUserId and approvedAt
- Reject:
  - request must be pending and not expired
  - store rejectedAt and optional safe reason
- Both endpoints return safe status.

Rules:
- No token returned from approve endpoint.
- Web must still exchange with requestId + code.
- No raw exception messages.
- Add audit events if project has audit/event pattern.

Tests:
- approve succeeds for matching admin
- approve fails for non-admin
- approve fails expired
- approve fails already consumed
- reject succeeds
- reject prevents exchange

Verification:
- Run backend tests.
- Commit.
```

## 9. Implement Exchange Endpoint

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement POST /api/admin-auth/login-requests/{requestId}/exchange.

Request:
- code

Behavior:
- Validate request exists.
- Validate status APPROVED.
- Validate not expired.
- Validate code matches stored hash.
- Validate not already consumed.
- Issue normal backend auth tokens for admin web session using existing token/session service.
- Mark request CONSUMED.
- Return:
  - accessToken
  - refreshToken
  - expiresIn
  - user safe profile

Rules:
- Token should represent the approved admin user.
- Do not create tokens for non-admin users.
- Do not log tokens/code.
- Use existing token refresh/logout behavior where possible.
- Ensure exchange is one-time.

Tests:
- approved + correct code returns tokens
- wrong code fails safely
- pending request cannot exchange
- rejected request cannot exchange
- expired request cannot exchange
- consumed request cannot exchange twice
- non-admin approval cannot produce token

Verification:
- Run backend tests.
- Commit.
```

## 10. Add Admin Auth API Docs

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: update API docs for admin phone login.

Update:
- MOBILE_API_GUIDE.md if relevant
- API_SPEC.md if relevant
- docs/ADMIN_PHONE_LOGIN_CONTRACT.md

Include:
- endpoint list
- request/response examples without real secrets
- security rules
- expiry behavior
- role requirements
- mobile approval flow
- web polling/exchange flow
- error mapping guidance

Rules:
- Do not include real tokens, client IDs, or secrets.
- Make docs clear enough for mobile/admin app implementation.
- Use /api, not /api/v1.

Verification:
- rg for /api/v1 in new docs.
- Commit.
```

## 11. Implement Admin Web Phone Login UI

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin.

Task: replace temporary staff access key login with phone-approved login UI.

Read:
- sequo-api/docs/ADMIN_PHONE_LOGIN_CONTRACT.md
- current src/App.vue
- current README.md

Login flow:
1. User enters work email.
2. User clicks “Request login code”.
3. Web calls POST /api/admin-auth/login-requests.
4. UI shows:
   - large readable code, e.g. ZXH-NVB
   - expiry countdown
   - instruction: “Open your SEQUO app and approve this login.”
   - retry button after expiry
5. Web polls GET /api/admin-auth/login-requests/{requestId}.
6. When APPROVED, show “Approved. Finishing login…”
7. Call POST /api/admin-auth/login-requests/{requestId}/exchange with code.
8. Store tokens using current admin storage approach.
9. Load admin dashboard.

Rules:
- No raw backend errors in UI.
- No API endpoint text visible to users.
- No “access token” wording visible.
- Keep demo mode only if clearly marked “Demo workspace”.
- Use Material icons where useful.
- Keep UI practical and simple.

Verification:
- npm run build.
- Commit.
```

## 12. Add Admin Web Login Polling Safety

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin.

Task: harden phone login polling.

Requirements:
- Poll only while request is PENDING.
- Stop polling when:
  - APPROVED
  - REJECTED
  - EXPIRED
  - CONSUMED
  - component/page leaves login state
- Respect pollingIntervalSeconds from backend.
- Show friendly messages:
  - pending: “Waiting for approval on your phone.”
  - rejected: “This login was rejected.”
  - expired: “This code expired. Request a new one.”
  - failed: “We could not complete login. Try again.”
- Disable duplicate request buttons while request is loading.
- Add countdown timer.
- Add “Use another email” action.

Rules:
- No raw Throwable/Error.message in UI.
- Do not log tokens or codes.
- Do not reveal backend internals.

Verification:
- npm run build.
- Commit.
```

## 13. Create Shared Mobile Admin Approval Models

```text
You are working across mobile apps:
- Sequo
- SequoVendor
- SequoRider
- SequoHub

Task: create/adapt shared models for admin login approval in each app where shared networking/auth exists.

For each project, inspect existing architecture first.

Models:
- AdminLoginRequestSummary
  - requestId
  - code
  - deviceLabel
  - browserInfo
  - requestedAt
  - expiresAt
- AdminLoginApprovalResult
  - status
  - message key or safe display enum

Repository interface:
- AdminLoginApprovalRepository
  - getPendingLoginRequests()
  - approveLoginRequest(requestId)
  - rejectLoginRequest(requestId)

Rules:
- Use existing network/auth client pattern.
- Bearer token required.
- Do not show raw backend errors.
- All user-visible strings localized EN/FR if the app supports localization.
- Do not add admin UI to public customer flows yet; add structure only.

Verification:
- Run smallest compile command for each touched app.
- Commit each project separately if they are separate git repos.
```

## 14. Implement Mobile API Client For Admin Login Approval

```text
You are working across:
- Sequo
- SequoVendor
- SequoRider
- SequoHub

Task: implement API clients for:
- GET /api/admin-auth/mobile/login-requests
- POST /api/admin-auth/mobile/login-requests/{requestId}/approve
- POST /api/admin-auth/mobile/login-requests/{requestId}/reject

Rules:
- Reuse each app’s existing authenticated HTTP client.
- Use /api, not /api/v1.
- Authorization: Bearer <accessToken>.
- Content-Type: application/json for POST.
- One safe retry if existing auth client supports refresh retry.
- Never log access tokens, refresh tokens, request codes, or device tokens.
- Map backend errors to localized safe messages.

Verification:
- Add focused tests where project has test structure.
- Compile each touched app.
- Commit.
```

## 15. Add Mobile “Admin Login Requests” Screen

```text
You are working across the mobile apps:
- Sequo
- SequoVendor
- SequoRider
- SequoHub

Task: add a small “Admin login requests” screen or sheet.

Behavior:
- Show pending web login requests for the logged-in user.
- Each request displays:
  - login code
  - browser/device label if provided
  - requested time
  - expiry time/countdown
- Buttons:
  - Approve
  - Reject
- Approval copy:
  - “Only approve if the code matches the admin website.”
- Empty state:
  - “No admin login requests.”
- Error state:
  - safe localized message.
- Pull/refresh action if pattern exists.

Rules:
- Must not appear for users without admin/staff role unless backend returns requests.
- Do not show endpoints/API text.
- All strings EN/FR.
- No raw errors.

Verification:
- Compile each app touched.
- Commit.
```

## 16. Add Mobile Notification Entry Point

```text
You are working across:
- Sequo
- SequoVendor
- SequoRider
- SequoHub

Task: add an easy way for staff to find pending admin login approvals.

Options:
- Account/settings row: “Admin login requests”
- Notification/inbox item if notifications already exist
- Small banner if pending requests exist

Requirements:
- Do not disturb normal customers/riders/vendors unless they are admin/staff.
- If user has no pending requests, keep UI quiet.
- Refresh pending requests when app opens or account screen appears.
- Localized EN/FR.

Rules:
- Do not implement push notifications unless existing notification infra is already ready.
- Do not expose backend endpoints.
- Do not show raw errors.

Verification:
- Compile.
- Commit.
```

## 17. Backend Email One-Time Code Contract

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: design email one-time code fallback for admin web login.

Create/update:
- docs/ADMIN_EMAIL_OTP_CONTRACT.md

Endpoints:
1. POST /api/admin-auth/email-codes
Request:
- email
Purpose:
- send one-time login code to email if account is eligible.

2. POST /api/admin-auth/email-codes/verify
Request:
- email
- code
Response:
- accessToken
- refreshToken
- expiresIn
- user

Security:
- Do not reveal whether email exists.
- Admin/staff role required.
- Expire code in 5-10 minutes.
- One-time use.
- Rate limit by email and IP.
- Audit success/failure.
- Do not log code.
- Prefer email fallback only when phone approval is unavailable.

Do not implement yet.

Verification:
- Commit docs.
```

## 18. Implement Backend Email OTP

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: implement admin email one-time code fallback.

Use docs/ADMIN_EMAIL_OTP_CONTRACT.md.

Requirements:
- Generate secure short numeric or alphanumeric code.
- Store only hash/verifier.
- Send through existing email service if available.
- If no email service exists, create interface:
  - AdminEmailCodeSender
  - production placeholder that clearly fails safely or integrates existing mail config
  - fake sender for tests
- Verify role eligibility before issuing tokens.
- Generic responses to prevent account enumeration.

Tests:
- request code for eligible admin
- request code for non-existing email returns generic success but sends nothing
- verify correct code returns tokens
- wrong code fails
- expired code fails
- reused code fails
- non-admin cannot receive usable token

Verification:
- Run backend tests.
- Commit.
```

## 19. Add Admin Web Email OTP Fallback

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin.

Task: add email one-time code fallback to the login UI.

Behavior:
- Primary method remains “Approve from phone”.
- Add secondary action:
  - “I cannot access my phone”
- This opens email code flow:
  1. enter email
  2. request email code
  3. enter code
  4. verify and login
- UI copy must explain:
  - “Use this only when you cannot approve from your SEQUO app.”
- Do not expose backend routes or developer terms.
- Do not show whether account exists.

Rules:
- No raw errors.
- Disable duplicate submit.
- Countdown/resend delay.
- Do not log codes/tokens.

Verification:
- npm run build.
- Commit.
```

## 20. Backend Social Login Audit For Admin Web

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: audit whether existing social login can safely be used for admin web.

Read:
- AuthController
- Google/Apple/Facebook social login implementation
- allowed client IDs config
- role checks
- token/session service

Create/update:
- docs/ADMIN_SOCIAL_LOGIN_AUDIT.md

Answer:
- Can admin web use POST /api/auth/login/social directly?
- Does backend verify allowed Google/Apple client IDs correctly?
- Does /api/auth/me return roles needed by admin web?
- Should admin web have a separate appFamily/client ID?
- What client IDs/config are needed?
- What risks exist on shared work computers?
- Recommendation: social login optional, not primary.

Do not implement code.
Commit docs.
```

## 21. Add Optional Social Login Buttons To Admin Web

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin.

Task: add optional Google and Apple login entry points to admin web if backend audit says it is safe.

Requirements:
- Keep phone approval as primary.
- Social login buttons should be secondary:
  - Continue with Google
  - Continue with Apple
- UI copy:
  - “Use only on a trusted computer.”
- If OAuth client config is missing, show disabled setup-safe state, not broken buttons.
- After social login returns backend tokens, call /api/auth/me or use returned user to verify ADMIN/SUPER_ADMIN.
- If user lacks admin role, logout/clear tokens and show safe error.

Rules:
- Do not store OAuth secrets in frontend.
- Do not log OAuth tokens.
- No raw errors.
- No personal Google/Apple requirement as only path.

Verification:
- npm run build.
- Commit.
```

## 22. Backend Admin Session Hardening

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: harden admin web sessions.

Requirements:
- Admin web tokens should be distinguishable by session/app family if existing auth supports it.
- Add session metadata:
  - appFamily or clientType: SEQUO_ADMIN
  - deviceLabel/browserInfo if available
  - createdAt
  - lastUsedAt if existing session model supports it
- Ensure refresh works for admin web.
- Ensure logout revokes refresh session.
- Ensure /api/auth/sessions does not expose token hashes.

Rules:
- Do not break mobile auth.
- No token logging.
- Tests for refresh/logout with admin sessions.

Verification:
- Run backend tests.
- Commit.
```

## 23. Admin Web Session Refresh/Logout Cleanup

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin.

Task: clean up admin web token lifecycle.

Requirements:
- Store access/refresh tokens using current safest available browser storage pattern.
- Add refresh-and-retry once on 401.
- Logout calls backend logout route and clears local session.
- Failed refresh clears session safely and returns to login.
- Do not display token words to end users.
- Do not log tokens.
- Use user-friendly messages.

Verification:
- npm run build.
- Commit.
```

## 24. Add Admin Auth Audit Events

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: add audit events for admin authentication.

Events:
- admin login request created
- admin login request approved
- admin login request rejected
- admin login request expired
- admin login request exchanged
- admin email OTP requested
- admin email OTP verified
- admin social login success/failure if implemented

Each event should include safe metadata:
- userId if known
- requestId
- event type
- timestamp
- client type
- no tokens
- no raw OTP/code
- no sensitive private data beyond what existing audit policy allows

If no audit system exists:
- create a small AdminAuthAuditService interface
- default implementation logs safe structured messages without secrets
- test fake implementation

Verification:
- Run backend tests.
- Commit.
```

## 25. Add Admin Auth Rate Limiting

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: add rate limiting or abuse protection for admin auth flows.

Protect:
- POST /api/admin-auth/login-requests
- POST /api/admin-auth/login-requests/{requestId}/exchange
- POST /api/admin-auth/email-codes
- POST /api/admin-auth/email-codes/verify

Rules:
- Limit by normalized email.
- Limit by IP/request metadata if project supports it.
- Lock or slow down repeated wrong codes.
- Return generic safe error.
- Do not reveal whether account exists.
- Do not log codes.

Tests:
- repeated requests hit rate limit
- repeated wrong exchange attempts hit rate limit
- valid flow still works
- expired lock clears according to config

Verification:
- Run backend tests.
- Commit.
```

## 26. Add Mobile Approval Push Notification Hook

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: add backend hook to notify mobile apps when an admin login request is created.

Use existing notification system if available.

Requirements:
- When POST /api/admin-auth/login-requests creates a pending request, send an in-app/push notification to eligible admin/staff user.
- App family targeting:
  - SEQUO
  - SEQUO_VENDOR
  - SEQUO_RIDER
  - SEQUO_HUB
  depending on where the user has active device registrations
- Notification content:
  - “Admin login request”
  - “Open the app to approve this login”
- Do not include tokens.
- Code in notification is acceptable only if the backend security design allows it; otherwise say “Open app to verify code.”
- Add notification event type.

Tests:
- notification event created for eligible user
- no notification for non-admin
- no secret/token in notification payload

Verification:
- Backend tests.
- Commit.
```

## 27. Mobile Notification Deep Link To Approval Screen

```text
You are working across mobile apps:
- Sequo
- SequoVendor
- SequoRider
- SequoHub

Task: connect admin login approval notification/deep link to the approval screen.

Requirements:
- If app receives notification for admin login request, opening it navigates to Admin Login Requests screen/sheet.
- If no request exists anymore, show “This request is no longer available.”
- If user lacks role, show safe unavailable message.
- Keep behavior localized EN/FR.
- Do not expose endpoint names.

Rules:
- No direct Firebase server credentials in app.
- Do not log device tokens or auth tokens.
- Reuse existing notification routing pattern.

Verification:
- Compile touched apps.
- Commit.
```

## 28. Passkey Feasibility Contract

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService.

Task: design future passkey support for admin web, but do not implement fully unless project already has WebAuthn dependencies.

Create:
- sequo-api/docs/ADMIN_PASSKEY_AUTH_PLAN.md

Include:
- WebAuthn/passkey registration flow
- WebAuthn/passkey login flow
- backend tables/entities needed
- frontend browser requirements
- recovery policy
- how passkeys relate to phone approval
- why passkeys are future/later, not required for MVP

Rules:
- Do not add dependencies yet.
- Do not implement incomplete passkey code.
- Keep phone approval as MVP primary path.

Commit docs.
```

## 29. Optional Backend Passkey Skeleton Behind Feature Flag

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-api.

Task: only if ADMIN_PASSKEY_AUTH_PLAN.md says dependencies are available or easy to add, create passkey skeleton behind a disabled feature flag.

Endpoints may be documented but should return safe “not enabled” unless fully implemented:
- POST /api/admin-auth/passkeys/register/options
- POST /api/admin-auth/passkeys/register/verify
- POST /api/admin-auth/passkeys/login/options
- POST /api/admin-auth/passkeys/login/verify

Rules:
- Do not ship half-working auth.
- Feature flag default false.
- If disabled, responses are safe and do not confuse users.
- Add TODO docs.

Verification:
- Backend tests.
- Commit.
```

## 30. Admin Web Passkey Placeholder

```text
You are working in /Users/muhirwagabooreste/AndroidStudioProjects/SequoService/sequo-admin.

Task: add future passkey placeholder only if backend feature flag/documentation exists.

Behavior:
- Do not show passkey button by default unless config enables it.
- If enabled but backend says unavailable, hide or show safe “Coming later” in internal config only.
- Do not confuse normal staff.

Rules:
- Phone approval remains primary.
- Email OTP remains fallback.
- Social login remains optional.
- No raw errors.

Verification:
- npm run build.
- Commit.
```

## 31. End-To-End Admin Auth QA

```text
You are working inside /Users/muhirwagabooreste/AndroidStudioProjects/SequoService.

Task: perform end-to-end QA of admin authentication.

Check:
- API phone login request flow
- mobile pending request list
- mobile approve/reject
- web polling
- web exchange
- refresh token flow
- logout
- email OTP fallback
- optional social login if implemented
- passkey placeholder remains hidden or disabled safely

Security scan:
- no token logging
- no raw code logging
- no raw backend errors in UI
- no /api/v1
- no endpoint strings visible in admin UI
- no personal images/assets
- no confusing developer text in admin UI

Run:
- backend tests
- admin npm build
- smallest compile command for each touched mobile app

Update:
- sequo-api/docs/ADMIN_AUTH_IMPLEMENTATION_PLAN.md
- sequo-admin/README.md
- mobile README/docs if changed

Commit final QA/docs changes.
```

## 32. Final Integration Pass

```text
You are working inside /Users/muhirwagabooreste/AndroidStudioProjects/SequoService.

Task: final integration pass for all admin authentication options.

Projects:
- sequo-api
- sequo-admin
- Sequo
- SequoVendor
- SequoRider
- SequoHub

Expected result:
- Admin web primary login uses phone approval.
- Admin web fallback login uses email OTP if phone unavailable.
- Admin web optional Google/Apple login exists only if configured safely.
- Passkey is documented or safely hidden behind feature flag.
- Mobile apps can show and approve/reject admin login requests for eligible admin/staff users.
- Normal users are not confused by admin-only features.
- All visible text is staff-friendly, not developer-facing.
- No personal image assets are shipped.

Verify:
- sequo-api tests pass
- sequo-admin npm run build passes
- touched mobile apps compile
- git status checked in every project
- commits are focused per project

Final report:
- what was implemented
- what is still mocked/local
- exact commands run
- commit hashes
- known follow-up work
```
