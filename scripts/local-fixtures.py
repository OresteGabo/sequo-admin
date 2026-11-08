#!/usr/bin/env python3
"""Explicitly add server-owned scenarios to the retained isolated local workspace, never a remote API."""
import argparse
from datetime import datetime
import json
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

API_URL = "http://127.0.0.1:55840"
WEB_URL = "http://127.0.0.1:5173"
NAMESPACE = "local-ops-v1"
VERSION = 1
DEVICE_ID = "sequo-local-fixtures-cli-v1"
MAX_RESPONSE = 1024 * 1024
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,255}\Z")
PRIVATE_KEY = re.compile(r"token|secret|password|authorization|bearer|session|api.?key", re.I)
ROLES = {"CUSTOMER", "MERCHANT_OWNER", "MERCHANT_STAFF", "COURIER", "RELAY_PARTNER", "SUPPORT_AGENT", "ADMIN", "SUPER_ADMIN"}
CATEGORIES = {"dashboard", "users", "merchants", "catalog", "riders", "orders", "deliveries", "relay", "returns", "payments", "commissions", "negotiations", "cooperatives", "benefits", "notifications", "audit", "settings"}

class FixtureError(Exception):
    pass

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise FixtureError("The local API redirected a request. No redirect or fixture write was followed.")


def _text(value, maximum=4000, allow_empty=False):
    return isinstance(value, str) and len(value) <= maximum and (allow_empty or bool(value.strip())) and not any(ord(char) < 32 and char not in "\n\r\t" for char in value)


def _identifier(value):
    return isinstance(value, str) and bool(SAFE_ID.fullmatch(value))


def _instant(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})", value):
        return False
    try:
        normalized = re.sub(r"\.(\d{1,9})(?=Z|[+-])", lambda match: "." + (match.group(1) + "000000")[:6], value)
        return datetime.fromisoformat(normalized.replace("Z", "+00:00")).utcoffset() is not None
    except ValueError:
        return False


def validate_manifest(value):
    """No raw response or unexpected credential fields can reach the guide/terminal."""
    message = "The local fixture manifest could not be verified. No reset or repair was attempted."
    if not isinstance(value, dict) or value.get("environment") != "LOCAL_FIXTURE" or value.get("namespace") != NAMESPACE or type(value.get("version")) is not int or value["version"] != VERSION:
        raise FixtureError(message)
    if "seededAt" not in value or (value["seededAt"] is not None and not _instant(value["seededAt"])):
        raise FixtureError(message)
    if not _text(value.get("note"), allow_empty=True) or not isinstance(value.get("accounts"), list) or not isinstance(value.get("scenarios"), list) or len(value["accounts"]) > 100 or len(value["scenarios"]) > 100:
        raise FixtureError(message)
    ids = set()
    accounts = []
    for account in value["accounts"]:
        if not isinstance(account, dict) or not _identifier(account.get("id")) or account["id"] in ids or not _text(account.get("name"), 200) or not _text(account.get("purpose"), 1000) or not _text(account.get("email"), 254) or not account["email"].lower().endswith(".invalid") or not isinstance(account.get("roles"), list) or not account["roles"] or any(not isinstance(role, str) or role not in ROLES for role in account["roles"]):
            raise FixtureError(message)
        ids.add(account["id"])
        accounts.append({key: account[key] for key in ("id", "name", "email", "roles", "purpose")})
    scenarios = []
    ids = set()
    for scenario in value["scenarios"]:
        if not isinstance(scenario, dict) or not _identifier(scenario.get("id")) or scenario["id"] in ids or not _text(scenario.get("title"), 200) or not _text(scenario.get("summary"), 2000) or (not isinstance(scenario.get("category"), str) or scenario["category"] not in CATEGORIES) or not isinstance(scenario.get("resourceIds"), dict) or len(scenario["resourceIds"]) > 30 or not isinstance(scenario.get("nextActions"), list) or len(scenario["nextActions"]) > 30 or any(not _text(action, 1000) for action in scenario["nextActions"]) or not isinstance(scenario.get("credentials"), dict) or len(scenario["credentials"]) > 20:
            raise FixtureError(message)
        if any(not _text(key, 64) or key in {"__proto__", "constructor", "prototype"} or PRIVATE_KEY.search(key) or not _identifier(identifier) for key, identifier in scenario["resourceIds"].items()):
            raise FixtureError(message)
        if any(not _text(key, 64) or key in {"__proto__", "constructor", "prototype"} or PRIVATE_KEY.search(key) or not _text(code, 2048) for key, code in scenario["credentials"].items()):
            raise FixtureError(message)
        ids.add(scenario["id"])
        scenarios.append({key: scenario[key] for key in ("id", "title", "summary", "category", "resourceIds", "nextActions", "credentials")})
    return {"environment": "LOCAL_FIXTURE", "namespace": NAMESPACE, "version": VERSION, "seededAt": value.get("seededAt"), "accounts": accounts, "scenarios": scenarios, "note": value["note"]}


