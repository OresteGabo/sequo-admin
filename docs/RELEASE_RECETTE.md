# Admin web release and local acceptance

The existing Vue/Vite app remains the admin surface. `release.json` inside the built website identifies the artifact; the small sidebar label helps an operator report the release ID and environment. Package version `0.0.0` is not used as release evidence.

## Local fixture artifact

From the repository root, with the lockfile dependencies already installed:

```sh
npm run release:prepare -- --release-id sequo-mvp-rc-20261108-01 --environment LOCAL_FIXTURE --same-origin-fixture --output /tmp/sequo-task28-admin-release
NODE_PATH=/opt/homebrew/lib/node_modules/@google/gemini-cli/node_modules npm run release:verify -- /tmp/sequo-task28-admin-release
```

The installed Chrome executable is used by default. Set `CHROME_PATH` for an equivalent local installation. The existing fixture scripts require `puppeteer-core`; the `NODE_PATH` above points to the already available tool dependency on this workstation. No browser package is downloaded by these commands.

`release:prepare` derives the Git commit itself, records the actual tracked-tree hash, dirty state and package-lock hash, runs type checking and the production build, then creates:

- `dist/release.json`: release ID, source identity, build time, environment and public API choice.
- `dist/files.sha256`: every built website file, including `release.json`.
- A `sequo-admin-<releaseId>-<commit>.tar.gz` containing only `dist` files, plus its SHA-256 sidecar.
- `release-build-report.json` and build/type logs in the external output directory.

The final release command requires a clean working tree. For a pre-commit **local candidate only**, add `--allow-dirty-local-fixture` and use a separate output directory. That candidate is labelled dirty and is not the final committed release.

`release:verify` checks the archive and built-file manifest, runs all existing Node read tests and the seven local browser fixtures, then checks artifact integrity again. `web-acceptance.json` ties the commands and logs to the release ID and archive hash. These fixtures use intercepted local HTTP only. They do not prove a deployed staging host, real accounts, devices or external providers.

## Staging preparation

No staging host, hosting access, API origin or credentials are inferred from the example domains in older repository notes. Once the authorized operator supplies the actual target, the same builder accepts:

```sh
npm run release:prepare -- --release-id <approved-release-id> --environment STAGING --api-origin <actual-https-api-origin> --output <absolute-external-directory>
```

The API value must be an HTTPS origin without credentials, path, query or fragment. Missing configuration, loopback and known placeholder domains fail before building. Browser environment values are public; never put access tokens, passwords, provider keys or signing secrets in `VITE_*` values.

Hosting requirements to verify on the selected provider:

1. Serve only the extracted built website over HTTPS. Keep source, environment files, logs and acceptance reports outside the web root.
2. Serve `release.json` and `index.html` with revalidation/no-store appropriate to release refresh; hashed `/assets/` files may be immutable. Ensure a rollout serves one complete artifact and that rollback restores the matching archive.
3. Configure API TLS/reverse proxy and exact admin-origin CORS on the API. Confirm the relay link reaches the API-hosted `/relay-operator.html` without forwarding admin tokens in URLs.
4. Read `/release.json` from the deployed host and compare release ID, commit and file hashes with the handed-off artifact. Check refresh/reload after rollout and rollback.
5. With authorized staging identities, verify sign-in/refresh/logout, admin-only calls and missing/expired/non-admin denial, then execute the agreed operational acceptance matrix on staging fixtures. Keep credentials and customer data out of reports.

The admin artifact cannot enable provider transport or mark a payment paid. Provider execution and live paid launch remain unavailable until the required operator access, specifications and approved configuration are supplied and verified. The root release package records the remaining acceptance and hosting decisions.
