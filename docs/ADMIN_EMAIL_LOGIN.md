# Hosted admin email login

Production now defaults to https://api.sequoservice.com when VITE_SEQUO_API_BASE_URL is unset. The previous hosted bundle fell back to the browser machine’s localhost:8080. Local Vite development retains that localhost default, and the isolated workspace supplies its explicit loopback fixture origin.

A configured VITE_SEQUO_API_BASE_URL remains an explicit public override. For a hosted deployment it must be the approved reachable HTTPS API, with matching CORS on the server. Never place an email provider key in a VITE variable. Email delivery lives only in the API.

HTTP 503 on email-code requests shows a clear unavailable message rather than starting a code-entry countdown. Generic successful requests still do not reveal whether an account exists. Existing code, device, expiry and authorization checks remain in the API. The UI does not grant privileges for a typed email.

The owner requested testing with orestegabo@icloud.com. Live testing still requires hosted API readiness, a verified sending domain/key and an active authorized admin account. No test or local fixture token may be used on the hosted deployment. Provider preparation and validation are documented in ../sequo-api/docs/ADMIN_EMAIL_LOGIN.md.

Validation: production type check/build passed; the output contains the canonical HTTPS API and no localhost:8080 fallback. Backend focused authentication regression and bootJar passed (45 tests). Inbox delivery and hosted authentication remain unverified pending secure external configuration.