class LocalFixtureClient:
    def __init__(self, opener=None):
        # Never inherit HTTP(S)_PROXY or follow a localhost redirect to another service.
        self.opener = opener or build_opener(ProxyHandler({}), NoRedirect())

    def request(self, path, method="GET", body=None, access_token=None):
        if path not in {"/api/admin-auth/development-access", "/api/admin-auth/development-session", "/api/admin/local-fixtures", "/api/admin/local-fixtures/seed", "/api/auth/logout"}:
            raise FixtureError("Unsupported local fixture route.")
        headers = {"Accept": "application/json", "Origin": WEB_URL}
        if access_token:
            if not isinstance(access_token, str) or not re.fullmatch(r"[A-Za-z0-9._~+/-]{1,16384}", access_token):
                raise FixtureError("The local session was not confirmed.")
            headers["Authorization"] = "Bearer " + access_token
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = Request(API_URL + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=45) as response:
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise FixtureError("The local fixture response exceeded its supported size.")
                if response.status == 204:
                    return None
                if response.status not in (200, 201):
                    raise FixtureError("The guarded local API did not confirm the request.")
                try:
                    return json.loads(raw)
                except (ValueError, UnicodeError):
                    raise FixtureError("The local fixture response was not valid JSON.")
        except HTTPError as error:
            raise FixtureError("The guarded local fixture API refused the request (HTTP %s). Restart the updated local launcher if its feature is unavailable; no reset or repair was attempted." % error.code) from None
        except (URLError, TimeoutError, OSError):
            raise FixtureError("The local workspace API is unavailable. Start npm run dev:local first; no other target was contacted.") from None


def seed_local_fixtures(seed=True, client=None):
    client = client or LocalFixtureClient()
    access = client.request("/api/admin-auth/development-access")
    if access != {"enabled": True, "mode": "LOCAL_DEVELOPMENT"}:
        raise FixtureError("Guarded local development access is unavailable. No fixture write was attempted.")
    access_token = refresh_token = None
    try:
        session = client.request("/api/admin-auth/development-session", "POST", {"deviceId": DEVICE_ID, "deviceLabel": "Local fixtures command"})
        if not isinstance(session, dict):
            raise FixtureError("The local administrator session was not confirmed.")
        access_token, refresh_token = session.get("accessToken"), session.get("refreshToken")
        user = session.get("user")
        if not isinstance(access_token, str) or not access_token or not isinstance(refresh_token, str) or not 32 <= len(refresh_token) <= 512 or not isinstance(user, dict) or user.get("active") is not True or user.get("status") != "ACTIVE" or not isinstance(user.get("roles"), list) or any(not isinstance(role, str) for role in user["roles"]) or not {"ADMIN", "SUPER_ADMIN"}.intersection(user["roles"]):
            raise FixtureError("The local administrator session was not confirmed.")
        if seed:
            validate_manifest(client.request("/api/admin/local-fixtures/seed", "POST", {}, access_token))
        manifest = validate_manifest(client.request("/api/admin/local-fixtures", access_token=access_token))
        if seed and manifest["seededAt"] is None:
            raise FixtureError("The server did not confirm installed fixtures. No automatic retry or reset was attempted.")
        return manifest
    finally:
        if isinstance(refresh_token, str) and 32 <= len(refresh_token) <= 512:
            try:
                client.request("/api/auth/logout", "POST", {"refreshToken": refresh_token}, access_token)
            except FixtureError:
                # Never disclose the token or raw HTTP response on cleanup failure.
                pass


def print_summary(manifest):
    state = "installed" if manifest["seededAt"] else "not installed"
    print("LOCAL_FIXTURE scenarios %s: %s accounts, %s scenarios." % (state, len(manifest["accounts"]), len(manifest["scenarios"])))
    print("Open %s and use the local scenario guide for names, IDs and test-only pickup credentials." % WEB_URL)
    print("Existing records are retained. No reset, account repair or real payment was performed.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Read the existing fixture manifest without seeding scenarios")
    args = parser.parse_args(argv)
    manifest = seed_local_fixtures(seed=not args.check)
    print_summary(manifest)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except FixtureError as error:
        print("Local fixtures: " + str(error), file=sys.stderr)
        sys.exit(1)
