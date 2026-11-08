#!/usr/bin/env python3
"""Run an isolated loopback PostgreSQL/API/Vite workspace; never deploy anything."""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import stat
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import Request, urlopen
import uuid
import webbrowser

API_PORT, WEB_PORT, DB_PORT = 55840, 5173, 55924
API_URL = "http://127.0.0.1:%s" % API_PORT
WEB_URL = "http://127.0.0.1:%s" % WEB_PORT
DATABASE = "sequo_admin_dev"
ROLES = ("ADMIN", "SUPER_ADMIN")
DISPLAY_NAME = "Local development administrator"


class WorkspaceError(Exception):
    pass


def clean_environment(source=None):
    """Do not inherit Spring/provider/JWT/Java/Node injection or dotenv settings."""
    source = os.environ if source is None else source
    allowed = ("HOME", "PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "USER", "LOGNAME", "SYSTEMROOT")
    return {key: source[key] for key in allowed if key in source}


def private_write(path, contents):
    if path.is_symlink():
        raise WorkspaceError("Refusing a symlink in the private workspace.")
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(contents)


def validate_settings(settings):
    expected = {"schemaVersion", "workspaceId", "fixtureUserId", "databasePassword", "jwtSecret", "notificationSecret", "adminCodeSecret"}
    if not isinstance(settings, dict) or set(settings) != expected or settings.get("schemaVersion") != 1:
        raise WorkspaceError("Private settings have an unsupported format; nothing was changed.")
    try:
        for key in ("workspaceId", "fixtureUserId"):
            if str(uuid.UUID(settings[key])) != settings[key]:
                raise ValueError()
        for key in ("databasePassword", "jwtSecret", "notificationSecret", "adminCodeSecret"):
            if not re.fullmatch(r"[a-f0-9]{64}", settings[key]):
                raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise WorkspaceError("Invalid private fixture settings; nothing was changed.")
    if len({settings[k] for k in ("databasePassword", "jwtSecret", "notificationSecret", "adminCodeSecret")}) != 4:
        raise WorkspaceError("Private fixture keys must be distinct.")
    return settings


def load_settings(workspace):
    path = workspace / "settings.json"
    if path.is_symlink():
        raise WorkspaceError("Private settings must not be a symlink.")
    if path.exists():
        info = path.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise WorkspaceError("Private settings must belong to you with mode 0600; nothing was changed.")
        try:
            return validate_settings(json.loads(path.read_text()))
        except (json.JSONDecodeError, UnicodeError):
            raise WorkspaceError("Private settings cannot be read; nothing was changed.")
    settings = dict(schemaVersion=1, workspaceId=str(uuid.uuid4()), fixtureUserId=str(uuid.uuid4()))
    settings.update({k: secrets.token_hex(32) for k in ("databasePassword", "jwtSecret", "notificationSecret", "adminCodeSecret")})
    private_write(path, json.dumps(settings, indent=2) + "\n")
    return validate_settings(settings)


def project_name(settings):
    return "sequo-admin-dev-" + settings["workspaceId"].split("-")[0]


def fixture_email(settings):
    return "local-admin-" + settings["fixtureUserId"] + "@fixture.invalid"


def api_properties(settings):
    values = {
        "spring.application.name": "sequo-api-local-admin-fixture",
        "spring.profiles.active": "local",
        "spring.config.import": "",
        "server.address": "127.0.0.1", "server.port": str(API_PORT),
        "server.forward-headers-strategy": "NONE",
        "spring.datasource.url": "jdbc:postgresql://127.0.0.1:%s/%s" % (DB_PORT, DATABASE),
        "spring.datasource.username": DATABASE, "spring.datasource.password": settings["databasePassword"],
        "spring.datasource.driver-class-name": "org.postgresql.Driver",
        "spring.jpa.database-platform": "org.hibernate.dialect.PostgreSQLDialect",
        "spring.jpa.hibernate.ddl-auto": "validate", "spring.flyway.enabled": "true",
        "spring.jpa.open-in-view": "false", "spring.h2.console.enabled": "false",
        "sequo.admin.local-access.enabled": "true",
        "sequo.admin.local-fixtures.enabled": "true",
        "sequo.admin.local-access.environment": "LOCAL_FIXTURE",
        "sequo.admin.local-access.user-id": settings["fixtureUserId"],
        "sequo.auth.jwt.secret": settings["jwtSecret"],
        "sequo.auth.jwt.issuer": "sequo-api-local-admin-fixture",
        "sequo.auth.jwt.audience": "sequo-admin-local-fixture",
        "sequo.auth.jwt.access-expiration": "3600000", "sequo.auth.jwt.refresh-expiration": "2592000000",
        "sequo.admin-auth.code-encryption-secret": settings["adminCodeSecret"],
        "sequo.notifications.token-encryption-secret": settings["notificationSecret"],
        "sequo.security.cors.allowed-origins": WEB_URL + ",http://localhost:5173",
        "sequo.auth.google.allowed-client-ids": "", "sequo.auth.facebook.app-id": "", "sequo.auth.apple.client-id": "",
        "sequo.notifications.outbox-worker.enabled": "false",
        "sequo.notifications.provider-delivery-worker.enabled": "false",
        "sequo.notifications.device-token-pruning.enabled": "false",
        "sequo.delivery.mission-expiry-scheduler.enabled": "false",
        "sequo.delivery.readiness-dispatch-scheduler.enabled": "false",
        "sequo.merchant-fulfillment.sla-warning-scheduler.enabled": "false",
        "sequo.relay.delayed-parcel-scheduler.enabled": "false",
        "sequo.settlements.eligibility-scheduler.enabled": "false",
        "sequo.auth.refresh-session-cleanup.enabled": "false",
        "sequo.delivery.modes.express.enabled": "false", "sequo.delivery.modes.classic.enabled": "false",
        "sequo.delivery.modes.deferred.enabled": "false",
        "sequo.referrals.credit-cfa": "0", "sequo.referrals.approval-reference": "",
    }
    return "# Generated LOCAL_FIXTURE only. Never copy to a deployment.\n" + "".join(k + "=" + v + "\n" for k, v in values.items())


def seed_sql(settings):
    """Only insert our new identity. Any unexpected existing identity/roles abort."""
    user_id, email = settings["fixtureUserId"], fixture_email(settings)
    return """BEGIN;
SELECT pg_advisory_xact_lock(5902440);
DO $fixture$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = '%(id)s' OR email = '%(email)s') THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = '%(id)s' AND email = '%(email)s'
        AND display_name = '%(name)s' AND provider = 'EMAIL' AND status = 'ACTIVE' AND is_active = true)
       OR (SELECT array_agg(role_code ORDER BY role_code) FROM user_roles WHERE user_id = '%(id)s')
          IS DISTINCT FROM ARRAY['ADMIN','SUPER_ADMIN']::varchar[] THEN
      RAISE EXCEPTION 'Existing development identity changed; refusing account promotion or repair';
    END IF;
  ELSE
    INSERT INTO users (id,email,display_name,is_active,provider,status,created_at,updated_at)
      VALUES ('%(id)s','%(email)s','%(name)s',true,'EMAIL','ACTIVE',now(),now());
    INSERT INTO user_roles (user_id,role_code) VALUES ('%(id)s','ADMIN'),('%(id)s','SUPER_ADMIN');
  END IF;
END $fixture$;
COMMIT;
""" % dict(id=user_id, email=email, name=DISPLAY_NAME)


def require_free_port(port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise WorkspaceError("Loopback port %s is busy. Stop its owner; this launcher will not replace it." % port)


def java_home(env):
    candidates = []
    if sys.platform == "darwin":
        found = subprocess.run(["/usr/libexec/java_home", "-v", "21"], env=env, capture_output=True, text=True)
        if found.returncode == 0:
            candidates.append(Path(found.stdout.strip()))
    if os.environ.get("JAVA_HOME"):
        candidates.append(Path(os.environ["JAVA_HOME"]))
    java = shutil.which("java", path=env.get("PATH"))
    if java:
        candidates.append(Path(java).resolve().parent.parent)
    for candidate in candidates:
        binary = candidate / "bin/java"
        if binary.is_file():
            result = subprocess.run([str(binary), "-version"], env=env, capture_output=True, text=True)
            if re.search(r'version "21(?:[.\"-])', result.stderr + result.stdout):
                return candidate
    raise WorkspaceError("JDK 21 is required. Install it or set JAVA_HOME to JDK 21.")


def prerequisites(admin, api, env):
    for command in ("docker", "node", "git"):
        if not shutil.which(command, path=env.get("PATH")):
            raise WorkspaceError("Missing prerequisite: " + command)
    if not (api / "gradlew").is_file() or not (admin / "node_modules/vite/bin/vite.js").is_file():
        raise WorkspaceError("Keep sibling sequo-api and run npm ci in sequo-admin first.")
    version = subprocess.run(["node", "--version"], env=env, capture_output=True, text=True)
    match = re.fullmatch(r"v(\d+)\.(\d+)\.\d+\s*", version.stdout)
    if not match or not ((int(match[1]) == 22 and int(match[2]) >= 18) or (int(match[1]) == 24 and int(match[2]) >= 12) or int(match[1]) > 24):
        raise WorkspaceError("Node must satisfy package.json: ^22.18.0 or >=24.12.0.")
    home = java_home(env)
    compose = subprocess.run(["docker", "compose", "version"], env=env, capture_output=True)
    if compose.returncode:
        raise WorkspaceError("Docker Compose v2 is required.")
    context = subprocess.run(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], env=env, capture_output=True, text=True)
    if context.returncode or not context.stdout.strip().startswith(("unix://", "npipe://")):
        raise WorkspaceError("Select a local Docker context; remote Docker endpoints are refused.")
    docker = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"], env=env, capture_output=True)
    if docker.returncode:
        raise WorkspaceError("Start the local Docker engine, then retry.")
    return home


class Processes:
    def __init__(self):
        self.children = []
        self.logs = []

    def start(self, command, cwd, env, log):
        if log.is_symlink():
            raise WorkspaceError("Refusing a symlink log path.")
        stream = os.fdopen(os.open(str(log), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w")
        os.fchmod(stream.fileno(), 0o600)
        self.logs.append(stream)
        child = subprocess.Popen(command, cwd=str(cwd), env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        self.children.append(child)
        return child

    def run(self, command, cwd, env, log, input_text=None):
        if input_text is None:
            child = self.start(command, cwd, env, log)
            status = child.wait()
        else:
            if log.is_symlink():
                raise WorkspaceError("Refusing a symlink log path.")
            with os.fdopen(os.open(str(log), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as stream:
                os.fchmod(stream.fileno(), 0o600)
                child = subprocess.Popen(command, cwd=str(cwd), env=env, stdin=subprocess.PIPE, stdout=stream, stderr=subprocess.STDOUT, text=True, start_new_session=True)
                self.children.append(child)
                child.communicate(input_text)
                status = child.returncode
        if status:
            raise WorkspaceError("A local workspace step failed. Private diagnostic log: " + str(log))

    def stop(self):
        for child in reversed(self.children):
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                except ProcessLookupError:
                    pass
        for stream in self.logs:
            stream.close()


def wait_http(url, child, timeout=100, origin=None):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if child.poll() is not None:
            raise WorkspaceError("Local service exited. Check its private workspace log.")
        try:
            request = Request(url, headers={"Origin": origin} if origin else {})
            with urlopen(request, timeout=2) as response:
                if response.status == 200:
                    return response.read()
        except (URLError, TimeoutError, OSError):
            pass
        time.sleep(0.5)
    raise WorkspaceError("Local service did not become ready. Check its private workspace log.")


def generated_vite_config(admin):
    # Only this private launcher config proxies the authenticated local module.
    # Retain the browser Origin; do not synthesize forwarded identity headers.
    proxy = {
        path: {"target": API_URL, "changeOrigin": True, "xfwd": False}
        for path in ("/api", "/relay-operator.html", "/relay-operator.js")
    }
    local = {
        "root": str(admin),
        "envDir": False,
        "server": {
            "host": "127.0.0.1", "port": WEB_PORT, "strictPort": True,
            "proxy": proxy,
        },
    }
    return (
        "import base from " + json.dumps(str(admin / "vite.config.ts")) + ";\n"
        "const local = " + json.dumps(local) + ";\n"
        "export default {...base, ...local};\n"
    )


def run_fixture_seed():
    spec = importlib.util.spec_from_file_location("local_fixtures", Path(__file__).with_name("local-fixtures.py"))
    client = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(client)
    try:
        manifest = client.seed_local_fixtures()
    except client.FixtureError as error:
        raise WorkspaceError(str(error)) from None
    client.print_summary(manifest)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check prerequisites only; do not create files/start services")
    parser.add_argument("--prepare-only", action="store_true", help="Generate private configuration and build API; do not start services")
    parser.add_argument("--online", action="store_true", help="Allow Gradle dependency downloads (default uses cached offline tools)")
    parser.add_argument("--with-fixtures", action="store_true", help="Explicitly seed guarded local scenarios after startup; never reset existing data")
    parser.add_argument("--no-browser", action="store_true", help="Print the local URL without opening a browser")
    args = parser.parse_args(argv)
    admin = Path(__file__).resolve().parent.parent
    api = admin.parent / "sequo-api"
    workspace = admin / ".local-workspace"
    env = clean_environment()
    home = prerequisites(admin, api, env)
    if args.check:
        print("Prerequisites ready: JDK 21, local Docker Compose, Node/Vite and sibling API.")
        return 0
    if workspace.is_symlink():
        raise WorkspaceError("Private workspace must not be a symlink.")
    workspace.mkdir(mode=0o700, exist_ok=True)
    if workspace.stat().st_uid != os.getuid():
        raise WorkspaceError("Private workspace must belong to the current user.")
    workspace.chmod(0o700)
    lock_path = workspace / "run.lock"
    if lock_path.is_symlink():
        raise WorkspaceError("Workspace lock must not be a symlink.")
    lock = os.fdopen(os.open(str(lock_path), os.O_WRONLY | os.O_CREAT, 0o600), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise WorkspaceError("This private workspace already has a launcher running.")
    settings = load_settings(workspace)
    private_write(workspace / "api.properties", api_properties(settings))
    private_write(workspace / "compose.env", "SEQUO_WORKSPACE_ID=" + settings["workspaceId"] + "\nPOSTGRES_PASSWORD=" + settings["databasePassword"] + "\n")
    private_write(workspace / "vite.config.mjs", generated_vite_config(admin))
    env.update(JAVA_HOME=str(home), PATH=str(home / "bin") + os.pathsep + env.get("PATH", ""))
    build_env = dict(env, SEQUO_RELEASE_ID="sequo-admin-local-development")
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(api), env=env, capture_output=True, text=True)
    if revision.returncode == 0:
        build_env["SEQUO_SOURCE_REVISION"] = revision.stdout.strip()
    processes, database_started = Processes(), False
    compose = ["docker", "compose", "--project-name", project_name(settings), "--file", str(admin / "compose.local-workspace.yaml"), "--env-file", str(workspace / "compose.env")]
    try:
        if not args.prepare_only:
            require_free_port(API_PORT)
            require_free_port(WEB_PORT)
            # Refuse an unrelated DB listener, including a previous manually-run fixture.
            running = subprocess.run(compose + ["ps", "--status", "running", "--quiet", "postgres"], cwd=str(workspace), env=env, capture_output=True, text=True)
            if running.returncode:
                raise WorkspaceError("Cannot inspect the dedicated local database project.")
            if not running.stdout.strip():
                require_free_port(DB_PORT)
        print("Building the sibling API with JDK 21 (" + ("online" if args.online else "offline cache") + ").")
        gradle = [str(api / "gradlew"), "--no-daemon"] + ([] if args.online else ["--offline"]) + ["bootJar"]
        processes.run(gradle, api, build_env, workspace / "api-build.log")
        jars = [p for p in (api / "build/libs").glob("*.jar") if not p.name.endswith("-plain.jar")]
        if len(jars) != 1:
            raise WorkspaceError("Expected one Spring Boot JAR in the sibling API build/libs.")
        target = workspace / "api.jar"
        if target.is_symlink():
            raise WorkspaceError("Private API copy must not be a symlink.")
        shutil.copyfile(jars[0], target)
        target.chmod(0o600)
        if args.prepare_only:
            print("Prepared private configuration and API JAR. No services started.")
            return 0
        print("Starting isolated PostgreSQL 16 on loopback (existing data retained).")
        database_started = True
        processes.run(compose + ["up", "-d", "--wait", "--wait-timeout", "90", "postgres"], workspace, env, workspace / "database-start.log")
        require_free_port(API_PORT)
        api_process = processes.start([str(home / "bin/java"), "-jar", str(target), "--spring.config.location=" + (workspace / "api.properties").as_uri()], workspace, env, workspace / "api.log")
        wait_http(API_URL + "/actuator/health", api_process)
        # Flyway has completed before a synthetic privileged identity is inserted.
        processes.run(compose + ["exec", "-T", "postgres", "psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--username", DATABASE, "--dbname", DATABASE], workspace, env, workspace / "fixture-seed.log", seed_sql(settings))
        enabled = json.loads(wait_http(API_URL + "/api/admin-auth/development-access", api_process, origin=WEB_URL))
        if enabled != {"enabled": True, "mode": "LOCAL_DEVELOPMENT"}:
            raise WorkspaceError("The API did not enable its guarded local development access.")
        if args.with_fixtures:
            run_fixture_seed()
        vite_env = dict(env, VITE_SEQUO_API_BASE_URL=API_URL)
        require_free_port(WEB_PORT)
        vite = processes.start(["node", str(admin / "node_modules/vite/bin/vite.js"), "--config", str(workspace / "vite.config.mjs"), "--mode", "local-workspace"], workspace, vite_env, workspace / "web.log")
        wait_http(WEB_URL, vite, timeout=40)
        print("Local workspace ready: " + WEB_URL)
        print("Choose the local development sign-in button. Providers remain disconnected; no real payment is executed.")
        if not args.with_fixtures:
            print("For optional local practice scenarios, run npm run dev:fixtures in another terminal.")
        print("Ctrl-C stops only these services; the dedicated database volume is retained.")
        if not args.no_browser:
            webbrowser.open(WEB_URL)
        while True:
            if api_process.poll() is not None or vite.poll() is not None:
                raise WorkspaceError("A local service stopped. Check the private workspace logs.")
            time.sleep(0.5)
    finally:
        # npm/the terminal can forward the same interrupt more than once. Finish
        # owned cleanup before allowing another interrupt to abort the parent.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            processes.stop()
            if database_started:
                # Never down, delete volumes, alter another project's containers, or kill a port owner.
                try:
                    result = subprocess.run(compose + ["stop", "--timeout", "10", "postgres"], cwd=str(workspace), env=env, capture_output=True, timeout=30)
                except subprocess.TimeoutExpired:
                    raise WorkspaceError("Owned database stop timed out; use the documented workspace stop command.")
                if result.returncode:
                    raise WorkspaceError("Owned database stop failed; use the documented workspace stop command.")
        finally:
            lock.close()



def interrupt(signum, frame):
    raise KeyboardInterrupt()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupt)
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nLocal services stopped. Database data retained.")
        sys.exit(0)
    except WorkspaceError as error:
        print("Local workspace: " + str(error), file=sys.stderr)
        sys.exit(1)
