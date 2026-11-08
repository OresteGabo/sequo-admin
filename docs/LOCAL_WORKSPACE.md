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

Flyway migrates the dedicated database before fixture seeding. Only a new synthetic `@fixture.invalid` administrator is inserted, with `ADMIN` and `SUPER_ADMIN`. An existing mismatched identity, disabled account or changed roles causes a failure; restarting never promotes or repairs it. Resolve intentional account changes explicitly. Existing catalog migration samples are reused; no synthetic paid orders, payment bypass, real customer identities or fabricated operational records are added.

Providers remain disconnected. Notification/relay/settlement workers are disabled; referral awards and unapproved delivery mode offers remain disabled. Pending checkout, refund instruction, recorded earnings and real provider transfers remain distinct. No local launch proves external OTP, camera/device, locker, GPS, wallet or bank integration.

Startup diagnostics are in private `.local-workspace/{api-build,database-start,api,fixture-seed,web}.log`. A failed build may need `--online`; a failed Docker start needs the local engine. Read logs locally and redact credentials/identity/session values before sharing. The launcher never prints generated passwords, signing keys or session tokens.

The floating Vue developer toolbar is off by default so the development workspace matches the product layout. For ordinary frontend debugging outside the isolated launcher, opt in with `SEQUO_ADMIN_DEVTOOLS=true npm run dev`. This does not enable development authentication on another API.
