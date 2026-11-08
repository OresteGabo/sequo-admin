# Local admin workspace

Run a real local API/database and the admin web app without email codes or a password:

```sh
npm ci
npm run dev:local
```

The launcher opens **http://127.0.0.1:5173**. Click **local development sign-in**. This creates the ordinary authenticated server session for a synthetic fixture administrator; routes still enforce their normal permissions. It does not approve payments or impersonate a customer, merchant or rider.

Prerequisites: Python 3.9+, Node supported by `package.json`, JDK 21, local Docker Engine/Desktop with Compose v2, and sibling `../sequo-api`. The default build uses cached Gradle dependencies. On a clean machine, allow downloads once:

```sh
npm run dev:local -- --online
```

Useful noninteractive checks:

```sh
npm run dev:local -- --check
npm run dev:local -- --prepare-only
npm run dev:local -- --no-browser
python3 scripts/local-workspace.test.py
```

With the workspace running, a separate terminal can run `python3 scripts/local-workspace-smoke.py`. It checks real local sign-in/reads, denied origins/tokens, disconnected providers and seed replay. Its role/identity tampering cases are enclosed in rolled-back transactions against only this fixture. It prints no credentials.

`--check` validates prerequisites only. `--prepare-only` generates private configuration and builds/copies the API JAR without starting services. It may need `--online` for the first build. `--no-browser` runs all services and prints the URL.

The launcher fixes these isolated targets:

| Service | Local target |
| --- | --- |
| Admin web | `127.0.0.1:5173` |
| API | `127.0.0.1:55840` |
| PostgreSQL 16 | `127.0.0.1:55924`, database `sequo_admin_dev` |
| Allowed browser origins | `http://127.0.0.1:5173`, `http://localhost:5173` |

Busy ports are refused; other services are never killed. Use the printed `127.0.0.1` URL rather than a LAN hostname, proxy or public tunnel. The local session route deliberately refuses remote/proxy access. The actual API's [development access contract](../../sequo-api/docs/DEVELOPMENT_ADMIN_ACCESS.md) documents those boundaries.

Press **Ctrl-C** to stop the launcher-owned API/Vite processes and only this workspace's Compose database service. Its dedicated volume is **retained**. Start the same command again to restore the same data, keys and fixture identity. There is no reset/drop/down-with-volumes action. If interrupted by an uncatchable process kill, run the same launcher again after stopping any orphan API/Vite process you own; it refuses occupied ports. To stop only the retained database when the launcher is no longer running:

```sh
python3 - <<'PY'
import json, subprocess
from pathlib import Path
p = Path('.local-workspace')
settings = json.loads((p / 'settings.json').read_text())
project = 'sequo-admin-dev-' + settings['workspaceId'].split('-')[0]
subprocess.run(['docker','compose','--project-name',project,'--file','compose.local-workspace.yaml',
                '--env-file',str(p / 'compose.env'),'stop','postgres'], check=True)
PY
```

`.local-workspace/` is ignored by Git. The directory is private (`0700`), and generated keys/settings/configuration/logs use `0600`. Do not commit, upload or screenshot this directory. It contains disposable local keys, not deployment credentials. Keep it to retain the existing database password and identity; deleting only its settings will not safely reset the existing volume.

The API runs with its generated private properties as its **only** config location and with a sanitized environment. It does not read the repository's optional `application-secret.properties`, `.env` files or inherited provider/JWT settings. Vite dotenv loading is disabled; only the explicit public loopback API target is supplied. Compose receives an explicit private env file and refuses a remote Docker context. These choices leave ordinary production/staging configuration unchanged.

Flyway migrates the dedicated database before fixture seeding. Only a new synthetic `@fixture.invalid` administrator is inserted, with `ADMIN` and `SUPER_ADMIN`. An existing mismatched identity, disabled account or changed roles causes a failure; restarting never promotes or repairs it. Resolve intentional account changes explicitly. The default launch retains the administrator-only bootstrap and existing catalog migration samples. Optional operational practice scenarios can now be installed explicitly through the guarded local API, as described below. This is an added opt-in capability; it does not run automatically, execute real payments, or change provider guards.

Providers remain disconnected. Notification/relay/settlement workers are disabled; referral awards and unapproved delivery mode offers remain disabled. Pending checkout, refund instruction, recorded earnings and real provider transfers remain distinct. No local launch proves external OTP, camera/device, locker, GPS, wallet or bank integration.

Startup diagnostics are in private `.local-workspace/{api-build,database-start,api,fixture-seed,web}.log`. A failed build may need `--online`; a failed Docker start needs the local engine. Read logs locally and redact credentials/identity/session values before sharing. The launcher never prints generated passwords, signing keys or session tokens.

The floating Vue developer toolbar is off by default so the development workspace matches the product layout. For ordinary frontend debugging outside the isolated launcher, opt in with `SEQUO_ADMIN_DEVTOOLS=true npm run dev`. This does not enable development authentication on another API.

## Optional operational practice data

See the [practice guide](LOCAL_PRACTICE_DATA.md) for the installed records, first actions and verification evidence.

Start the workspace normally, then populate its **existing retained database** from another terminal in sequo-admin:

```sh
npm run dev:fixtures
```

Alternatively, explicitly install/reuse the scenarios during startup:

```sh
npm run dev:local -- --with-fixtures
```

The ordinary `npm run dev:local` command still does not install these scenarios. The generated isolated API configuration enables the fixture endpoint only; `--with-fixtures` or `npm run dev:fixtures` is the deliberate seeding action. If an older running API does not recognize this feature, stop/restart the launcher with updated code first. Its dedicated volume and existing work are retained. `--check` and `--prepare-only` retain their existing behavior and do not seed scenarios.

The command uses only `127.0.0.1:55840`, with the configured local web Origin; it accepts no remote target option, disables inherited HTTP proxies and refuses redirects. It checks guarded development access, obtains a normal temporary administrator session, sends an empty request to `/api/admin/local-fixtures/seed`, then reads `/api/admin/local-fixtures`. It does not choose IDs, amounts or payment results, issue provider calls, execute payment SQL, reset the database, or repair changed accounts. Session tokens stay in process memory, are never printed or saved by this command, and its refresh session is signed out afterward when the API remains available.

The backend owns the fixed `LOCAL_FIXTURE` / `local-ops-v1` scenario manifest and applies its stricter runtime guards. Re-running the command reuses the same scenario records and preserves edits; it does not reset your practice results. An unexpected conflicting identity or unmanaged row is an error to inspect, not permission to overwrite it. There is no reset/drop option.

After signing into the development workspace, the local scenario guide shows named `.invalid` identities, real local record IDs, suggested next actions and deliberately exposed **test-only** parcel/PIN/proof values. It reads the guarded manifest rather than fabricating client rows; refresh it after installing scenarios. Tokens, signing secrets and provider credentials are never shown. These names/IDs are not additional SSO or email-login credentials.

A read-only manifest check is available without installing scenarios:

```sh
npm run dev:fixtures -- --check
python3 scripts/local-fixtures.test.py
node --test tests/localFixtures.test.mjs
```

The scenarios are local practice data. Recorded pending/paid/order/ledger states, where the backend scenario defines them, describe its isolated fixture evidence and normal server transitions; they do not represent real provider execution or production approvals. Payment integration/simulation guards remain unchanged, notification workers stay disabled and no email/SMS/real funds are sent.
